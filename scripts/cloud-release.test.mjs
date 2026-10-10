import { EventEmitter } from 'node:events';
import https from 'node:https';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { observeCloudHttps, produceCloudProof } from '#scripts/cloud-release.mjs';

const fixture = {
  allowedUser: 'allowed-user',
  deniedUser: 'denied-user',
  tenant: 'owned-tenant',
  otherTenant: 'empty-tenant',
  resource: 'owned-document',
  role: 'reader-role',
};
let network;
beforeEach(() => {
  network = vi.spyOn(https, 'request').mockImplementation(() => {
    const request = new EventEmitter();
    queueMicrotask(() => request.emit('response', { statusCode: 200 }));
    return request;
  });
});
afterEach(() => vi.restoreAllMocks());

async function request(path) {
  const outgoing = https.request({ hostname: 'cloudpdp.api.permit.io', method: 'POST', path });
  await new Promise((resolve) => outgoing.once('response', resolve));
}

function setup(overrides = {}) {
  const constructors = [];
  class Permit {
    constructor(options) {
      constructors.push(options);
    }
    async check(user, action, resource) {
      await request('/allowed');
      return (
        user === fixture.allowedUser && action === 'read' && resource.tenant === fixture.tenant
      );
    }
    async bulkCheck() {
      await request('/allowed/bulk');
      return [true, false, true, false];
    }
    async getAuthorizedUsers(action, resource) {
      await request('/authorized_users');
      return {
        resource: `${fixture.resource}:*`,
        tenant: resource.tenant,
        users:
          resource.tenant === fixture.tenant
            ? {
                [fixture.allowedUser]: [
                  {
                    user: fixture.allowedUser,
                    tenant: fixture.tenant,
                    role: fixture.role,
                    resource: `__tenant:${fixture.tenant}`,
                    additional: 'not-exported',
                  },
                ],
              }
            : {},
        additional: 'not-exported',
      };
    }
    async getUserPermissions(user, tenants, _resources, types) {
      await request('/user-permissions');
      return user === fixture.allowedUser &&
        tenants[0] === fixture.tenant &&
        types.includes('__tenant')
        ? {
            [`__tenant:${fixture.tenant}`]: {
              permissions: [`${fixture.resource}:read`],
              roles: [fixture.role],
              additional: 'not-exported',
            },
          }
        : {};
    }
  }
  Object.assign(Permit.prototype, overrides);
  return {
    options: {
      entries: ['esm', 'commonjs'].map((name) => ({ name, Permit })),
      token: 'synthetic-only-token',
      fixture,
      pause: vi.fn(),
      attempts: 3,
    },
    constructors,
  };
}

test('both installed entry boundaries require four oracles and HTTPS observations', async () => {
  const { options, constructors } = setup();
  const proof = await produceCloudProof(options);
  expect(proof.phaseResults).toHaveLength(4);
  expect(proof.caseResults).toHaveLength(4);
  expect(proof.httpObservations).toHaveLength(8);
  expect(proof.phaseResults.every((row) => row.status === 'PASSED' && row.assertions > 0)).toBe(
    true,
  );
  expect(proof.httpObservations.map((row) => row.requests)).toEqual([4, 1, 2, 4, 4, 1, 2, 4]);
  expect(constructors).toHaveLength(2);
  expect(
    constructors.every(
      (config) =>
        config.throwOnError &&
        config.retry === false &&
        config.pdpRetry === false &&
        config.timeout === 10_000,
    ),
  ).toBe(true);
  expect(JSON.stringify(proof)).not.toMatch(/synthetic-only-token|not-exported|allowed-user/u);
});

test('only false decisions may converge; the final positive oracle is required', async () => {
  let calls = 0;
  const { options } = setup({
    async check(user, action, resource) {
      await request('/allowed');
      if (user !== fixture.allowedUser || action !== 'read' || resource.tenant !== fixture.tenant)
        return false;
      return ++calls > 2;
    },
  });
  await produceCloudProof(options);
  expect(options.pause).toHaveBeenCalledTimes(2);
});

test('default-denied outages refuse readiness and exception retries', async () => {
  const { options } = setup({
    async check() {
      throw new Error('response-only-secret');
    },
  });
  await expect(produceCloudProof(options)).rejects.toThrow('response-only-secret');
  expect(options.pause).not.toHaveBeenCalled();
  const denied = setup({
    async check() {
      await request('/allowed');
      return false;
    },
  });
  await expect(produceCloudProof(denied.options)).rejects.toThrow('owned fixture oracle');
  expect(denied.options.pause).toHaveBeenCalledTimes(2);
});

test.each([
  [
    'no HTTP',
    {
      async check(user, action, resource) {
        return (
          user === fixture.allowedUser && action === 'read' && resource.tenant === fixture.tenant
        );
      },
    },
    'observed HTTP',
  ],
  [
    'reordered bulk',
    {
      async bulkCheck() {
        await request('/allowed/bulk');
        return [false, true, true, false];
      },
    },
    'oracle',
  ],
  [
    'empty authorized users',
    {
      async getAuthorizedUsers() {
        await request('/authorized_users');
        return { resource: `${fixture.resource}:*`, tenant: fixture.tenant, users: {} };
      },
    },
    'oracle',
  ],
  [
    'wrong authorized role',
    {
      async getAuthorizedUsers() {
        await request('/authorized_users');
        return {
          resource: `${fixture.resource}:*`,
          tenant: fixture.tenant,
          users: {
            [fixture.allowedUser]: [
              {
                user: fixture.allowedUser,
                tenant: fixture.tenant,
                role: 'unrelated-role',
                resource: `__tenant:${fixture.tenant}`,
              },
            ],
          },
        };
      },
    },
    'oracle',
  ],
  [
    'extra permissions',
    {
      async getUserPermissions() {
        await request('/user-permissions');
        return {
          [`__tenant:${fixture.tenant}`]: {
            permissions: [`${fixture.resource}:read`, `${fixture.resource}:write`],
            roles: [fixture.role],
          },
        };
      },
    },
    'oracle',
  ],
])('rejects %s rather than producing case credit', async (_name, overrides, message) => {
  await expect(produceCloudProof(setup(overrides).options)).rejects.toThrow(message);
});

test.each([401, 403, 404, 429, 500])('HTTP %s cannot become cloud proof', async (status) => {
  network.mockImplementation(() => {
    const outgoing = new EventEmitter();
    queueMicrotask(() => outgoing.emit('response', { statusCode: status }));
    return outgoing;
  });
  await expect(produceCloudProof(setup().options)).rejects.toThrow('observed HTTP 200');
});

test.each([
  { hostname: 'foreign.example', method: 'POST', path: '/allowed' },
  { hostname: 'cloudpdp.api.permit.io', method: 'GET', path: '/allowed' },
  { hostname: 'cloudpdp.api.permit.io', method: 'POST', path: '/allowed?redirect=true' },
  { hostname: 'cloudpdp.api.permit.io', method: 'POST', path: '/allowed', port: 8443 },
])('unexpected destination refuses before reaching the HTTP boundary: %j', async (destination) => {
  await expect(
    observeCloudHttps({
      path: '/allowed',
      caseId: 'cloud.check',
      entry: 'esm',
      invoke: () => https.request(destination),
    }),
  ).rejects.toThrow('unexpected HTTPS');
  expect(network).not.toHaveBeenCalled();
});

test('HTTP observer restores after failure and refuses concurrent attribution', async () => {
  const original = https.request;
  await expect(
    observeCloudHttps({
      path: '/allowed',
      caseId: 'cloud.check',
      entry: 'esm',
      invoke: async () => {
        throw new Error('secret response body');
      },
    }),
  ).rejects.toThrow();
  expect(https.request).toBe(original);
  const pending = observeCloudHttps({
    path: '/allowed',
    caseId: 'cloud.check',
    entry: 'esm',
    invoke: async () => {
      await expect(
        observeCloudHttps({
          path: '/allowed',
          caseId: 'cloud.check',
          entry: 'commonjs',
          invoke: () => request('/allowed'),
        }),
      ).rejects.toThrow('sequentially');
      return request('/allowed');
    },
  });
  await pending;
  expect(https.request).toBe(original);
});

function permissionBoundary(details) {
  return {
    async getUserPermissions(user, tenants, _resources, types) {
      await request('/user-permissions');
      if (
        user !== fixture.allowedUser ||
        tenants[0] !== fixture.tenant ||
        !types.includes('__tenant')
      )
        return {};
      return {
        [`__tenant:${fixture.tenant}`]: {
          permissions: [`${fixture.resource}:read`],
          roles: [fixture.role],
          ...details,
        },
      };
    },
  };
}
test.each([
  {
    tenant: { key: fixture.tenant, attributes: {} },
    resource: { type: '__tenant', key: fixture.tenant, attributes: {} },
  },
  { tenant: null, resource: null, roles: null },
  { roles: undefined },
])(
  'preserves contract-valid optional permission details without requiring their presence: %j',
  async (details) => {
    await expect(
      produceCloudProof(setup(permissionBoundary(details)).options),
    ).resolves.toMatchObject({
      phaseResults: expect.arrayContaining([expect.objectContaining({ status: 'PASSED' })]),
    });
  },
);
test.each([
  { tenant: { key: 'foreign-tenant', attributes: {} } },
  { resource: { type: 'foreign-resource', key: fixture.tenant, attributes: {} } },
  { resource: { type: '__tenant', key: 'foreign-instance', attributes: {} } },
])(
  'rejects valid-shaped permission details belonging to a different identity: %j',
  async (details) => {
    await expect(produceCloudProof(setup(permissionBoundary(details)).options)).rejects.toThrow(
      'oracle',
    );
  },
);

test('observes header presence only and does not inject a missing request ID', async () => {
  const absent = await produceCloudProof(setup().options);
  expect(absent.httpObservations.every((row) => row.requestIdPresent === false)).toBe(true);
  network.mockImplementation(() => {
    const outgoing = new EventEmitter();
    outgoing.getHeader = (name) =>
      name === 'X-Request-ID' ? 'request-id-canary-never-export' : undefined;
    queueMicrotask(() => outgoing.emit('response', { statusCode: 200 }));
    return outgoing;
  });
  const present = await produceCloudProof(setup().options);
  expect(present.httpObservations.every((row) => row.requestIdPresent === true)).toBe(true);
  expect(JSON.stringify(present)).not.toContain('request-id-canary');
});
