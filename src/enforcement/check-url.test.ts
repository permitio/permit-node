import { deepStrictEqual } from 'node:assert';
import { inspect } from 'node:util';

import pino from 'pino';

import { ConfigFactory } from '#src/config';
import { Enforcer } from '#src/enforcement/enforcer';
import { Permit, PermitConnectionError, PermitError, PermitPDPStatusError } from '#src/index';
import { parseCheckUrlResponse } from '#src/enforcement/responses';
import { assertPdpRequest, startPdp, TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';
import { rejectionOf } from '#src/tests/helpers/rejection';

const options = { token: TEST_TOKEN, retry: false as const, log: { level: 'silent' as const } };
const url = 'https://api.example.test:443/documents/a%2Fb?enabled=false&count=0#section';

it.each([true, false])(
  'returns the literal URL decision %s and sends the full published body',
  async (allow) => {
    const pdp = await startPdp({
      status: 200,
      body: { allow, result: !allow, debug: { future: null } },
    });
    const permit = new Permit({ ...options, pdp: pdp.url });
    const user = Object.freeze({ key: 'alice', attributes: { enabled: false, count: 0 } });
    const context = Object.freeze({ request: false, count: 0 });
    expect(await permit.checkUrl(user, 'gEt', url, { tenant: 'east', context })).toBe(allow);
    assertPdpRequest(pdp.requests[0], {
      path: '/allowed_url',
      body: { user, http_method: 'gEt', url, tenant: 'east', context },
    });
    expect(pdp.requests).toHaveLength(1);
  },
);

it.each([undefined, ''])('uses the configured default tenant for %j', async (tenant) => {
  const pdp = await startPdp({ status: 200, body: { allow: false } });
  const permit = new Permit({
    ...options,
    pdp: pdp.url,
    multiTenancy: { defaultTenant: 'custom' },
  });
  expect(await permit.checkUrl('alice', 'GET', url, tenant === undefined ? {} : { tenant })).toBe(
    false,
  );
  assertPdpRequest(pdp.requests[0], {
    path: '/allowed_url',
    body: { user: { key: 'alice' }, http_method: 'GET', url, tenant: 'custom', context: {} },
  });
});

it('requires an explicit tenant when default tenancy is disabled, even in non-throwing mode', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: true } });
  const permit = new Permit({
    ...options,
    pdp: pdp.url,
    throwOnError: false,
    multiTenancy: { useDefaultTenantIfEmpty: false },
  });
  for (const config of [{}, { tenant: '', throwOnError: false }]) {
    await expect(permit.checkUrl('alice', 'GET', url, config)).rejects.toThrow('requires a tenant');
  }
  expect(pdp.requests).toHaveLength(0);
  expect(await permit.checkUrl('alice', 'GET', url, { tenant: 'east' })).toBe(true);
  expect(pdp.requests[0]?.body).toMatchObject({ tenant: 'east' });
});

it('snapshots user and merged context synchronously across concurrent calls', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: true } });
  const enforcer = new Enforcer(
    ConfigFactory.build({ ...options, pdp: pdp.url }),
    pino({ level: 'silent' }),
  );
  const global = { shared: 'global', onlyGlobal: true, nested: { count: 0 } };
  enforcer.contextStore.add(global);
  const user = { key: 'alice', attributes: { enabled: false } };
  const firstContext = { shared: 'first', onlyFirst: true };
  const firstOptions = { tenant: 'east', context: firstContext, throwOnError: true };
  const first = enforcer.checkUrl(user, 'GET', url, firstOptions);
  user.key = 'changed';
  user.attributes.enabled = true;
  firstContext.shared = 'changed';
  firstOptions.tenant = 'changed';
  global.nested.count = 7;
  enforcer.contextStore.add({ shared: 'new-global' });
  const second = enforcer.checkUrl('bob', 'POST', url, { context: { shared: 'second' } });
  expect(await Promise.all([first, second])).toStrictEqual([true, true]);
  const bodies = pdp.requests.map((request) => request.body);
  expect(bodies).toContainEqual({
    user: { key: 'alice', attributes: { enabled: false } },
    http_method: 'GET',
    url,
    tenant: 'east',
    context: { shared: 'first', onlyGlobal: true, nested: { count: 0 }, onlyFirst: true },
  });
  expect(bodies).toContainEqual({
    user: { key: 'bob' },
    http_method: 'POST',
    url,
    tenant: 'default',
    context: { shared: 'second', onlyGlobal: true, nested: { count: 7 } },
  });
  expect(enforcer.contextStore.getDerivedContext({})['shared']).toBe('new-global');
});

it.each(['ftp://example.test/document', 'urn:example:document', 'mailto:alice@example.test'])(
  'does not invent a scheme restriction or fetch the authorization URI %s',
  async (target) => {
    const pdp = await startPdp({ status: 200, body: { allow: false } });
    const permit = new Permit({ ...options, pdp: pdp.url });
    expect(await permit.checkUrl('alice', 'CUSTOM', target)).toBe(false);
    expect(pdp.requests[0]?.body).toMatchObject({ url: target, http_method: 'CUSTOM' });
  },
);

it('accepts the published maximum URL length, counting Unicode code points', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: false } });
  const permit = new Permit({ ...options, pdp: pdp.url });
  const prefix = 'https://example.test/';
  const target = prefix + '🦉'.repeat(65_536 - Array.from(prefix).length);
  expect(await permit.checkUrl('alice', '', target)).toBe(false);
  expect(pdp.requests[0]?.body).toMatchObject({ url: target, http_method: '' });
  await expect(permit.checkUrl('alice', 'GET', target + 'a')).rejects.toThrow('1..65536');
  expect(pdp.requests).toHaveLength(1);
});

const invalidInputs: { name: string; args: unknown[] }[] = [
  { name: 'null user', args: [null, 'GET', url] },
  { name: 'missing key', args: [{ attributes: {} }, 'GET', url] },
  { name: 'numeric key', args: [{ key: 7 }, 'GET', url] },
  { name: 'array user', args: [[], 'GET', url] },
  { name: 'nonstring user field', args: [{ key: 'alice', email: false }, 'GET', url] },
  { name: 'null user attributes', args: [{ key: 'alice', attributes: null }, 'GET', url] },
  { name: 'array user attributes', args: [{ key: 'alice', attributes: [] }, 'GET', url] },
  { name: 'numeric HTTP method', args: ['alice', 7, url] },
  { name: 'null URL', args: ['alice', 'GET', null] },
  ...[
    '',
    '/document',
    '//example.test/document',
    'not a URL',
    'https://example.test/a b',
    'https://example.test/a\nb',
  ].map((target) => ({
    name: `invalid URI ${JSON.stringify(target)}`,
    args: ['alice', 'GET', target],
  })),
  { name: 'null options', args: ['alice', 'GET', url, null] },
  { name: 'array options', args: ['alice', 'GET', url, []] },
  ...[null, 7].map((tenant) => ({
    name: `invalid tenant ${tenant}`,
    args: ['alice', 'GET', url, { tenant }],
  })),
  ...[null, [], 'request'].map((context) => ({
    name: `invalid context ${JSON.stringify(context)}`,
    args: ['alice', 'GET', url, { context }],
  })),
  ...[-1, Infinity, NaN, 2_147_483_648, '10'].map((timeout) => ({
    name: `invalid timeout ${String(timeout)}`,
    args: ['alice', 'GET', url, { timeout }],
  })),
  { name: 'nonboolean useOpa', args: ['alice', 'GET', url, { useOpa: 'false' }] },
  { name: 'nonboolean throwOnError', args: ['alice', 'GET', url, { throwOnError: 'false' }] },
];
it.each(invalidInputs)(
  'rejects $name before HTTP despite fallback denial mode',
  async ({ args }) => {
    const pdp = await startPdp({ status: 200, body: { allow: true } });
    const permit = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
    await expect(Reflect.apply(permit.checkUrl, permit, args)).rejects.toBeInstanceOf(PermitError);
    expect(pdp.requests).toHaveLength(0);
  },
);

it('rejects unsupported OPA before any request despite fallback denial mode', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: true } });
  const permit = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
  await expect(
    permit.checkUrl('alice', 'GET', url, { useOpa: true, throwOnError: false }),
  ).rejects.toThrow('supported only by permit.check()');
  expect(pdp.requests).toHaveLength(0);
});

it.each([404, 405, 501])(
  'keeps unavailable HTTP %i visible with either error policy',
  async (status) => {
    const pdp = await startPdp({ status, body: { detail: 'Not supported' } });
    const permit = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
    for (const config of [undefined, { throwOnError: false }, { throwOnError: true }]) {
      await expect(permit.checkUrl('alice', 'GET', url, config)).rejects.toMatchObject({
        name: 'PermitPDPStatusError',
        statusCode: status,
        message: expect.stringContaining('endpoint /allowed_url is unavailable'),
      });
    }
  },
);

it.each(
  [
    null,
    [],
    {},
    true,
    'true',
    { result: true },
    { result: { allow: true } },
    ...[null, 1, 'true', [], {}].map((allow) => ({ allow })),
  ].map((body) => ({ body })),
)('keeps malformed 200 body $body visible with either error policy', async ({ body }) => {
  const pdp = await startPdp({ status: 200, body });
  const permit = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
  for (const throwOnError of [true, false]) {
    await expect(permit.checkUrl('alice', 'GET', url, { throwOnError })).rejects.toMatchObject({
      name: 'PermitPDPStatusError',
      statusCode: 200,
    });
  }
});

it('does not accept an inherited allow field as a direct PDP decision', () => {
  expect(() => parseCheckUrlResponse(Object.create({ allow: true }))).toThrow();
});

it.each([201, 401, 403, 422, 500, 503])(
  'retains ordinary HTTP %i and per-call error precedence',
  async (status) => {
    const pdp = await startPdp({ status, body: { detail: 'Rejected' } });
    const permit = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
    await expect(
      permit.checkUrl('alice', 'GET', url, { throwOnError: true }),
    ).rejects.toMatchObject({ name: 'PermitPDPStatusError', statusCode: status });
    expect(await permit.checkUrl('alice', 'GET', url)).toBe(false);
    const throwing = new Permit({ ...options, pdp: pdp.url });
    expect(await throwing.checkUrl('alice', 'GET', url, { throwOnError: false })).toBe(false);
  },
);

it('retains typed timeout failure and respects per-call timeout and error policy', async () => {
  const pdp = await startPdp();
  const permit = new Permit({ ...options, pdp: pdp.url, timeout: 5_000 });
  const failure = await rejectionOf(permit.checkUrl('alice', 'GET', url, { timeout: 10 }));
  expect(failure).toBeInstanceOf(PermitConnectionError);
  expect(failure).not.toBeInstanceOf(PermitPDPStatusError);
  expect(await permit.checkUrl('alice', 'GET', url, { timeout: 10, throwOnError: false })).toBe(
    false,
  );
});

it('does not hide non-JSON input behind fallback denial', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: true } });
  const permit = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
  const context: Record<string, unknown> = {};
  context['cycle'] = context;
  for (const value of [context, { large: 1n }]) {
    await expect(permit.checkUrl('alice', 'GET', url, { context: value })).rejects.toThrow(
      'JSON-serializable',
    );
  }
  expect(pdp.requests).toHaveLength(0);
});

it('detaches status errors from URL, user and context request data', async () => {
  const pdp = await startPdp({
    status: 200,
    body: { allow: 'true', query: { private: 'response-secret' } },
  });
  const permit = new Permit({ ...options, pdp: pdp.url });
  const failure = await rejectionOf(
    permit.checkUrl(
      { key: 'private-user', attributes: { private: 'attribute-secret' } },
      'GET',
      'https://user:password@example.test/path?secret=url-secret',
      { context: { private: 'context-secret' } },
    ),
  );
  expect(failure).toBeInstanceOf(PermitPDPStatusError);
  for (const secret of [
    TEST_TOKEN,
    'private-user',
    'attribute-secret',
    'user:password',
    'url-secret',
    'context-secret',
    'response-secret',
  ]) {
    expect(inspect(failure)).not.toContain(secret);
  }
});

it('uses timeout zero to override a configured timeout without mutating the options', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: true }, delayMs: 40 });
  const permit = new Permit({ ...options, pdp: pdp.url, timeout: 10 });
  await expect(permit.checkUrl('alice', 'GET', url)).rejects.toBeInstanceOf(PermitConnectionError);
  const config = Object.freeze({ timeout: 0 });
  expect(await permit.checkUrl('alice', 'GET', url, config)).toBe(true);
  expect(config.timeout).toBe(0);
});

it('retains the serialized URL request across retries and per-call option mutation', async () => {
  const pdp = await startPdp((index) => ({
    status: index === 0 ? 503 : 200,
    body: index === 0 ? { detail: 'Retry later' } : { allow: true },
  }));
  const permit = new Permit({
    ...options,
    pdp: pdp.url,
    retry: { maxRetries: 1, retryDelay: 5, maxDelay: 5 },
  });
  const user = { key: 'alice', attributes: { enabled: false } };
  const config = {
    tenant: 'east',
    context: { enabled: false, count: 0 },
    timeout: 1_000,
    throwOnError: true,
  };
  const decision = permit.checkUrl(user, 'GET', url, config);
  user.key = 'changed';
  user.attributes.enabled = true;
  config.tenant = 'changed';
  config.context.enabled = true;
  config.timeout = 0;
  config.throwOnError = false;
  expect(await decision).toBe(true);
  expect(pdp.requests).toHaveLength(2);
  for (const request of pdp.requests) {
    assertPdpRequest(request, {
      path: '/allowed_url',
      body: {
        user: { key: 'alice', attributes: { enabled: false } },
        http_method: 'GET',
        url,
        tenant: 'east',
        context: { enabled: false, count: 0 },
      },
    });
  }
});

it('captures the per-call throwing policy before awaiting a failed URL request', async () => {
  const pdp = await startPdp({ status: 503, body: { detail: 'Rejected' }, delayMs: 10 });
  const permit = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
  const config = { throwOnError: true };
  const decision = permit.checkUrl('alice', 'GET', url, config);
  config.throwOnError = false;
  await expect(decision).rejects.toMatchObject({ name: 'PermitPDPStatusError', statusCode: 503 });
});

it('merges literal false, zero, null and legal prototype-like context keys without mutation', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: true } });
  const permit = new Permit({ ...options, pdp: pdp.url });
  const context = Object.freeze(
    Object.fromEntries([
      ['__proto__', { enabled: false }],
      ['constructor', { count: 0 }],
      ['nullable', null],
    ]),
  );
  expect(await permit.checkUrl('', 'GET', url, { context })).toBe(true);
  deepStrictEqual(pdp.requests[0]?.body, {
    user: { key: '' },
    http_method: 'GET',
    url,
    tenant: 'default',
    context,
  });
  expect(Object.hasOwn(context, '__proto__')).toBe(true);
  expect(Object.getPrototypeOf(context)).toBe(Object.prototype);
});

it.each([
  'https://example.test/%',
  'https://example.test/%2',
  'https://example.test/%zz',
  String.raw`https:\example.test\document`,
])('rejects URI syntax repaired by URL parsing before HTTP: %s', async (target) => {
  const pdp = await startPdp({ status: 200, body: { allow: true } });
  const permit = new Permit({ ...options, pdp: pdp.url });
  for (const throwOnError of [true, false]) {
    await expect(permit.checkUrl('alice', 'GET', target, { throwOnError })).rejects.toBeInstanceOf(
      PermitError,
    );
  }
  expect(pdp.requests).toHaveLength(0);
});

it('forwards valid percent-encoded delimiters byte-for-byte', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: true } });
  const permit = new Permit({ ...options, pdp: pdp.url });
  const target = 'https://EXAMPLE.test:443/%5Cpath?x=%25%2F#%20';
  expect(await permit.checkUrl('alice', 'GET', target)).toBe(true);
  expect(pdp.requests[0]?.body).toMatchObject({ url: target });
});
