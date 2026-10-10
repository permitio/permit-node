import { EventEmitter } from 'node:events';
import https from 'node:https';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cloudProofDiagnostic } from '#scripts/cloud-release-cli.mjs';
import { observeCloudHttps, produceCloudProof } from '#scripts/cloud-release.mjs';

const fixture = {
  allowedUser: 'allowed-user-canary',
  deniedUser: 'denied-user-canary',
  tenant: 'owned-tenant-canary',
  otherTenant: 'empty-tenant-canary',
  resource: 'owned-document-canary',
  role: 'reader-role-canary',
};
const canary = 'CLOUD_PROOF_RESPONSE_ONLY_CANARY';
const operationFailure = 'Cloud SDK operation did not satisfy the owned fixture proof.';
let network, outcomes, headers;
beforeEach(() => {
  outcomes = [];
  headers = [];
  network = vi.spyOn(https, 'request').mockImplementation(() => {
    const outgoing = new EventEmitter();
    const outcome = outcomes.length ? outcomes.shift() : 200;
    const header = headers.length ? headers.shift() : undefined;
    if (header !== undefined)
      outgoing.getHeader = (name) => (name === 'X-Request-ID' ? header : undefined);
    queueMicrotask(() =>
      outcome === 'error'
        ? outgoing.emit('error', new Error(canary))
        : outgoing.emit('response', { statusCode: outcome }),
    );
    return outgoing;
  });
});
afterEach(() => vi.restoreAllMocks());

async function request(path) {
  const outgoing = https.request({ hostname: 'cloudpdp.api.permit.io', method: 'POST', path });
  return new Promise((resolve) => {
    outgoing.once('response', (response) => resolve(response.statusCode));
    outgoing.once('error', () => resolve('error'));
  });
}

class PermitConnectionError extends Error {
  constructor(code) {
    super(`${canary} https://cloudpdp.api.permit.io/allowed ${fixture.allowedUser}`);
    this.code = code;
  }
}
class PermitPDPStatusError extends PermitConnectionError {
  constructor(statusCode) {
    super(undefined);
    this.statusCode = statusCode;
    this.responseBody = { detail: canary };
  }
}
const sdkFailure = (outcome, code = 'ECONNABORTED') =>
  outcome === 'error' ? new PermitConnectionError(code) : new PermitPDPStatusError(outcome);
async function decide(path, decision) {
  const outcome = await request(path);
  if (outcome !== 200) throw sdkFailure(outcome);
  return decision;
}

function setup(overrides = {}) {
  const constructors = [];
  class Permit {
    constructor(options) {
      constructors.push(options);
    }
    async check(user, action, resource) {
      return decide(
        '/allowed',
        user === fixture.allowedUser && action === 'read' && resource.tenant === fixture.tenant,
      );
    }
    async bulkCheck() {
      return decide('/allowed/bulk', [true, false, true, false]);
    }
    async getAuthorizedUsers(action, resource) {
      return decide('/authorized_users', {
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
      });
    }
    async getUserPermissions(user, tenants, _resources, types) {
      return decide(
        '/user-permissions',
        user === fixture.allowedUser && tenants[0] === fixture.tenant && types.includes('__tenant')
          ? {
              [`__tenant:${fixture.tenant}`]: {
                permissions: [`${fixture.resource}:read`],
                roles: [fixture.role],
                additional: 'not-exported',
              },
            }
          : {},
      );
    }
  }
  Object.assign(Permit.prototype, overrides);
  return {
    options: {
      entries: ['esm', 'commonjs'].map((name) => ({
        name,
        Permit,
        PermitConnectionError,
        PermitPDPStatusError,
      })),
      token: 'synthetic-only-token',
      fixture,
      pause: vi.fn(),
      attempts: 3,
    },
    constructors,
  };
}
async function refusal(options) {
  const error = await produceCloudProof(options).catch((caught) => caught);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe(operationFailure);
  const exposed = JSON.stringify({ ...error, message: error.message }) + String(error.cause);
  for (const value of [canary, ...Object.values(fixture), 'https://', 'synthetic-only-token'])
    expect(exposed).not.toContain(value);
  return error.code;
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
  expect(proof.httpObservations.map((row) => row.readinessFailures)).toEqual(Array(8).fill(0));
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

test.each([
  ['one timeout', ['error'], 1],
  ['two timeouts', ['error', 'error'], 2],
  ['a server error', [503], 1],
  ['a missing route', [404], 1],
  ['rate limiting then a server error', [429, 500], 2],
])('readiness tolerates %s before success and counts it', async (_name, failures, count) => {
  const { options } = setup();
  outcomes = [...failures];
  const proof = await produceCloudProof(options);
  expect(options.pause).toHaveBeenCalledTimes(count);
  expect(options.pause.mock.calls.every(([milliseconds]) => milliseconds === 2_000)).toBe(true);
  expect(proof.httpObservations[0]).toMatchObject({
    caseId: 'cloud.check',
    entry: 'esm',
    requests: 4,
    readinessFailures: count,
  });
  expect(proof.httpObservations.slice(1).map((row) => row.readinessFailures)).toEqual(
    Array(7).fill(0),
  );
});
test('readiness tolerates a transient network error code', async () => {
  let first = true;
  const { options } = setup({
    async check(user, action, resource) {
      if (first) {
        first = false;
        outcomes.unshift('error');
        await request('/allowed');
        throw new PermitConnectionError('ECONNRESET');
      }
      return decide(
        '/allowed',
        user === fixture.allowedUser && action === 'read' && resource.tenant === fixture.tenant,
      );
    },
  });
  const proof = await produceCloudProof(options);
  expect(proof.httpObservations[0].readinessFailures).toBe(1);
});

test.each([
  ['timeouts', 'error', 'cloud-proof:op:check:esm:not-ready:timeout'],
  ['server errors', 503, 'cloud-proof:op:check:esm:not-ready:pdp-status:503'],
  ['rate limits', 429, 'cloud-proof:op:check:esm:not-ready:pdp-status:429'],
])(
  'persistent readiness %s refuse as not ready after bounded attempts',
  async (_name, outcome, code) => {
    const { options } = setup();
    outcomes = Array(3).fill(outcome);
    expect(await refusal(options)).toBe(code);
    expect(options.pause).toHaveBeenCalledTimes(2);
    expect(network).toHaveBeenCalledTimes(3);
  },
);
test('persistent denial refuses as not ready after bounded attempts', async () => {
  const { options } = setup({
    async check() {
      await request('/allowed');
      return false;
    },
  });
  expect(await refusal(options)).toBe('cloud-proof:op:check:esm:not-ready:denied');
  expect(options.pause).toHaveBeenCalledTimes(2);
});

test.each([
  [403, 'cloud-proof:op:check:esm:pdp-status:403'],
  [400, 'cloud-proof:op:check:esm:pdp-status:400'],
  [401, 'cloud-proof:op:check:esm:pdp-status:401'],
])('a readiness HTTP %s is not tolerated and fails immediately', async (status, code) => {
  const { options } = setup();
  outcomes = [status];
  expect(await refusal(options)).toBe(code);
  expect(options.pause).not.toHaveBeenCalled();
  expect(network).toHaveBeenCalledTimes(1);
});
test.each([
  ['an unknown exception', new Error(canary), 'cloud-proof:op:check:esm:exception'],
  [
    'a non-transient connection failure',
    new PermitConnectionError('ENOTFOUND'),
    'cloud-proof:op:check:esm:exception',
  ],
  [
    'a malformed decision',
    new PermitPDPStatusError(200),
    'cloud-proof:op:check:esm:pdp-status:200',
  ],
  [
    'a status error without a status',
    new PermitPDPStatusError(undefined),
    'cloud-proof:op:check:esm:pdp-status:invalid',
  ],
])('readiness does not retry %s', async (_name, failure, code) => {
  const { options } = setup({
    async check() {
      throw failure;
    },
  });
  expect(await refusal(options)).toBe(code);
  expect(options.pause).not.toHaveBeenCalled();
});

test.each([
  ['a negative check', 3, 503, 'cloud-proof:op:check:esm:pdp-status:503'],
  ['a timed-out negative check', 2, 'error', 'cloud-proof:op:check:esm:timeout'],
  ['the bulk check', 5, 503, 'cloud-proof:op:bulk-check:esm:pdp-status:503'],
  ['authorized users', 6, 429, 'cloud-proof:op:authorized-users:esm:pdp-status:429'],
  ['user permissions', 8, 404, 'cloud-proof:op:user-permissions:esm:pdp-status:404'],
  ['a commonjs negative check', 13, 503, 'cloud-proof:op:check:commonjs:pdp-status:503'],
])('a failure after readiness in %s is never tolerated', async (_name, index, outcome, code) => {
  const { options } = setup();
  outcomes = [...Array(index - 1).fill(200), outcome];
  expect(await refusal(options)).toBe(code);
  expect(options.pause).not.toHaveBeenCalled();
});
test.each([
  ['a forbidden readiness response', 403],
  ['a tolerated status the SDK accepted', 503],
])('%s reported as a decision is refused by the observation', async (_name, status) => {
  const { options } = setup({
    async check(user, action, resource) {
      await request('/allowed');
      return (
        user === fixture.allowedUser && action === 'read' && resource.tenant === fixture.tenant
      );
    },
  });
  outcomes = [status];
  expect(await refusal(options)).toBe(`cloud-proof:op:check:esm:observation:${status}`);
});
test.each([
  ['a server error', 3, 503, 'cloud-proof:op:check:esm:observation:503'],
  ['a request error', 2, 'error', 'cloud-proof:op:check:esm:observation:request-error'],
])('%s after readiness that the SDK ignored is refused', async (_name, index, outcome, code) => {
  const { options } = setup({
    async check(user, action, resource) {
      await request('/allowed');
      return (
        user === fixture.allowedUser && action === 'read' && resource.tenant === fixture.tenant
      );
    },
  });
  outcomes = [...Array(index - 1).fill(200), outcome];
  expect(await refusal(options)).toBe(code);
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
    'cloud-proof:op:check:esm:observation:readiness',
  ],
  [
    'a bulk decision without HTTP',
    {
      async bulkCheck() {
        return [true, false, true, false];
      },
    },
    'cloud-proof:op:bulk-check:esm:observation:empty',
  ],
  [
    'a non-boolean decision',
    {
      async check() {
        await request('/allowed');
        return 'true';
      },
    },
    'cloud-proof:op:check:esm:oracle:0',
  ],
  [
    'a positive negative check',
    {
      async check(user) {
        await request('/allowed');
        return user !== fixture.deniedUser || true;
      },
    },
    'cloud-proof:op:check:esm:oracle:2',
  ],
  [
    'reordered bulk',
    {
      async bulkCheck() {
        return decide('/allowed/bulk', [false, true, true, false]);
      },
    },
    'cloud-proof:op:bulk-check:esm:oracle:0',
  ],
  [
    'mutated bulk input',
    {
      async bulkCheck(input) {
        input.pop();
        return decide('/allowed/bulk', [true, false, true, false]);
      },
    },
    'cloud-proof:op:bulk-check:esm:oracle:1',
  ],
  [
    'a foreign authorized resource',
    {
      async getAuthorizedUsers(_action, resource) {
        return decide('/authorized_users', { resource: 'foreign:*', tenant: resource.tenant });
      },
    },
    'cloud-proof:op:authorized-users:esm:oracle:0:other',
  ],
  [
    'empty authorized users',
    {
      async getAuthorizedUsers() {
        return decide('/authorized_users', {
          resource: `${fixture.resource}:*`,
          tenant: fixture.tenant,
          users: {},
        });
      },
    },
    'cloud-proof:op:authorized-users:esm:oracle:2:empty',
  ],
  [
    'wrong authorized role',
    {
      async getAuthorizedUsers() {
        return decide('/authorized_users', {
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
        });
      },
    },
    'cloud-proof:op:authorized-users:esm:oracle:4:uok_tok_rother_sok',
  ],
  [
    'extra permissions',
    {
      async getUserPermissions() {
        return decide('/user-permissions', {
          [`__tenant:${fixture.tenant}`]: {
            permissions: [`${fixture.resource}:read`, `${fixture.resource}:write`],
            roles: [fixture.role],
          },
        });
      },
    },
    'cloud-proof:op:user-permissions:esm:oracle:1:extra',
  ],
])('rejects %s with its static operation code', async (_name, overrides, code) => {
  expect(await refusal(setup(overrides).options)).toBe(code);
});

test.each([
  [
    'missing fixture keys',
    (options) => ({ ...options, fixture: { ...fixture, role: undefined } }),
    'cloud-proof:fixture:keys',
  ],
  [
    'an invalid token',
    (options) => ({ ...options, token: 'two words' }),
    'cloud-proof:credential:token',
  ],
  [
    'entries without SDK error classes',
    (options) => ({
      ...options,
      entries: options.entries.map(({ name, Permit }) => ({ name, Permit })),
    }),
    'cloud-proof:entries:shape',
  ],
  [
    'entries without the connection error class',
    (options) => ({
      ...options,
      entries: options.entries.map(({ PermitConnectionError: _omitted, ...entry }) => entry),
    }),
    'cloud-proof:entries:shape',
  ],
  ['an unbounded wait', (options) => ({ ...options, attempts: 31 }), 'cloud-proof:wait:bounds'],
])('proof inputs with %s refuse before any HTTP', async (_name, change, code) => {
  const { options } = setup();
  const error = await produceCloudProof(change(options)).catch((caught) => caught);
  expect(error.code).toBe(code);
  expect(network).not.toHaveBeenCalled();
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
  ).rejects.toMatchObject({
    message: 'Cloud operation attempted an unexpected HTTPS destination or route.',
    code: 'cloud-proof:op:check:esm:observation:destination',
  });
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
      ).rejects.toMatchObject({ code: 'cloud-proof:observe:sequential' });
      return request('/allowed');
    },
  });
  await pending;
  expect(https.request).toBe(original);
});
test.each([
  [
    'readiness outside the check case',
    { caseId: 'cloud.bulkCheck', path: '/allowed/bulk', readiness: true },
    'cloud-proof:observe:identifiers',
  ],
  [
    'readiness that never ends',
    { caseId: 'cloud.check', path: '/allowed', readiness: true },
    'cloud-proof:op:check:esm:observation:readiness',
  ],
])('the observer refuses %s', async (_name, options, code) => {
  await expect(
    observeCloudHttps({ entry: 'esm', invoke: () => request(options.path), ...options }),
  ).rejects.toMatchObject({ code });
});

function permissionBoundary(details) {
  return {
    async getUserPermissions(user, tenants, _resources, types) {
      if (
        user !== fixture.allowedUser ||
        tenants[0] !== fixture.tenant ||
        !types.includes('__tenant')
      )
        return decide('/user-permissions', {});
      return decide('/user-permissions', {
        [`__tenant:${fixture.tenant}`]: {
          permissions: [`${fixture.resource}:read`],
          roles: [fixture.role],
          ...details,
        },
      });
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
  [{ tenant: { key: 'foreign-tenant', attributes: {} } }, '3:other'],
  [{ resource: { type: 'foreign-resource', key: fixture.tenant, attributes: {} } }, '4:yother_kok'],
  [{ resource: { type: '__tenant', key: 'foreign-instance', attributes: {} } }, '4:yok_kother'],
])(
  'rejects valid-shaped permission details belonging to a different identity: %j',
  async (details, oracle) => {
    expect(await refusal(setup(permissionBoundary(details)).options)).toBe(
      `cloud-proof:op:user-permissions:esm:oracle:${oracle}`,
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
test.each([
  ['every request including failed readiness', Array(3).fill('request-id-canary'), true],
  [
    'all but one failed readiness request',
    [undefined, 'request-id-canary', 'request-id-canary'],
    false,
  ],
])('request IDs must cover %s', async (_name, readinessHeaders, expected) => {
  const { options } = setup();
  outcomes = ['error', 503];
  headers = [...readinessHeaders, ...Array(3).fill('request-id-canary')];
  const proof = await produceCloudProof(options);
  expect(proof.httpObservations[0]).toMatchObject({
    readinessFailures: 2,
    requests: 4,
    requestIdPresent: expected,
  });
  expect(JSON.stringify(proof)).not.toContain('request-id-canary');
});

const authorized = (change) => ({
  async getAuthorizedUsers(_action, resource) {
    const users =
      resource.tenant === fixture.tenant
        ? {
            [fixture.allowedUser]: [
              {
                user: fixture.allowedUser,
                tenant: fixture.tenant,
                role: fixture.role,
                resource: `__tenant:${fixture.tenant}`,
              },
            ],
          }
        : {};
    return decide(
      '/authorized_users',
      change({ resource: `${fixture.resource}:*`, tenant: resource.tenant, users }, resource),
    );
  },
});
const permissions = (change) => ({
  async getUserPermissions(user, tenants, _resources, types) {
    const own =
      user === fixture.allowedUser && tenants[0] === fixture.tenant && types.includes('__tenant');
    const body = own
      ? {
          [`__tenant:${fixture.tenant}`]: {
            permissions: [`${fixture.resource}:read`],
            roles: [fixture.role],
          },
        }
      : {};
    return decide('/user-permissions', change(body, { user, tenants, types }));
  },
});
const owned = (resource) => resource.tenant === fixture.tenant;
const resultField = (field, value) =>
  authorized((body, resource) => (owned(resource) ? { ...body, [field]: value } : body));
const grant = (fields) =>
  authorized((body) =>
    body.users[fixture.allowedUser]
      ? {
          ...body,
          users: { [fixture.allowedUser]: [{ ...body.users[fixture.allowedUser][0], ...fields }] },
        }
      : body,
  );
const grants = (value) => resultField('users', { [fixture.allowedUser]: value });
const excludedFields = (fields) =>
  authorized((body, resource) => (owned(resource) ? body : { ...body, ...fields }));
const permissionKey = `__tenant:${fixture.tenant}`;
const ownBody = (value) => permissions((body) => (body[permissionKey] ? value : body));
const ownDetails = (fields) =>
  permissions((body) =>
    body[permissionKey] ? { [permissionKey]: { ...body[permissionKey], ...fields } } : body,
  );
const permissionCall = (matches, value) =>
  permissions((body, call) => (matches(call) ? value : body));
const filteredCall = (call) =>
  call.user === fixture.allowedUser && !call.types.includes('__tenant');
const deniedCall = (call) => call.user === fixture.deniedUser;
const otherTenantCall = (call) => call.tenants[0] === fixture.otherTenant;
const sample = { user: fixture.allowedUser, tenant: fixture.tenant, role: fixture.role };
test.each([
  ['authorized-users', '0:prefixed', resultField('resource', `__tenant:${fixture.tenant}`)],
  ['authorized-users', '0:bare', resultField('resource', fixture.tenant)],
  ['authorized-users', '0:tenantcolon', resultField('resource', `tenant:${fixture.tenant}`)],
  ['authorized-users', '0:star', resultField('resource', '*')],
  ['authorized-users', '0:tenantwild', resultField('resource', '__tenant:*')],
  ['authorized-users', '0:type', resultField('resource', fixture.resource)],
  ['authorized-users', '0:absent', resultField('resource', undefined)],
  ['authorized-users', '0:nonstr', resultField('resource', 7)],
  ['authorized-users', '0:other', resultField('resource', canary)],
  ['authorized-users', '1:prefixed', resultField('tenant', `__tenant:${fixture.tenant}`)],
  ['authorized-users', '1:absent', resultField('tenant', null)],
  ['authorized-users', '1:nonstr', resultField('tenant', { key: fixture.tenant })],
  ['authorized-users', '1:other', resultField('tenant', canary)],
  ['authorized-users', '2:empty', resultField('users', {})],
  [
    'authorized-users',
    '2:extra',
    resultField('users', { [fixture.allowedUser]: [], [canary]: [] }),
  ],
  ['authorized-users', '2:missing', resultField('users', { [canary]: [] })],
  ['authorized-users', '2:other', resultField('users', null)],
  ['authorized-users', '3:0', grants([])],
  ['authorized-users', '3:2', grants([sample, sample])],
  ['authorized-users', '3:many', grants([sample, sample, sample])],
  ['authorized-users', '3:nonarray', grants({ 0: sample })],
  ['authorized-users', '4:uok_tok_rok_sbare', grant({ resource: fixture.tenant })],
  [
    'authorized-users',
    '4:uok_tok_rok_stenantcolon',
    grant({ resource: `tenant:${fixture.tenant}` }),
  ],
  ['authorized-users', '4:uok_tok_rok_stypewild', grant({ resource: `${fixture.resource}:*` })],
  ['authorized-users', '4:uok_tok_rok_sstar', grant({ resource: '*' })],
  ['authorized-users', '4:uok_tok_rok_stenantwild', grant({ resource: '__tenant:*' })],
  ['authorized-users', '4:uok_tok_rok_stype', grant({ resource: fixture.resource })],
  ['authorized-users', '4:uok_tok_rok_sabsent', grant({ resource: undefined })],
  [
    'authorized-users',
    '4:uok_tok_rok_snonstr',
    grant({ resource: { type: '__tenant', key: fixture.tenant } }),
  ],
  ['authorized-users', '4:uok_tok_rok_sother', grant({ resource: canary })],
  [
    'authorized-users',
    '4:uother_tprefixed_rsuffix_sok',
    grant({ user: canary, tenant: `__tenant:${fixture.tenant}`, role: `team-${fixture.role}` }),
  ],
  ['authorized-users', '4:uok_tother_rother_sok', grant({ tenant: canary, role: canary })],
  [
    'authorized-users',
    '4:uabsent_tabsent_rabsent_sabsent',
    grant({ user: undefined, tenant: undefined, role: undefined, resource: undefined }),
  ],
  ['authorized-users', '4:uabsent_tabsent_rabsent_sabsent', grants([null])],
  [
    'authorized-users',
    '4:unonstr_tnonstr_rnonstr_snonstr',
    grant({ user: 1, tenant: 2, role: 3, resource: 4 }),
  ],
  [
    'authorized-users',
    '4:uabsent_tprefixed_rsuffix_stenantcolon',
    grant({
      user: null,
      tenant: `__tenant:${fixture.tenant}`,
      role: `${canary}${fixture.role}`,
      resource: `tenant:${fixture.tenant}`,
    }),
  ],
  ['authorized-users', '5:sok_tok_unonempty', excludedFields({ users: { [canary]: [] } })],
  ['authorized-users', '5:sok_tother_uok', excludedFields({ tenant: fixture.tenant })],
  ['authorized-users', '5:sstar_tok_uok', excludedFields({ resource: '*' })],
  [
    'authorized-users',
    '5:sprefixed_tprefixed_uother',
    excludedFields({
      resource: `__tenant:${fixture.otherTenant}`,
      tenant: `__tenant:${fixture.otherTenant}`,
      users: null,
    }),
  ],
  [
    'authorized-users',
    '5:sabsent_tabsent_uother',
    excludedFields({ resource: undefined, tenant: undefined, users: undefined }),
  ],
  [
    'authorized-users',
    '5:snonstr_tnonstr_uother',
    excludedFields({ resource: 5, tenant: 6, users: [] }),
  ],
  ['user-permissions', '0:empty', ownBody({})],
  ['user-permissions', '0:bare', ownBody({ [fixture.tenant]: { permissions: [] } })],
  [
    'user-permissions',
    '0:extra',
    permissions((body) => (body[permissionKey] ? { ...body, [canary]: {} } : body)),
  ],
  ['user-permissions', '0:other', ownBody({ [canary]: {} })],
  ['user-permissions', '0:other', ownBody([canary])],
  ['user-permissions', '1:absent', ownDetails({ permissions: undefined })],
  ['user-permissions', '1:empty', ownDetails({ permissions: [] })],
  ['user-permissions', '1:bare-action', ownDetails({ permissions: ['read'] })],
  ['user-permissions', '1:hash', ownDetails({ permissions: [`${fixture.resource}#read`] })],
  [
    'user-permissions',
    '1:extra',
    ownDetails({ permissions: [`${fixture.resource}:read`, canary] }),
  ],
  ['user-permissions', '1:other', ownDetails({ permissions: [canary] })],
  ['user-permissions', '1:other', ownDetails({ permissions: canary })],
  ['user-permissions', '2:empty', ownDetails({ roles: [] })],
  ['user-permissions', '2:extra', ownDetails({ roles: [fixture.role, canary] })],
  ['user-permissions', '2:suffix', ownDetails({ roles: [`team-${fixture.role}`] })],
  ['user-permissions', '2:other', ownDetails({ roles: [canary] })],
  ['user-permissions', '2:other', ownDetails({ roles: fixture.role })],
  ['user-permissions', '2:other', ownDetails({ roles: [`team-${fixture.role}`, canary] })],
  ['user-permissions', '3:nonobject', ownDetails({ tenant: fixture.tenant })],
  ['user-permissions', '3:prefixed', ownDetails({ tenant: { key: `__tenant:${fixture.tenant}` } })],
  ['user-permissions', '3:absent', ownDetails({ tenant: { attributes: {} } })],
  ['user-permissions', '3:nonstr', ownDetails({ tenant: { key: 1 } })],
  ['user-permissions', '3:other', ownDetails({ tenant: { key: canary } })],
  ['user-permissions', '4:nonobject', ownDetails({ resource: canary })],
  [
    'user-permissions',
    '4:ytype_kok',
    ownDetails({ resource: { type: fixture.resource, key: fixture.tenant } }),
  ],
  [
    'user-permissions',
    '4:yok_kprefixed',
    ownDetails({ resource: { type: '__tenant', key: `__tenant:${fixture.tenant}` } }),
  ],
  ['user-permissions', '4:yabsent_kabsent', ownDetails({ resource: {} })],
  ['user-permissions', '4:ynonstr_knonstr', ownDetails({ resource: { type: 1, key: 2 } })],
  ['user-permissions', '4:yother_kother', ownDetails({ resource: { type: canary, key: canary } })],
  ['user-permissions', '5:nonempty', permissionCall(filteredCall, { [canary]: {} })],
  ['user-permissions', '5:other', permissionCall(filteredCall, [])],
  ['user-permissions', '6:nonempty', permissionCall(deniedCall, { [canary]: {} })],
  ['user-permissions', '6:other', permissionCall(deniedCall, null)],
  ['user-permissions', '7:nonempty', permissionCall(otherTenantCall, { [canary]: {} })],
  ['user-permissions', '7:other', permissionCall(otherTenantCall, [canary])],
])(
  '%s oracle %s names the mismatch class without received text',
  async (label, oracle, overrides) => {
    const code = `cloud-proof:op:${label}:esm:oracle:${oracle}`;
    expect(await refusal(setup(overrides).options)).toBe(code);
    expect(cloudProofDiagnostic({ code })).toBe(`Cloud proof diagnostic: ${code}`);
  },
);

test('the transport refuses a forbidden readiness response the SDK misreported as transient', async () => {
  let first = true;
  const { options } = setup({
    async check(user, action, resource) {
      const outcome = await request('/allowed');
      if (first) {
        first = false;
        throw new PermitConnectionError('ECONNABORTED');
      }
      if (outcome !== 200) throw sdkFailure(outcome);
      return (
        user === fixture.allowedUser && action === 'read' && resource.tenant === fixture.tenant
      );
    },
  });
  outcomes = [403];
  expect(await refusal(options)).toBe('cloud-proof:op:check:esm:observation:403');
  expect(options.pause).toHaveBeenCalledTimes(1);
});
