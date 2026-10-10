import axios from 'axios';
import { expect, test, vi } from 'vitest';

import { ApiContextLevel, ApiKeyLevel, PermitContextError } from '#src/api/context';
import { Permit, PermitApiError } from '#src/index';
import { startApi } from '#src/tests/helpers/api-test-server';

const TOKEN = 'loopback-api-test-token';
const SCOPE_PATH = '/v2/api-key/scope';
const scope = { organization_id: 'org', project_id: 'proj', environment_id: 'env' };
const USERS = '/v2/facts/proj/env/users';

function client(url: string, caller = axios.create({ proxy: false })) {
  return new Permit({
    token: TOKEN,
    apiUrl: url,
    axiosInstance: caller,
    retry: false,
    log: { level: 'silent' },
  });
}

function pendingReply() {
  let resolve!: (value: { body: unknown }) => void;
  const promise = new Promise<{ body: unknown }>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

test('authored APIs discover scope once over HTTP before concurrent dependent requests', async () => {
  const api = await startApi();
  const pending = pendingReply();
  api.enqueue({ method: 'GET', path: SCOPE_PATH }, pending.promise);
  api.enqueue({ method: 'GET', path: `${USERS}/alice` }, { body: { key: 'alice' } });
  api.enqueue({ method: 'GET', path: `${USERS}/alice` }, { body: { key: 'alice' } });
  const permit = client(api.url);
  const calls = [permit.api.users.get('alice'), permit.api.users.get('alice')];
  await vi.waitFor(() => expect(api.requests).toHaveLength(1));
  expect(permit.config.apiContext.contextLevel).toBe(ApiContextLevel.WAIT_FOR_INIT);
  pending.resolve({ body: scope });
  expect(await Promise.all(calls)).toStrictEqual([{ key: 'alice' }, { key: 'alice' }]);
  expect(api.requests).toHaveLength(3);
  expect(permit.config.apiContext.permittedAccessLevel).toBe(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
  for (const request of api.requests) {
    expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(request.headers['x-permit-sdk-version']).toBe(
      `node:${process.env['npm_package_version'] ?? 'unknown'}`,
    );
    expect(request.headers.accept).toBe('application/json');
  }
});

for (const [name, body, status] of [
  ['null', null, 200],
  ['broken hierarchy', { organization_id: 'org', environment_id: 'env' }, 200],
  ['authentication failure', { message: 'scope denied' }, 401],
] as const) {
  test(`scope ${name} fails without dispatching facts and a later lookup recovers`, async () => {
    const api = await startApi();
    api.enqueue({ method: 'GET', path: SCOPE_PATH }, { body, status });
    const permit = client(api.url);
    await expect(permit.api.users.get('alice')).rejects.toBeInstanceOf(PermitContextError);
    expect(api.requests).toHaveLength(1);
    expect(permit.config.apiContext.organization).toBeNull();
    expect(permit.config.apiContext.permittedAccessLevel).toBe(ApiKeyLevel.WAIT_FOR_INIT);
    api.enqueue({ method: 'GET', path: SCOPE_PATH }, { body: scope });
    api.enqueue({ method: 'GET', path: `${USERS}/alice` }, { body: { key: 'alice' } });
    expect(await permit.api.users.get('alice')).toStrictEqual({ key: 'alice' });
    expect(api.requests).toHaveLength(3);
  });
}

test('scope cancellation stops dependent traffic and a fresh caller signal can recover', async () => {
  const api = await startApi();
  const pending = pendingReply();
  api.enqueue({ method: 'GET', path: SCOPE_PATH }, pending.promise);
  const controller = new AbortController();
  const caller = axios.create({ proxy: false, signal: controller.signal });
  const permit = client(api.url, caller);
  const failed = expect(permit.api.users.get('alice')).rejects.toBeInstanceOf(PermitContextError);
  await vi.waitFor(() => expect(api.requests).toHaveLength(1));
  controller.abort();
  await failed;
  pending.resolve({ body: scope });
  expect(permit.config.apiContext.permittedAccessLevel).toBe(ApiKeyLevel.WAIT_FOR_INIT);
  delete caller.defaults.signal;
  api.enqueue({ method: 'GET', path: SCOPE_PATH }, { body: scope });
  api.enqueue({ method: 'GET', path: `${USERS}/alice` }, { body: { key: 'alice' } });
  expect(await permit.api.users.get('alice')).toStrictEqual({ key: 'alice' });
  expect(api.requests).toHaveLength(3);
});

test('CRUD preserves encoded paths, JSON null values, omitted fields and actual statuses', async () => {
  const api = await startApi();
  api.enqueue({ method: 'GET', path: SCOPE_PATH }, { body: scope });
  const key = 'identity / #?';
  const path = `${USERS}/identity%20%2F%20%23%3F`;
  const payload = { key, attributes: { retained: null, omitted: undefined } };
  const wire = { key, attributes: { retained: null } };
  api.enqueue({ method: 'POST', path: USERS, body: wire }, { status: 201, body: wire });
  api.enqueue({ method: 'PUT', path, body: wire }, { status: 201, body: wire });
  api.enqueue({ method: 'PATCH', path, body: { attributes: { retained: null } } }, { body: wire });
  api.enqueue({ method: 'GET', path }, { body: null });
  api.enqueue({ method: 'DELETE', path }, { status: 204, body: undefined });
  const permit = client(api.url);
  expect(await permit.api.users.create(payload)).toStrictEqual(wire);
  expect(await permit.api.users.sync(payload)).toStrictEqual({ user: wire, created: true });
  expect(await permit.api.users.update(key, { attributes: payload.attributes })).toStrictEqual(
    wire,
  );
  expect(await permit.api.users.get(key)).toBeNull();
  await permit.api.users.delete(key);
  expect(api.requests).toHaveLength(6);
  for (const request of api.requests.slice(1, 4)) {
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`);
  }
  expect(payload.attributes).toHaveProperty('omitted', undefined);
});

test('detailed pagination preserves repeated search terms and full envelopes without extra requests', async () => {
  const api = await startApi();
  api.enqueue({ method: 'GET', path: SCOPE_PATH }, { body: scope });
  const page = { data: [{ key: 'report', relationships: [] }], total_count: 5, page_count: 3 };
  api.enqueue(
    {
      method: 'GET',
      path: '/v2/facts/proj/env/resource_instances/detailed',
      query: [
        ['tenant', 'east / west'],
        ['search', 'one & two'],
        ['search', 'three'],
        ['page', '2'],
        ['per_page', '2'],
      ],
    },
    { body: page },
  );
  const permit = client(api.url);
  expect(
    await permit.api.resourceInstances.listDetailed({
      tenant: 'east / west',
      search: ['one & two', 'three'],
      page: 2,
      perPage: 2,
    }),
  ).toStrictEqual(page);
  expect(api.requests).toHaveLength(2);
});

for (const status of [400, 401, 403, 404, 409, 500]) {
  test(`authored API preserves HTTP ${status} errors without retrying or fabricating data`, async () => {
    const api = await startApi();
    api.enqueue({ method: 'GET', path: SCOPE_PATH }, { body: scope });
    api.enqueue(
      { method: 'GET', path: `${USERS}/missing` },
      { status, body: { message: 'rejected' } },
    );
    const permit = client(api.url);
    const result = await Promise.allSettled([permit.api.users.get('missing')]);
    expect(result[0]?.status).toBe('rejected');
    if (result[0]?.status !== 'rejected') throw new Error('Expected the HTTP request to fail');
    expect(result[0].reason).toBeInstanceOf(PermitApiError);
    expect(result[0].reason).toHaveProperty('status', status);
    expect(api.requests).toHaveLength(2);
  });
}

test('bulk create, replace and tuple calls dispatch every operation in one request each', async () => {
  const api = await startApi();
  api.enqueue({ method: 'GET', path: SCOPE_PATH }, { body: scope });
  const users = [
    { key: 'alice', first_name: 'Before' },
    { key: 'bob', attributes: { tag: null } },
  ];
  const tuples = [
    { subject: 'folder:one', relation: 'parent', object: 'doc:two', tenant: 'default' },
  ];
  api.enqueue(
    { method: 'POST', path: '/v2/facts/proj/env/bulk/users', body: { operations: users } },
    { body: {} },
  );
  api.enqueue(
    { method: 'PUT', path: '/v2/facts/proj/env/bulk/users', body: { operations: users } },
    { body: {} },
  );
  api.enqueue(
    {
      method: 'POST',
      path: '/v2/facts/proj/env/relationship_tuples/bulk',
      body: { operations: tuples },
    },
    { body: {} },
  );
  const permit = client(api.url);
  expect(await permit.api.users.bulkUserCreate(users)).toStrictEqual({});
  expect(await permit.api.users.bulkUserReplace(users)).toStrictEqual({});
  expect(await permit.api.relationshipTuples.bulkRelationshipTuples(tuples)).toStrictEqual({});
  expect(api.requests).toHaveLength(4);
});
