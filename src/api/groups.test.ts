import { createServer, type IncomingHttpHeaders } from 'node:http';

import axios from 'axios';
import { expect, onTestFinished, test } from 'vitest';

import { PermitApiError } from '#src/api/base';
import { PermitContextError } from '#src/api/context';
import { type IGroupsApi } from '#src/api/groups';
import { Permit } from '#src/index';

const group = {
  group_resource_type_key: 'team',
  group_instance_key: 'team:support / east',
  group_tenant: 'tenant-east',
};
const membership = { tenant: 'tenant-east' };
const role = {
  role: 'reader',
  resource: 'document',
  resource_instance: 'report:quarter / 1',
  tenant: 'tenant-east',
};
const read = { ...group, assigned_roles: ['reader'], users: ['alice'] };
const direct = { ...group, id: '7605610c-7c96-4798-b3ec-17bd2a8d2f91' };
const prefix = '/v2/schema/project%2Fone/environment%20east/groups';
const encodedGroup = 'team%3Asupport%20%2F%20east';

interface WireRequest {
  method: string | undefined;
  path: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

async function wire() {
  const calls: WireRequest[] = [];
  const reply: { status: number; data: unknown } = { status: 200, data: read };
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    calls.push({
      method: request.method,
      path: request.url,
      headers: request.headers,
      body: Buffer.concat(chunks).toString(),
    });
    response.writeHead(reply.status, { 'Content-Type': 'application/json' });
    response.end(reply.status === 204 ? undefined : JSON.stringify(reply.data));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  onTestFinished(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  const address = server.address();
  assert(address && typeof address !== 'string');
  const permit = new Permit({
    token: 'groups-fixture',
    apiUrl: `http://127.0.0.1:${address.port}`,
    pdp: 'http://pdp.invalid',
    proxyFactsViaPdp: true,
    retry: false,
    log: { level: 'silent' },
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org');
  permit.config.apiContext.setEnvironmentLevelContext('org', 'project/one', 'environment east');
  return { permit, calls, reply };
}

test('all eight operations send the selected schema context, encoded keys and exact JSON bodies', async () => {
  const { permit, calls, reply } = await wire();
  const api = permit.api.groups;
  expect(await api.create(group)).toEqual(read);
  reply.data = direct;
  expect(await api.get(group.group_instance_key)).toEqual(direct);
  expect(await api.get(direct.id)).toEqual(direct);
  reply.data = { data: [direct], total_count: 8, page_count: 4 };
  expect(await api.list()).toEqual(reply.data);
  reply.data = read;
  expect(await api.assignUser(group.group_instance_key, 'alice / east', membership)).toEqual(read);
  expect(await api.assignRole(direct.id, role)).toEqual(read);
  reply.status = 204;
  expect(await api.removeUser(direct.id, 'alice / east', membership)).toBeUndefined();
  expect(await api.removeRole(group.group_instance_key, role)).toBeUndefined();
  expect(await api.delete(group.group_instance_key)).toBeUndefined();
  expect(await api.delete(direct.id)).toBeUndefined();
  expect(calls.map(({ method, path, body }) => [method, path, body])).toEqual([
    ['POST', prefix, JSON.stringify(group)],
    ['GET', `${prefix}/direct/${encodedGroup}`, ''],
    ['GET', `${prefix}/direct/${direct.id}`, ''],
    ['GET', `${prefix}/direct?page=1&per_page=100`, ''],
    ['PUT', `${prefix}/${encodedGroup}/users/alice%20%2F%20east`, JSON.stringify(membership)],
    ['POST', `${prefix}/${direct.id}/roles`, JSON.stringify(role)],
    ['DELETE', `${prefix}/${direct.id}/users/alice%20%2F%20east`, JSON.stringify(membership)],
    ['DELETE', `${prefix}/${encodedGroup}/roles`, JSON.stringify(role)],
    ['DELETE', `${prefix}/${encodedGroup}`, ''],
    ['DELETE', `${prefix}/${direct.id}`, ''],
  ]);
  expect(calls.every(({ headers }) => headers.authorization === 'Bearer groups-fixture')).toBe(
    true,
  );
  for (const call of calls.filter(({ body }) => body !== '')) {
    expect(call.headers['content-type']).toContain('application/json');
    expect(Number(call.headers['content-length'])).toBe(Buffer.byteLength(call.body));
  }
});

test('direct pagination preserves counts, extra response fields and empty pages', async () => {
  const { permit, calls, reply } = await wire();
  reply.data = {
    data: [{ ...direct, future_field: 'preserved' }],
    total_count: 17,
    page_count: 9,
    future_envelope: true,
  };
  expect(
    await permit.api.groups.list({
      tenant: 'tenant / east',
      resource: 'team:regional',
      search: 'support & sales',
      page: 2,
      perPage: 2,
    }),
  ).toEqual(reply.data);
  const query = new URL(calls[0]?.path ?? '', 'http://fixture.invalid').searchParams;
  expect(Object.fromEntries(query)).toEqual({
    tenant: 'tenant / east',
    resource: 'team:regional',
    page: '2',
    per_page: '2',
    search: 'support & sales',
  });
  reply.data = { data: [], total_count: 17 };
  expect(await permit.api.groups.list({ page: 10, perPage: 2 })).toEqual(reply.data);
  expect(calls[1]?.path).toBe(`${prefix}/direct?page=10&per_page=2`);
  reply.data = { data: [], total_count: 0, page_count: 0 };
  expect(await permit.api.groups.list({ tenant: '', resource: '', search: '' })).toEqual(
    reply.data,
  );
  expect(calls[2]?.path).toBe(`${prefix}/direct?tenant=&resource=&page=1&per_page=100&search=`);
});

const operations: Array<[string, (api: IGroupsApi) => Promise<unknown>]> = [
  ['create', (api) => api.create(group)],
  ['delete', (api) => api.delete(group.group_instance_key)],
  ['list', (api) => api.list()],
  ['get', (api) => api.get(group.group_instance_key)],
  ['assignUser', (api) => api.assignUser(group.group_instance_key, 'alice', membership)],
  ['removeUser', (api) => api.removeUser(group.group_instance_key, 'alice', membership)],
  ['assignRole', (api) => api.assignRole(group.group_instance_key, role)],
  ['removeRole', (api) => api.removeRole(group.group_instance_key, role)],
];

test.each(operations)(
  '%s propagates rejected HTTP requests as PermitApiError',
  async (_name, call) => {
    const { permit, calls, reply } = await wire();
    reply.status = 422;
    reply.data = { message: 'Group request rejected', error_code: 'INVALID_GROUP' };
    const error: unknown = await call(permit.api.groups).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PermitApiError);
    assert(error instanceof PermitApiError);
    expect(error.message).toContain('Group request rejected');
    expect(error.response?.status).toBe(422);
    expect(calls).toHaveLength(1);
  },
);

test.each(operations)('%s rejects a missing environment before transport', async (_name, call) => {
  let calls = 0;
  const caller = axios.create({
    adapter: async () => {
      calls++;
      throw new Error('Unexpected transport');
    },
  });
  const permit = new Permit({
    token: 'groups-fixture',
    axiosInstance: caller,
    log: { level: 'silent' },
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project');
  permit.config.apiContext.setProjectLevelContext('org', 'project');
  await expect(call(permit.api.groups)).rejects.toBeInstanceOf(PermitContextError);
  expect(calls).toBe(0);
});

test('unexpected transport failures remain visible to Groups callers', async () => {
  const failure = new Error('Adapter failed');
  const permit = new Permit({
    token: 'groups-fixture',
    axiosInstance: axios.create({
      adapter: async () => {
        throw failure;
      },
    }),
    log: { level: 'silent' },
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
  permit.config.apiContext.setEnvironmentLevelContext('org', 'project', 'environment');
  await expect(permit.api.groups.get('team:missing')).rejects.toThrow('Adapter failed');
});
