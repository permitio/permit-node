import { deepStrictEqual } from 'node:assert';

import axios, { AxiosError } from 'axios';
import { vi } from 'vitest';

import { Permit, PermitError } from '#src/index';
import { assertPdpRequest, startPdp, TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';
import { type Context } from '#src/utils/context';

const options = { token: TEST_TOKEN, retry: false as const, log: { level: 'silent' as const } };
const context: Context = JSON.parse('{"__proto__":{"flag":true},"constructor":"legal"}');
const resource = JSON.parse(
  '{"type":"document","attributes":{"__proto__":"attribute","constructor":"legal"}}',
);
const checkBody = {
  user: { key: 'alice' },
  action: 'read',
  resource: { ...resource, tenant: 'default' },
  context,
};
const operations = [
  {
    method: 'check',
    path: '/allowed',
    response: { allow: true },
    body: checkBody,
    fallback: false,
    run: (permit: Permit, input: Context, throwOnError = true) =>
      permit.check('alice', 'read', resource, input, { throwOnError }),
  },
  {
    method: 'bulkCheck',
    path: '/allowed/bulk',
    response: { allow: [{ allow: true }] },
    body: [checkBody],
    fallback: [false],
    run: (permit: Permit, input: Context, throwOnError = true) =>
      permit.bulkCheck([{ user: 'alice', action: 'read', resource }], input, { throwOnError }),
  },
  {
    method: 'checkAllTenants',
    path: '/allowed/all-tenants',
    response: { allowed_tenants: [] },
    body: { ...checkBody, resource },
    fallback: [],
    run: (permit: Permit, input: Context) =>
      permit.checkAllTenants('alice', 'read', resource, input),
  },
  {
    method: 'getUserPermissions',
    path: '/user-permissions',
    response: {},
    body: { user: { key: 'alice' }, context },
    fallback: {},
    run: (permit: Permit, input: Context, throwOnError = true) =>
      permit.getUserPermissions('alice', undefined, undefined, undefined, {
        context: input,
        throwOnError,
      }),
  },
  {
    method: 'getAuthorizedUsers',
    path: '/authorized_users',
    response: { resource: 'document:*', tenant: 'default', users: {} },
    body: { action: 'read', resource: checkBody.resource, context },
    fallback: { resource: 'document:*', tenant: 'default', users: {} },
    run: (permit: Permit, input: Context, throwOnError = true) =>
      permit.getAuthorizedUsers('read', resource, input, { throwOnError }),
  },
  {
    method: 'getUserTenants',
    path: '/user-tenants',
    response: [],
    body: { user: { key: 'alice' }, context },
    fallback: [],
    run: (permit: Permit, input: Context, throwOnError = true) =>
      permit.getUserTenants('alice', input, { throwOnError }),
  },
];

it.each(operations)(
  'preserves legal own JSON dictionary keys on $method wire requests',
  async (operation) => {
    const pdp = await startPdp({ status: 200, body: operation.response });
    const permit = new Permit({ ...options, pdp: pdp.url });
    const before = JSON.stringify({ context, resource });
    await operation.run(permit, context);
    assertPdpRequest(pdp.requests[0], {
      path: operation.path,
      body: operation.body,
      sdk: operation.method === 'checkAllTenants' ? 'node' : undefined,
    });
    deepStrictEqual(pdp.requests[0]?.body, operation.body);
    expect(JSON.stringify({ context, resource })).toBe(before);
  },
);

for (const operation of operations) {
  it.each(['circular', 'bigint'])(
    '%s JSON input fails safely before HTTP on ' + operation.method,
    async (kind) => {
      const pdp = await startPdp({ status: 200, body: operation.response });
      const privateValue = 'private-invalid-json-do-not-retain';
      const input: Context = { privateValue };
      input['bad'] = kind === 'circular' ? input : 1n;
      const permit = new Permit({ ...options, pdp: pdp.url });
      const error: unknown = await operation
        .run(permit, input)
        .catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(PermitError);
      expect(error).toMatchObject({
        name: 'PermitError',
        message: expect.stringContaining(`Permit.${operation.method}() input`),
      });
      expect(error).not.toHaveProperty('cause');
      expect(String(error)).not.toContain(privateValue);
      expect(JSON.stringify(error)).not.toContain(privateValue);
      const denying = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
      expect(await operation.run(denying, input, false)).toStrictEqual(operation.fallback);
      expect(pdp.requests).toHaveLength(0);
    },
  );
}

it('supplied OPA hooks parse/edit JSON text, preserving live caller defaults and retry ownership', async () => {
  const wire = await startPdp({ status: 200, body: { result: { allow: true } } });
  const bodies: unknown[] = [];
  const transform = vi.fn((data: unknown) => {
    if (typeof data === 'string') {
      const body = JSON.parse(data);
      expect(Object.hasOwn(body.input.context, '__proto__')).toBe(true);
      body.input.context.transformed = true;
      return JSON.stringify(body);
    }
    return JSON.stringify(data);
  });
  const caller = axios.create({
    baseURL: wire.url,
    auth: { username: 'caller', password: 'owned' },
    headers: { 'X-Caller': 'kept' },
    transformRequest: [transform],
  });
  const requestHook = vi.fn((config) => {
    if (config.url === 'root') {
      expect(new URL(config.baseURL).port).toBe('8181');
      config.baseURL = wire.url + '/v1/data/permit/';
      expect(typeof config.data).toBe('string');
      const body = JSON.parse(config.data);
      body.input.context.hook = true;
      config.data = JSON.stringify(body);
    }
    return config;
  });
  const responseHook = vi.fn((response) => response);
  caller.interceptors.request.use(requestHook, undefined, { synchronous: true });
  caller.interceptors.response.use(responseHook);
  const before = { ...caller.defaults, headers: structuredClone(caller.defaults.headers) };
  const httpAdapter = axios.getAdapter(caller.defaults.adapter);
  let attempts = 0;
  caller.defaults.adapter = async (config) => {
    bodies.push(JSON.parse(config.data));
    if (config.url === 'root' && attempts++ === 0) {
      throw new AxiosError('Temporary failure', undefined, config, undefined, {
        config,
        status: 503,
        statusText: 'Unavailable',
        headers: {},
        data: {},
      });
    }
    return httpAdapter(config);
  };
  const ownAdapter = caller.defaults.adapter;
  const retryCondition = vi.fn(() => true);
  const permit = new Permit({
    ...options,
    pdp: wire.url,
    opaAxiosInstance: caller,
    pdpRetry: { maxRetries: 1, retryDelay: 0, maxDelay: 0, retryCondition },
  });
  expect(await permit.check('alice', 'read', resource, context, { useOpa: true })).toBe(true);
  expect(attempts).toBe(2);
  expect(retryCondition).toHaveBeenCalledTimes(1);
  expect(bodies.slice(0, 2)).toStrictEqual([
    { input: { ...checkBody, context: { ...context, hook: true, transformed: true } } },
    { input: { ...checkBody, context: { ...context, hook: true, transformed: true } } },
  ]);
  expect(wire.requests[0]?.path).toBe('/v1/data/permit/root');
  expect(wire.requests[0]?.headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
  await caller.post('/direct', { direct: true });
  expect(bodies[2]).toStrictEqual({ direct: true });
  expect(wire.requests[1]?.headers.authorization).toBe(
    'Basic ' + Buffer.from('caller:owned').toString('base64'),
  );
  expect(transform).toHaveBeenCalledTimes(3);
  expect(requestHook).toHaveBeenCalledTimes(3);
  expect(responseHook).toHaveBeenCalledTimes(2);
  expect(caller.interceptors.request.handlers).toHaveLength(1);
  expect(caller.interceptors.response.handlers).toHaveLength(1);
  expect(caller.defaults).toEqual({ ...before, adapter: ownAdapter });
});

it('redacts serialized private JSON echoed by a supplied OPA hook without retaining the body', async () => {
  const secret = 'private-json-request-description';
  const caller = axios.create();
  const raw = new Error(secret);
  caller.interceptors.request.use(() => {
    throw raw;
  });
  const permit = new Permit({ ...options, opaAxiosInstance: caller });
  const error: unknown = await permit
    .check('alice', 'read', 'document', { secret }, { useOpa: true })
    .catch((failure: unknown) => failure);
  expect(error).toMatchObject({ name: 'PermitConnectionError' });
  expect(String(error)).not.toContain(secret);
  expect(JSON.stringify(error)).not.toContain(secret);
  expect(raw.message).toBe(secret);
  expect(error).not.toHaveProperty('cause.config.data');
});
