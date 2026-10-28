import pino from 'pino';

import { Permit } from '#src/index';
import { ConfigFactory } from '#src/config';
import { Enforcer, PermitError, PermitPDPStatusError } from '#src/enforcement/enforcer';
import { type IFilterObject } from '#src/enforcement/interfaces';
import { assertPdpRequest, startPdp, TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';

const config = { token: TEST_TOKEN, retry: false as const, log: { level: 'silent' as const } };

it('filters through one bulk request, preserving identities/order/duplicates and known fields only', async () => {
  const pdp = await startPdp({
    status: 200,
    body: { allow: [{ allow: true }, { allow: false }, { allow: true }, { allow: true }] },
  });
  const enforcer = new Enforcer(
    ConfigFactory.build({ ...config, pdp: pdp.url, multiTenancy: { defaultTenant: 'custom' } }),
    pino({ level: 'silent' }),
  );
  const global = Object.freeze({ globalOnly: true, shared: 'global' });
  const shared = Object.freeze({ methodOnly: true, shared: 'call' });
  const first = Object.freeze({
    type: 'document',
    key: 'one',
    title: 'Kept title',
    attributes: Object.freeze({ enabled: false, count: 0 }),
    context: Object.freeze({ objectOnly: true, shared: 'object' }),
  });
  const denied = Object.freeze({ type: 'document', key: 'two', tenant: 'east' });
  const last = Object.freeze({ type: 'document', key: 'three', tenant: '', extra: null });
  const objects = Object.freeze([first, denied, first, last]);
  const snapshot = JSON.stringify({ objects, global, shared });
  enforcer.contextStore.add(global);
  const result = await enforcer.filterObjects('alice', 'read', objects, shared);
  expect(result).toStrictEqual([first, first, last]);
  expect(result[0]).toBe(first);
  expect(result[1]).toBe(first);
  expect(result[2]).toBe(last);
  expect(pdp.requests).toHaveLength(1);
  assertPdpRequest(pdp.requests[0], {
    path: '/allowed/bulk',
    body: [
      {
        user: { key: 'alice' },
        action: 'read',
        resource: { type: 'document', key: 'one', tenant: 'custom', attributes: first.attributes },
        context: { globalOnly: true, methodOnly: true, objectOnly: true, shared: 'object' },
      },
      {
        user: { key: 'alice' },
        action: 'read',
        resource: { type: 'document', key: 'two', tenant: 'east' },
        context: { globalOnly: true, methodOnly: true, shared: 'call' },
      },
      {
        user: { key: 'alice' },
        action: 'read',
        resource: { type: 'document', key: 'one', tenant: 'custom', attributes: first.attributes },
        context: { globalOnly: true, methodOnly: true, objectOnly: true, shared: 'object' },
      },
      {
        user: { key: 'alice' },
        action: 'read',
        resource: { type: 'document', key: 'three', tenant: 'custom' },
        context: { globalOnly: true, methodOnly: true, shared: 'call' },
      },
    ],
  });
  expect(JSON.stringify({ objects, global, shared })).toBe(snapshot);
});

it('returns the original dispatched array snapshot when the caller mutates the array', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: [{ allow: true }, { allow: false }] } });
  const permit = new Permit({ ...config, pdp: pdp.url });
  const first = { type: 'document', key: 'one', title: 'Original' };
  const second = { type: 'document', key: 'two', title: 'Denied' };
  const objects = [first, second];
  const pending = permit.filterObjects('alice', 'read', objects);
  objects.splice(0, objects.length, { type: 'changed', key: 'changed', title: 'Changed' });
  const result = await pending;
  expect(result).toStrictEqual([first]);
  expect(result[0]).toBe(first);
});

it('does not inject a default tenant when configured off and retains object context as request data', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: [{ allow: true }] } });
  const permit = new Permit({
    ...config,
    pdp: pdp.url,
    multiTenancy: { useDefaultTenantIfEmpty: false },
  });
  const context = JSON.parse('{"__proto__":{"flag":true},"constructor":"legal"}');
  const object = { type: 'document', key: 'one', context, extra: 'Only returned' };
  expect(await permit.filterObjects('alice', 'read', [object])).toStrictEqual([object]);
  assertPdpRequest(pdp.requests[0], {
    path: '/allowed/bulk',
    body: [
      {
        user: { key: 'alice' },
        action: 'read',
        resource: { type: 'document', key: 'one' },
        context,
      },
    ],
  });
});

it('returns [] for empty input without any HTTP request', async () => {
  const pdp = await startPdp({ status: 200, body: {} });
  const permit = new Permit({ ...config, pdp: pdp.url });
  expect(await permit.filterObjects('alice', 'read', Object.freeze([]))).toStrictEqual([]);
  expect(pdp.requests).toHaveLength(0);
});

it('validates unsupported OPA before empty input and regardless of the error policy', async () => {
  const pdp = await startPdp({ status: 200, body: {} });
  const permit = new Permit({ ...config, pdp: pdp.url, throwOnError: false });
  await expect(
    permit.filterObjects(
      'alice',
      'read',
      [],
      {},
      {
        useOpa: true,
        throwOnError: false,
      },
    ),
  ).rejects.toBeInstanceOf(PermitError);
  expect(pdp.requests).toHaveLength(0);
});

it('rejects sparse and explicit undefined input before HTTP even in non-throwing mode', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: [{ allow: true }] } });
  const permit = new Permit({ ...config, pdp: pdp.url, throwOnError: false });
  const sparse: IFilterObject[] = [];
  sparse.length = 2;
  sparse[1] = { type: 'document' };
  await expect(permit.filterObjects('alice', 'read', sparse)).rejects.toBeInstanceOf(PermitError);
  await expect(
    Reflect.apply(permit.filterObjects, permit, [
      'alice',
      'read',
      [undefined, { type: 'document' }],
      {},
      { throwOnError: false },
    ]),
  ).rejects.toBeInstanceOf(PermitError);
  expect(pdp.requests).toHaveLength(0);
});

it.each([
  { allow: [{ allow: false }, { allow: false }] },
  { allow: [{ allow: true }] },
  { allow: [{ allow: true }, { allow: 'false' }] },
  { allow: [{ allow: true }, {}] },
])('never grants a subset from denied or malformed bulk output: %j', async (body) => {
  const pdp = await startPdp({ status: 200, body });
  const permit = new Permit({ ...config, pdp: pdp.url });
  const objects = [
    { type: 'document', key: 'one' },
    { type: 'document', key: 'two' },
  ];
  if (body.allow.every((value) => value.allow === false)) {
    expect(await permit.filterObjects('alice', 'read', objects)).toStrictEqual([]);
  } else {
    await expect(permit.filterObjects('alice', 'read', objects)).rejects.toBeInstanceOf(
      PermitPDPStatusError,
    );
  }
  expect(
    await permit.filterObjects('alice', 'read', objects, {}, { throwOnError: false }),
  ).toStrictEqual([]);
});

it('honors operational bulk failures without retaining any original object', async () => {
  const pdp = await startPdp({ status: 503, body: {} });
  const permit = new Permit({ ...config, pdp: pdp.url });
  const objects = [{ type: 'document', key: 'one' }];
  await expect(permit.filterObjects('alice', 'read', objects)).rejects.toMatchObject({
    name: 'PermitPDPStatusError',
    statusCode: 503,
  });
  expect(
    await permit.filterObjects('alice', 'read', objects, {}, { throwOnError: false }),
  ).toStrictEqual([]);
});
