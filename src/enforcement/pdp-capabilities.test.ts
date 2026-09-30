import { deepStrictEqual } from 'node:assert';

import pino from 'pino';

import { Permit } from '#src/index';
import { ConfigFactory } from '#src/config';
import { Enforcer, PermitConnectionError, PermitError } from '#src/enforcement/enforcer';
import { type IResource } from '#src/enforcement/interfaces';
import { parseAuthorizedUsersResponse, parseUserTenantsResponse } from '#src/enforcement/responses';
import { assertPdpRequest, startPdp, TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';

const resource = { type: 'document', key: 'report', tenant: 'east' };
const assignment = { user: 'alice', tenant: 'east', resource: 'document:report', role: 'reader' };
const authorized = { resource: 'document:report', tenant: 'east', users: { alice: [assignment] } };
const config = { token: TEST_TOKEN, retry: false as const, log: { level: 'silent' as const } };

it('queries permissions with global then request context in the existing fifth argument', async () => {
  const pdp = await startPdp({ status: 200, body: { document: { permissions: ['read'] } } });
  const enforcer = new Enforcer(
    ConfigFactory.build({ ...config, pdp: pdp.url }),
    pino({ level: 'silent' }),
  );
  enforcer.contextStore.add({ globalOnly: true, shared: 'global' });
  const user = Object.freeze({ key: 'alice', attributes: { eligible: true } });
  const context = Object.freeze({ shared: 'call', enabled: false, count: 0 });
  expect(
    await enforcer.getUserPermissions(user, ['east'], ['document:report'], ['document'], {
      context,
    }),
  ).toStrictEqual({ document: { permissions: ['read'] } });
  assertPdpRequest(pdp.requests[0], {
    path: '/user-permissions',
    body: {
      user,
      tenants: ['east'],
      resources: ['document:report'],
      resource_types: ['document'],
      context: { globalOnly: true, shared: 'call', enabled: false, count: 0 },
    },
  });
  expect(context).toStrictEqual({ shared: 'call', enabled: false, count: 0 });
  expect(enforcer.contextStore.getDerivedContext({})).toStrictEqual({
    globalOnly: true,
    shared: 'global',
  });
});

it('sends authorized-user resource attributes and preserves the complete validated result', async () => {
  const result = {
    ...authorized,
    users: Object.fromEntries(
      ['alice', '__proto__', 'constructor'].map((key) => [key, [{ ...assignment, future: null }]]),
    ),
    future: { value: null },
  };
  const pdp = await startPdp({ status: 200, body: result });
  const permit = new Permit({ ...config, pdp: pdp.url });
  const input = Object.freeze({ ...resource, attributes: { enabled: false, count: 0 } });
  deepStrictEqual(await permit.getAuthorizedUsers('read', input, { request: 'caller' }), result);
  assertPdpRequest(pdp.requests[0], {
    path: '/authorized_users',
    body: { action: 'read', resource: input, context: { request: 'caller' } },
  });
  const parsed = parseAuthorizedUsersResponse(result);
  expect(Object.hasOwn(parsed.users, '__proto__')).toBe(true);
  expect(Object.hasOwn(parsed.users, 'constructor')).toBe(true);
  expect(Object.getPrototypeOf(parsed.users)).toBe(Object.prototype);
  deepStrictEqual(result.users, parsed.users);
});

it.each(['getAuthorizedUsers', 'getUserTenants'] as const)(
  'merges global then call context for %s without changing either source',
  async (method) => {
    const response = method === 'getAuthorizedUsers' ? authorized : [{ key: 'east' }];
    const pdp = await startPdp({ status: 200, body: response });
    const enforcer = new Enforcer(
      ConfigFactory.build({ ...config, pdp: pdp.url }),
      pino({ level: 'silent' }),
    );
    const global = Object.freeze({ globalOnly: true, shared: 'global' });
    const call = Object.freeze({ callOnly: true, shared: 'call', enabled: false, count: 0 });
    enforcer.contextStore.add(global);
    if (method === 'getAuthorizedUsers') await enforcer.getAuthorizedUsers('read', resource, call);
    else await enforcer.getUserTenants('alice', call);
    expect(pdp.requests[0]?.body).toMatchObject({
      context: { globalOnly: true, callOnly: true, shared: 'call', enabled: false, count: 0 },
    });
    expect(global).toStrictEqual({ globalOnly: true, shared: 'global' });
    expect(call).toStrictEqual({ callOnly: true, shared: 'call', enabled: false, count: 0 });
  },
);

it('normalizes resource strings and the configured tenant for an empty authorized-user result', async () => {
  const result = { resource: 'document:*', tenant: 'custom', users: {} };
  const pdp = await startPdp({ status: 200, body: result });
  const permit = new Permit({
    ...config,
    pdp: pdp.url,
    multiTenancy: { defaultTenant: 'custom' },
  });
  expect(await permit.getAuthorizedUsers('read', 'document')).toStrictEqual(result);
  assertPdpRequest(pdp.requests[0], {
    path: '/authorized_users',
    body: { action: 'read', resource: { type: 'document', tenant: 'custom' }, context: {} },
  });
});

it('reads container tenants, defaults only missing attributes and preserves additive fields', async () => {
  const tenants = [
    { key: 'east', label: 'East' },
    { key: 'west', attributes: { enabled: false, count: 0 }, future: null },
  ];
  const pdp = await startPdp({ status: 200, body: tenants });
  const permit = new Permit({ ...config, pdp: pdp.url });
  const user = Object.freeze({ key: 'alice', attributes: { eligible: true } });
  expect(await permit.getUserTenants(user, { request: 'caller' })).toStrictEqual([
    { key: 'east', label: 'East', attributes: {} },
    tenants[1],
  ]);
  assertPdpRequest(pdp.requests[0], {
    path: '/user-tenants',
    body: { user, context: { request: 'caller' } },
  });
  expect(tenants[0]).toStrictEqual({ key: 'east', label: 'East' });
});

it('accepts a genuine empty tenant array and wraps a string user', async () => {
  const pdp = await startPdp({ status: 200, body: [] });
  const permit = new Permit({ ...config, pdp: pdp.url });
  expect(await permit.getUserTenants('alice')).toStrictEqual([]);
  assertPdpRequest(pdp.requests[0], {
    path: '/user-tenants',
    body: { user: { key: 'alice' }, context: {} },
  });
});

it.each([
  null,
  [],
  { tenant: 'east', users: {} },
  { resource: 'document:*', users: {} },
  { resource: 'document:*', tenant: 'east', users: [] },
  { resource: 1, tenant: 'east', users: {} },
  { ...authorized, users: { alice: assignment } },
  { ...authorized, users: { alice: [null] } },
  ...['user', 'tenant', 'resource', 'role'].map((field) => ({
    ...authorized,
    users: { alice: [assignment], bad: [{ ...assignment, [field]: 7 }] },
  })),
])('rejects an entire malformed authorized-user response: %j', async (body) => {
  const pdp = await startPdp({ status: 200, body });
  const permit = new Permit({ ...config, pdp: pdp.url });
  await expect(permit.getAuthorizedUsers('read', resource)).rejects.toMatchObject({
    name: 'PermitPDPStatusError',
    statusCode: 200,
  });
  expect(
    await permit.getAuthorizedUsers('read', resource, {}, { throwOnError: false }),
  ).toStrictEqual({ resource: 'document:report', tenant: 'east', users: {} });
});

it.each([
  null,
  {},
  [null],
  [{ key: 1 }],
  [{ key: 'east', attributes: null }],
  [{ key: 'east' }, { key: 'bad', attributes: [] }],
])('rejects an entire malformed tenant response: %j', async (body) => {
  const pdp = await startPdp({ status: 200, body });
  const permit = new Permit({ ...config, pdp: pdp.url });
  await expect(permit.getUserTenants('alice')).rejects.toMatchObject({
    name: 'PermitPDPStatusError',
    statusCode: 200,
  });
  expect(await permit.getUserTenants('alice', {}, { throwOnError: false })).toStrictEqual([]);
});

it('rejects sparse discovery arrays without preserving a partially valid member', () => {
  const values: unknown[] = [];
  values.length = 2;
  values[1] = assignment;
  expect(() => parseAuthorizedUsersResponse({ ...authorized, users: { alice: values } })).toThrow();
  values[1] = { key: 'east' };
  expect(() => parseUserTenantsResponse(values)).toThrow();
});

it('reports an unavailable user-tenants capability even in non-throwing mode', async () => {
  const pdp = await startPdp({ status: 404, body: { detail: 'Not found' } });
  const permit = new Permit({ ...config, pdp: pdp.url, throwOnError: false });
  await expect(permit.getUserTenants('alice', {}, { throwOnError: false })).rejects.toMatchObject({
    name: 'PermitPDPStatusError',
    statusCode: 404,
    message: expect.stringContaining('compatible Permit container PDP'),
  });
  await expect(permit.getUserTenants('alice')).rejects.toThrow(
    'endpoint /user-tenants is unavailable',
  );
});

it.each([403, 503])(
  'preserves operational discovery HTTP %i and honors the explicit error policy',
  async (status) => {
    const pdp = await startPdp({ status, body: { detail: 'Request rejected' } });
    const permit = new Permit({ ...config, pdp: pdp.url });
    await expect(permit.getAuthorizedUsers('read', resource)).rejects.toMatchObject({
      name: 'PermitPDPStatusError',
      statusCode: status,
    });
    await expect(permit.getUserTenants('alice')).rejects.toMatchObject({
      name: 'PermitPDPStatusError',
      statusCode: status,
    });
    expect(await permit.getUserTenants('alice', {}, { throwOnError: false })).toStrictEqual([]);
  },
);

it('captures the authorized-user deny envelope before caller resource mutation', async () => {
  const pdp = await startPdp({ status: 503, body: {} });
  const permit = new Permit({ ...config, pdp: pdp.url });
  const original: IResource = { ...resource };
  const pending = permit.getAuthorizedUsers('read', original, {}, { throwOnError: false });
  original.type = 'changed';
  original.key = 'changed';
  original.tenant = 'changed';
  expect(await pending).toStrictEqual({ resource: 'document:report', tenant: 'east', users: {} });
});

it('uses the pinned wildcard/default-tenant empty envelope when automatic tenant injection is off', async () => {
  const pdp = await startPdp({ status: 503, body: {} });
  const permit = new Permit({
    ...config,
    pdp: pdp.url,
    multiTenancy: { useDefaultTenantIfEmpty: false },
  });
  expect(
    await permit.getAuthorizedUsers('read', 'document', {}, { throwOnError: false }),
  ).toStrictEqual({ resource: 'document:*', tenant: 'default', users: {} });
});

it('uses per-call timeout for both discovery queries', async () => {
  const pdp = await startPdp();
  const permit = new Permit({ ...config, pdp: pdp.url, timeout: 5000 });
  await expect(
    permit.getAuthorizedUsers('read', resource, {}, { timeout: 10 }),
  ).rejects.toBeInstanceOf(PermitConnectionError);
  await expect(permit.getUserTenants('alice', {}, { timeout: 10 })).rejects.toBeInstanceOf(
    PermitConnectionError,
  );
});

it('rejects unsupported OPA for new discovery calls regardless of error policy without HTTP', async () => {
  const pdp = await startPdp({ status: 200, body: authorized });
  const permit = new Permit({ ...config, pdp: pdp.url, throwOnError: false });
  await expect(
    permit.getAuthorizedUsers('read', resource, {}, { useOpa: true, throwOnError: false }),
  ).rejects.toBeInstanceOf(PermitError);
  await expect(
    permit.getUserTenants('alice', {}, { useOpa: true, throwOnError: false }),
  ).rejects.toBeInstanceOf(PermitError);
  expect(pdp.requests).toHaveLength(0);
});

it('retains the existing permission-query OPA deny policy', async () => {
  const pdp = await startPdp({ status: 200, body: {} });
  const permit = new Permit({ ...config, pdp: pdp.url });
  await expect(
    permit.getUserPermissions('alice', [], [], [], { useOpa: true }),
  ).rejects.toBeInstanceOf(PermitError);
  expect(
    await permit.getUserPermissions('alice', [], [], [], {
      useOpa: true,
      throwOnError: false,
      context: { request: true },
    }),
  ).toStrictEqual({});
  expect(pdp.requests).toHaveLength(0);
});

it('keeps legal context/resource dictionary keys as own data and sends the default tenant', async () => {
  const context = JSON.parse('{"__proto__":{"contextValue":true},"constructor":"legal"}');
  const input = JSON.parse(
    '{"type":"document","__proto__":{"tenant":"untrusted"},"constructor":"legal"}',
  );
  const snapshot = JSON.stringify({ context, input });
  const pdp = await startPdp({ status: 200, body: { allow: true } });
  const enforcer = new Enforcer(
    ConfigFactory.build({ ...config, pdp: pdp.url }),
    pino({ level: 'silent' }),
  );
  enforcer.contextStore.add(context);
  const derived = enforcer.contextStore.getDerivedContext({ caller: true });
  expect(Object.hasOwn(derived, '__proto__')).toBe(true);
  expect(Object.getPrototypeOf(derived)).toBe(Object.prototype);
  expect(await enforcer.check('alice', 'read', input, { caller: true })).toBe(true);
  assertPdpRequest(pdp.requests[0], {
    path: '/allowed',
    body: {
      user: { key: 'alice' },
      action: 'read',
      resource: { ...input, tenant: 'default' },
      context: { ...context, caller: true },
    },
  });
  expect(JSON.stringify({ context, input })).toBe(snapshot);
});
