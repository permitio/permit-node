import assert from 'node:assert/strict';

import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { test } from 'vitest';

import { PermitApiError } from '#src/api/base';
import { PermitContextError } from '#src/api/context';
import type { IUserAttributesApi } from '#src/api/user-attributes';
import { AttributeType, Permit, type ResourceAttributeRead } from '#src/index';

const attribute = Object.freeze({
  key: 'department',
  type: AttributeType.String,
  description: 'The department used by user policies.',
});
const read = {
  ...attribute,
  id: 'attribute-id',
  resource_id: 'user-schema-id',
  resource_key: '__user',
  organization_id: 'org',
  project_id: 'project',
  environment_id: 'environment',
  created_at: '2026-10-08T00:00:00Z',
  updated_at: '2026-10-08T00:00:00Z',
  built_in: false,
} satisfies ResourceAttributeRead;
const key = 'department/a?b+c=%é';
const encodedKey = 'department%2Fa%3Fb%2Bc%3D%25%C3%A9';
const prefix =
  'https://control.example/v2/schema/project%2Fone/environment%20east/users/attributes';

interface Request {
  method: string | undefined;
  url: string;
  body: unknown;
  headers: AxiosHeaders;
}

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200) {
  return { data, status, statusText: 'Fixture response', headers: new AxiosHeaders(), config };
}

function wire(proxyFactsViaPdp = true) {
  const calls: Request[] = [];
  const reply: { status: number; data: unknown } = { status: 200, data: read };
  const permit = new Permit({
    token: 'attribute-fixture',
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
          body: config.data,
          headers: new AxiosHeaders(config.headers),
        });
        const result = response(config, reply.data, reply.status);
        if (reply.status >= 400) {
          throw new AxiosError(
            'User attribute request failed',
            'ERR_BAD_RESPONSE',
            config,
            undefined,
            result,
          );
        }
        return result;
      },
    }),
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org');
  permit.config.apiContext.setEnvironmentLevelContext('org', 'project/one', 'environment east');
  return { permit, calls, reply };
}

test.each([true, false])(
  'five operations preserve dedicated schema wire contracts (proxy %s)',
  async (proxy) => {
    const { permit, calls, reply } = wire(proxy);
    const api = permit.api.userAttributes;
    reply.data = { ...read, additive: { nullable: null } };
    expect(await api.create(attribute)).toEqual(reply.data);
    expect(await api.get(key)).toEqual(reply.data);
    const update = Object.freeze({ description: 'Updated schema description.' });
    expect(await api.update(key, update)).toEqual(reply.data);
    reply.data = [reply.data];
    expect(await api.list()).toEqual(reply.data);
    reply.status = 204;
    reply.data = undefined;
    expect(await api.delete(key)).toBeUndefined();
    expect(calls.map(({ method, url, body }) => [method, url, body])).toEqual([
      ['post', prefix, JSON.stringify(attribute)],
      ['get', `${prefix}/${encodedKey}`, undefined],
      ['patch', `${prefix}/${encodedKey}`, JSON.stringify(update)],
      ['get', `${prefix}?page=1&per_page=100`, undefined],
      ['delete', `${prefix}/${encodedKey}`, undefined],
    ]);
    for (const call of calls) {
      expect(call.headers.get('authorization')).toBe('Bearer attribute-fixture');
      expect(call.headers.has('x-wait-timeout')).toBe(false);
      expect(call.headers.has('x-timeout-policy')).toBe(false);
      expect(new URL(call.url).searchParams.has('resource_id')).toBe(false);
      if (call.body) expect(call.headers.get('content-type')).toContain('application/json');
    }
    expect(attribute.description).toBe('The department used by user policies.');
    expect(update.description).toBe('Updated schema description.');
    expect('waitForSync' in api).toBe(false);
  },
);

test('list snapshots pagination and preserves a plain empty array', async () => {
  const { permit, calls, reply } = wire();
  const params = { page: 2, perPage: 3 };
  reply.data = [{ ...read, type: 'future-kind', additive: false }];
  const pending = permit.api.userAttributes.list(params);
  params.page = 9;
  params.perPage = 10;
  expect(await pending).toEqual(reply.data);
  expect(calls[0]?.url).toBe(`${prefix}?page=2&per_page=3`);
  reply.data = [];
  expect(await permit.api.userAttributes.list({ page: 1, perPage: 1 })).toEqual([]);
  expect(calls[1]?.url).toBe(`${prefix}?page=1&per_page=1`);
  expect(await permit.api.userAttributes.list(undefined)).toEqual([]);
  expect(calls[2]?.url).toBe(`${prefix}?page=1&per_page=100`);
});

test('schema CRUD and readback retain the complete stored response', async () => {
  let stored: ResourceAttributeRead | undefined;
  const patch = Object.freeze({ type: AttributeType.Bool, description: 'Updated policy schema.' });
  const permit = new Permit({
    token: 'attribute-fixture',
    retry: false,
    log: { level: 'silent' },
    axiosInstance: axios.create({
      adapter: async (config) => {
        const url = new URL(axios.getUri(config));
        expect(url.pathname).toContain('/schema/project/environment/users/attributes');
        expect(url.searchParams.has('resource_id')).toBe(false);
        if (config.method === 'post') {
          expect(JSON.parse(String(config.data))).toEqual(attribute);
          stored = { ...read };
        } else if (config.method === 'patch') {
          expect(JSON.parse(String(config.data))).toEqual(patch);
          assert(stored);
          stored = { ...stored, ...patch, updated_at: '2026-10-08T01:00:00Z' };
        } else if (config.method === 'delete') {
          stored = undefined;
          return response(config, undefined, 204);
        } else if (url.pathname.endsWith('/users/attributes')) {
          return response(config, stored ? [stored] : []);
        }
        if (!stored) {
          throw new AxiosError(
            'Missing schema attribute',
            'ERR_BAD_REQUEST',
            config,
            undefined,
            response(config, { detail: 'Schema attribute not found' }, 404),
          );
        }
        return response(config, { ...stored });
      },
    }),
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
  const api = permit.api.userAttributes;
  expect(await api.list()).toEqual([]);
  const created = await api.create(attribute);
  expect(created).toEqual(read);
  expect(await api.get(attribute.key)).toEqual(created);
  expect(await api.list()).toEqual([created]);
  const updated = await api.update(attribute.key, patch);
  expect(updated).toEqual({ ...created, ...patch, updated_at: '2026-10-08T01:00:00Z' });
  expect(await api.get(created.id)).toEqual(updated);
  expect(await api.list()).toEqual([updated]);
  expect(await api.delete(created.id)).toBeUndefined();
  expect(await api.list()).toEqual([]);
  await expect(api.get(attribute.key)).rejects.toMatchObject({
    name: 'PermitApiError',
    status: 404,
  });
});

const operations: Array<[string, (api: IUserAttributesApi) => Promise<unknown>]> = [
  ['list', (api) => api.list()],
  ['get', (api) => api.get(key)],
  ['create', (api) => api.create(attribute)],
  ['update', (api) => api.update(key, { type: AttributeType.Bool })],
  ['delete', (api) => api.delete(key)],
];

test.each(operations)(
  '%s rejects an unselected environment before operation traffic',
  async (_, call) => {
    for (const scopedProject of [undefined, 'project']) {
      let requests = 0;
      const permit = new Permit({
        token: 'attribute-fixture',
        retry: false,
        log: { level: 'silent' },
        axiosInstance: axios.create({
          adapter: async () => {
            requests++;
            throw new Error('Unexpected operation traffic');
          },
        }),
      });
      permit.config.apiContext._saveApiKeyAccessibleScope('org', scopedProject);
      await expect(call(permit.api.userAttributes)).rejects.toBeInstanceOf(PermitContextError);
      expect(requests).toBe(0);
    }
  },
);

test.each(operations)(
  '%s preserves named REST errors and HTTP status metadata',
  async (_, call) => {
    const { permit, calls, reply } = wire();
    for (const status of [401, 403, 404, 422, 503]) {
      reply.status = status;
      reply.data = { detail: 'Schema attribute operation rejected' };
      const error: unknown = await call(permit.api.userAttributes).catch(
        (caught: unknown) => caught,
      );
      assert(error instanceof PermitApiError);
      expect(error.status).toBe(status);
      expect(error.code).toBe('ERR_BAD_RESPONSE');
      expect(error.message).toContain('Schema attribute operation rejected');
      expect(error.response?.status).toBe(status);
    }
    expect(calls).toHaveLength(5);
  },
);

test.each(operations)(
  '%s surfaces ordinary transport failures without a fallback',
  async (_, call) => {
    let requests = 0;
    const permit = new Permit({
      token: 'attribute-fixture',
      retry: false,
      log: { level: 'silent' },
      axiosInstance: axios.create({
        adapter: async () => {
          requests++;
          throw new Error('Fixture transport unavailable');
        },
      }),
    });
    permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
    const error: unknown = await call(permit.api.userAttributes).catch((caught: unknown) => caught);
    assert(error instanceof PermitApiError);
    expect(error.message).toContain('Fixture transport unavailable');
    expect(error.status).toBeUndefined();
    expect(requests).toBe(1);
  },
);

test('initializes environment scope once before a schema operation', async () => {
  const urls: string[] = [];
  const permit = new Permit({
    token: 'attribute-fixture',
    apiUrl: 'https://control.example',
    retry: false,
    log: { level: 'silent' },
    axiosInstance: axios.create({
      adapter: async (config) => {
        const url = axios.getUri(config);
        urls.push(url);
        return response(
          config,
          url.endsWith('/v2/api-key/scope')
            ? { organization_id: 'org', project_id: 'project', environment_id: 'environment' }
            : [read],
        );
      },
    }),
  });
  expect(await permit.api.userAttributes.list()).toEqual([read]);
  expect(await permit.api.userAttributes.list()).toEqual([read]);
  expect(urls).toEqual([
    'https://control.example/v2/api-key/scope',
    'https://control.example/v2/schema/project/environment/users/attributes?page=1&per_page=100',
    'https://control.example/v2/schema/project/environment/users/attributes?page=1&per_page=100',
  ]);
});

test('failed scope discovery remains a context error without a schema request', async () => {
  let requests = 0;
  const permit = new Permit({
    token: 'attribute-fixture',
    retry: false,
    log: { level: 'silent' },
    axiosInstance: axios.create({
      adapter: async () => {
        requests++;
        throw new Error('Scope discovery unavailable');
      },
    }),
  });
  await expect(permit.api.userAttributes.list()).rejects.toBeInstanceOf(PermitContextError);
  expect(requests).toBe(1);
});
