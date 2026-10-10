import assert from 'node:assert/strict';

import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { test } from 'vitest';

import { PermitApiError } from '#src/api/base';
import { PermitContextError } from '#src/api/context';
import { Permit, type RoleCreateBulk } from '#src/index';

const roles: RoleCreateBulk[] = [
  {
    key: 'reader',
    name: 'Reader',
    permissions: ['document:read'],
    attributes: { enabled: false, limit: 0, note: null },
  },
  {
    key: 'editor',
    name: 'Editor',
    resource: 'document/a?b+c=%é',
    description: '',
    permissions: ['read', 'write'],
    extends: ['reader'],
    granted_to: {
      users_with_role: [{ role: 'owner', on_resource: 'folder', linked_by_relation: 'parent' }],
      when: { no_direct_roles_on_object: false },
    },
    v1compat_settings: { retained: false },
    v1compat_attributes: { nullable: null },
  },
];
for (const role of roles) Object.freeze(role);
Object.freeze(roles);
const path = 'https://control.example/v2/schema/project%2Fone/environment%20east/bulk/roles';

interface Request {
  method: string | undefined;
  url: string;
  data: unknown;
  headers: AxiosHeaders;
}
function response(config: InternalAxiosRequestConfig, data: unknown, status = 200) {
  return { data, status, statusText: 'Fixture response', headers: new AxiosHeaders(), config };
}
function wire(proxyFactsViaPdp = true) {
  const calls: Request[] = [];
  const reply: { data: unknown; status: number } = {
    data: { created: ['reader'], updated: ['document#editor'] },
    status: 200,
  };
  const permit = new Permit({
    token: 'bulk-role-fixture',
    apiUrl: 'https://control.example',
    pdp: 'https://pdp.invalid',
    proxyFactsViaPdp,
    retry: false,
    log: { level: 'silent' },
    axiosInstance: axios.create({
      adapter: async (config) => {
        calls.push({
          method: config.method,
          url: axios.getUri(config),
          data: config.data,
          headers: new AxiosHeaders(config.headers),
        });
        const result = response(config, reply.data, reply.status);
        if (reply.status >= 400)
          throw new AxiosError(
            'Bulk role request rejected',
            'ERR_BAD_RESPONSE',
            config,
            undefined,
            result,
          );
        return result;
      },
    }),
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org');
  permit.config.apiContext.setEnvironmentLevelContext('org', 'project/one', 'environment east');
  return { permit, calls, reply };
}

test.each([true, false])(
  'bulk roles use the exact direct schema contract (proxy %s)',
  async (proxy) => {
    const { permit, calls, reply } = wire(proxy);
    const original = JSON.stringify(roles);
    reply.data = {
      created: ['one', 'two', 'one'],
      updated: ['three', 'four'],
      future: { nullable: null },
    };
    expect(await permit.api.roles.bulkCreateOrReplace(roles)).toEqual(reply.data);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('put');
    expect(calls[0]?.url).toBe(path);
    expect(calls[0]?.data).toBe(JSON.stringify({ operations: roles }));
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer bulk-role-fixture');
    expect(calls[0]?.headers.get('content-type')).toContain('application/json');
    expect(calls[0]?.headers.has('x-wait-timeout')).toBe(false);
    expect(calls[0]?.headers.has('x-timeout-policy')).toBe(false);
    expect(JSON.stringify(roles)).toBe(original);
    expect('waitForSync' in permit.api.roles).toBe(false);
  },
);

test('empty bulk operations dispatch and retain both empty result arrays', async () => {
  const { permit, calls, reply } = wire();
  reply.data = { created: [], updated: [] };
  expect(await permit.api.roles.bulkCreateOrReplace([])).toEqual(reply.data);
  expect(calls[0]?.data).toBe('{"operations":[]}');
  expect(calls).toHaveLength(1);
});

test('duplicate role operations remain intact for server validation', async () => {
  const { permit, calls, reply } = wire();
  reply.status = 422;
  reply.data = { detail: 'Duplicate role keys' };
  const duplicates = [
    { key: 'reader', name: 'First' },
    { key: 'reader', name: 'Second' },
  ];
  await assert.rejects(() => permit.api.roles.bulkCreateOrReplace(duplicates), {
    name: 'PermitApiError',
    status: 422,
  });
  expect(calls[0]?.data).toBe(JSON.stringify({ operations: duplicates }));
});

test.each([401, 403, 404, 409, 422, 500, 503])(
  'HTTP %s preserves named bulk failure',
  async (status) => {
    const { permit, calls, reply } = wire();
    reply.status = status;
    reply.data = { detail: 'Rejected batch', trace: 'public-fixture' };
    try {
      await permit.api.roles.bulkCreateOrReplace(roles);
      assert.fail('HTTP rejection was swallowed');
    } catch (error) {
      expect(error).toBeInstanceOf(PermitApiError);
      if (!(error instanceof PermitApiError)) throw error;
      expect(error.status).toBe(status);
      expect(error.code).toBe('ERR_BAD_RESPONSE');
      expect(error.formattedAxiosError.error).toEqual({ detail: 'Rejected batch' });
      expect(JSON.stringify(error)).not.toContain('public-fixture');
    }
    expect(calls).toHaveLength(1);
  },
);

test.each(['organization', 'project'])(
  'bulk write refuses unselected environment: %s',
  async (level) => {
    const { permit, calls } = wire();
    if (level === 'organization') permit.config.apiContext.setOrganizationLevelContext('org');
    else permit.config.apiContext.setProjectLevelContext('org', 'project/one');
    await expect(permit.api.roles.bulkCreateOrReplace(roles)).rejects.toBeInstanceOf(
      PermitContextError,
    );
    expect(calls).toEqual([]);
  },
);

test('ordinary transport failures propagate without fabricated arrays or a fallback route', async () => {
  const { permit, calls } = wire();
  permit.config.axiosInstance.defaults.adapter = async (config) => {
    calls.push({
      method: config.method,
      url: axios.getUri(config),
      data: config.data,
      headers: new AxiosHeaders(config.headers),
    });
    throw new Error('Connection unavailable');
  };
  await expect(permit.api.roles.bulkCreateOrReplace(roles)).rejects.toBeInstanceOf(PermitApiError);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.url).toBe(path);
});

test('scope initialization is shared and precedes the selected-environment bulk requests', async () => {
  const calls: string[] = [];
  const permit = new Permit({
    token: 'scope-fixture',
    apiUrl: 'https://control.example',
    proxyFactsViaPdp: true,
    retry: false,
    log: { level: 'silent' },
    axiosInstance: axios.create({
      adapter: async (config) => {
        const url = axios.getUri(config);
        calls.push(url);
        return response(
          config,
          url.endsWith('/scope')
            ? {
                organization_id: 'org',
                project_id: 'project/one',
                environment_id: 'environment east',
              }
            : { created: [], updated: [] },
        );
      },
    }),
  });
  await Promise.all([
    permit.api.roles.bulkCreateOrReplace([]),
    permit.api.roles.bulkCreateOrReplace([]),
  ]);
  expect(calls).toEqual(['https://control.example/v2/api-key/scope', path, path]);
});

test('failed scope discovery refuses the bulk operation without dispatch', async () => {
  const calls: string[] = [];
  const permit = new Permit({
    token: 'scope-fixture',
    apiUrl: 'https://control.example',
    retry: false,
    log: { level: 'silent' },
    axiosInstance: axios.create({
      adapter: async (config) => {
        calls.push(axios.getUri(config));
        throw new Error('Scope service unavailable');
      },
    }),
  });
  await expect(permit.api.roles.bulkCreateOrReplace(roles)).rejects.toBeInstanceOf(
    PermitContextError,
  );
  expect(calls).toEqual(['https://control.example/v2/api-key/scope']);
});
