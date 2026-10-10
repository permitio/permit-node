import axios from 'axios';
import { inspect } from 'node:util';
import { expect, onTestFinished, test } from 'vitest';

import { Permit } from '#src/index';
import { startApi } from '#src/tests/helpers/api-test-server';
import { startPdp } from '#src/tests/helpers/pdp-test-server';

const resource = { type: 'document', key: 'report', tenant: 'east' };
const options = {
  token: 'request-id-fixture-token',
  retry: false as const,
  log: { level: 'silent' },
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const operations = [
  {
    name: 'check',
    body: { allow: true },
    invoke: (permit: Permit) => permit.check('alice', 'read', resource),
  },
  {
    name: 'bulkCheck',
    body: { allow: [{ allow: true }] },
    invoke: (permit: Permit) => permit.bulkCheck([{ user: 'alice', action: 'read', resource }]),
  },
  {
    name: 'getAuthorizedUsers',
    body: { resource: 'document:report', tenant: 'east', users: {} },
    invoke: (permit: Permit) => permit.getAuthorizedUsers('read', resource),
  },
  {
    name: 'getUserPermissions',
    body: {},
    invoke: (permit: Permit) => permit.getUserPermissions('alice', ['east']),
  },
];

test.each(operations)('$name generates one unique request ID per logical PDP call', async (op) => {
  const pdp = await startPdp({ status: 200, body: op.body });
  const permit = new Permit({ ...options, pdp: pdp.url });
  await op.invoke(permit);
  await op.invoke(permit);
  const ids = pdp.requests.map((row) => row.headers['x-request-id']);
  expect(ids).toHaveLength(2);
  for (const id of ids) expect(id).toMatch(uuid);
  expect(ids[0]).not.toBe(ids[1]);
});

test('SDK retries preserve a logical request ID', async () => {
  const pdp = await startPdp((index) => ({
    status: index === 0 ? 503 : 200,
    body: index === 0 ? {} : { allow: true },
  }));
  const permit = new Permit({
    ...options,
    pdp: pdp.url,
    retry: { maxRetries: 1, retryDelay: 0 },
    throwOnError: true,
  });
  expect(await permit.check('alice', 'read', resource)).toBe(true);
  expect(pdp.requests).toHaveLength(2);
  const id = pdp.requests[0]!.headers['x-request-id'];
  expect(id).toMatch(uuid);
  expect(pdp.requests[1]!.headers['x-request-id']).toBe(id);
});

function inherited(value: unknown, method = false) {
  const target = method ? axios.defaults.headers.post : axios.defaults.headers.common;
  const before = structuredClone(target);
  onTestFinished(() => {
    for (const key of Object.keys(target)) Reflect.deleteProperty(target, key);
    Object.assign(target, before);
  });
  Reflect.set(target, 'x-request-id', value);
  Reflect.set(target, 'X-Caller', 'preserved');
  return { target, expected: structuredClone(target) };
}

test.each([false, true])(
  'preserves inherited %s-method request ID and caller headers',
  async (method) => {
    const state = inherited('caller-chosen-id', method);
    const pdp = await startPdp({ status: 200, body: { allow: true } });
    const permit = new Permit({ ...options, pdp: pdp.url });
    await permit.check('alice', 'read', resource);
    expect(pdp.requests[0]!.headers['x-request-id']).toBe('caller-chosen-id');
    expect(pdp.requests[0]!.headers['x-caller']).toBe('preserved');
    expect(state.target).toStrictEqual(state.expected);
  },
);

test.each(['', '  \t ', '\u00a0', null, false, [], ['first', 'second']])(
  'generates an ID for unusable inherited value %j',
  async (value) => {
    const state = inherited(value);
    const pdp = await startPdp({ status: 200, body: { allow: true } });
    const permit = new Permit({ ...options, pdp: pdp.url });
    await permit.check('alice', 'read', resource);
    expect(pdp.requests[0]!.headers['x-request-id']).toMatch(uuid);
    expect(state.target).toStrictEqual(state.expected);
  },
);

test.each([7, true])('preserves Axios-normalized usable scalar ID %j', async (value) => {
  inherited(value);
  const pdp = await startPdp({ status: 200, body: { allow: true } });
  await new Permit({ ...options, pdp: pdp.url }).check('alice', 'read', resource);
  expect(pdp.requests[0]!.headers['x-request-id']).toBe(String(value));
});

test('PDP request IDs remain private in failure diagnostics', async () => {
  const canary = 'CALLER_REQUEST_ID_PRIVATE_CANARY';
  inherited(canary);
  const pdp = await startPdp({ status: 500, body: { private_value: canary } });
  const permit = new Permit({ ...options, pdp: pdp.url, throwOnError: true });
  const error = await permit.check('alice', 'read', resource).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(Error);
  expect(inspect(error, { depth: 8 })).not.toContain(canary);
  expect(JSON.stringify(error)).not.toContain(canary);
});

test('request ID generation leaves OPA and control-plane transports untouched', async () => {
  const opa = await startPdp({ status: 200, body: { result: { allow: true } } });
  const caller = axios.create({ proxy: false, headers: { 'X-Caller': 'unchanged' } });
  caller.interceptors.request.use((request) => {
    request.baseURL = opa.url + '/v1/data/permit/';
    return request;
  });
  const before = structuredClone(caller.defaults.headers);
  const api = await startApi();
  api.enqueue(
    { method: 'GET', path: '/v2/api-key/scope' },
    {
      body: { organization_id: 'org', project_id: 'project', environment_id: 'environment' },
    },
  );
  api.enqueue(
    { method: 'GET', path: '/v2/facts/project/environment/users/alice' },
    {
      body: { key: 'alice' },
    },
  );
  const permit = new Permit({
    ...options,
    apiUrl: api.url,
    pdp: opa.url,
    opaAxiosInstance: caller,
    proxyFactsViaPdp: false,
  });
  expect(await permit.check('alice', 'read', resource, undefined, { useOpa: true })).toBe(true);
  await permit.api.users.get('alice');
  expect(opa.requests[0]!.headers['x-request-id']).toBeUndefined();
  expect(opa.requests[0]!.headers['x-caller']).toBe('unchanged');
  expect(api.requests).toHaveLength(2);
  for (const request of api.requests) expect(request.headers['x-request-id']).toBeUndefined();
  expect(caller.defaults.headers).toStrictEqual(before);
});

test.each(['top-level-id', false])(
  'handles top-level inherited ID %j without mutation',
  async (value) => {
    const before = structuredClone(axios.defaults.headers);
    onTestFinished(() => {
      for (const key of Object.keys(axios.defaults.headers))
        Reflect.deleteProperty(axios.defaults.headers, key);
      Object.assign(axios.defaults.headers, before);
    });
    Reflect.set(axios.defaults.headers, 'x-ReQuEsT-Id', value);
    const expected = structuredClone(axios.defaults.headers);
    const pdp = await startPdp({ status: 200, body: { allow: true } });
    await new Permit({ ...options, pdp: pdp.url }).check('alice', 'read', resource);
    const received = pdp.requests[0]!.headers['x-request-id'];
    if (value === false) expect(received).toMatch(uuid);
    else expect(received).toBe(value);
    expect(axios.defaults.headers).toStrictEqual(expected);
  },
);
