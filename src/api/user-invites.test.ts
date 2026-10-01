import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { inspect } from 'node:util';

import axios, { AxiosError, AxiosHeaders } from 'axios';
import pino from 'pino';
import { onTestFinished, test, vi } from 'vitest';

import { PermitApiError } from '#src/api/base';
import { PermitContextError } from '#src/api/context';
import {
  UserInvitesApi,
  type ElementsUserInviteCreate,
  type IUserInvitesApi,
} from '#src/api/user-invites';
import { Permit } from '#src/index';

const invite: ElementsUserInviteCreate = Object.freeze({
  key: null,
  status: 'pending',
  email: 'requested@example.com',
  first_name: null,
  last_name: null,
  role_id: 'eaf54312-e329-4f53-9e35-3e815e23f62b',
  tenant_id: '3058d6f6-2c6e-4828-b8ac-0e3af627b50d',
  resource_instance_id: null,
});
const id = '06e3805a-ae67-4c49-a102-f5f0c45bbf86';
const read = {
  ...invite,
  id,
  organization_id: 'org',
  project_id: 'project',
  environment_id: 'environment',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};
const approval = Object.freeze({ email: invite.email, key: 'approved-user', attributes: null });
const user = {
  ...read,
  key: approval.key,
  attributes: null,
  associated_tenants: [{ tenant: 'east', roles: ['reader'], status: 'pending' }],
};
const prefix = '/v2/facts/project%2Fone/environment%20east/user_invites';

interface Request {
  method: string | undefined;
  path: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

async function wire(proxyFactsViaPdp = true) {
  const calls: Request[] = [];
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
    token: 'invite-fixture',
    apiUrl: `http://127.0.0.1:${address.port}`,
    pdp: 'http://pdp.invalid',
    proxyFactsViaPdp,
    retry: false,
    log: { level: 'silent' },
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org');
  permit.config.apiContext.setEnvironmentLevelContext('org', 'project/one', 'environment east');
  return { permit, calls, reply };
}

test.each([true, false])(
  'all six operations use exact direct wire contracts (proxy %s)',
  async (proxy) => {
    const { permit, calls, reply } = await wire(proxy);
    const api = permit.api.userInvites;
    expect(await api.create(invite)).toEqual(read);
    expect(await api.get(id)).toEqual(read);
    const update = Object.freeze({ ...invite, key: 'suggested-user', first_name: 'Ada' });
    expect(await api.update(id, update)).toEqual(read);
    reply.data = { data: [read], total_count: 7, page_count: 1, future_field: 'preserved' };
    expect(await api.list()).toEqual(reply.data);
    reply.data = user;
    expect(await api.approve(id, approval)).toEqual(user);
    reply.status = 204;
    expect(await api.delete(id)).toBeUndefined();
    expect(calls.map(({ method, path, body }) => [method, path, body])).toEqual([
      ['POST', prefix, JSON.stringify(invite)],
      ['GET', `${prefix}/${id}`, ''],
      ['PATCH', `${prefix}/${id}`, JSON.stringify(update)],
      ['GET', `${prefix}?page=1&per_page=100`, ''],
      ['POST', `${prefix}/${id}/approve`, JSON.stringify(approval)],
      ['DELETE', `${prefix}/${id}`, ''],
    ]);
    for (const call of calls) {
      expect(call.headers.authorization).toBe('Bearer invite-fixture');
      expect(call.headers['x-wait-timeout']).toBeUndefined();
      expect(call.headers['x-timeout-policy']).toBeUndefined();
      if (call.body) expect(call.headers['content-type']).toContain('application/json');
    }
    expect(invite.key).toBeNull();
    expect(approval.attributes).toBeNull();
    expect('waitForSync' in api).toBe(false);
  },
);

test('list snapshots filters and preserves IDs and complete pages', async () => {
  const { permit, calls, reply } = await wire();
  const params = {
    role: 'role / east',
    tenant: 'tenant:one',
    search: 'name & email',
    page: 2,
    perPage: 3,
  };
  reply.data = { data: [{ ...read, extra: true }], total_count: 19, page_count: 1, extra: true };
  const pending = permit.api.userInvites.list(params);
  params.role = 'changed';
  params.page = 9;
  expect(await pending).toEqual(reply.data);
  const query = new URL(calls[0]?.path ?? '', 'http://fixture.invalid').searchParams;
  expect(Object.fromEntries(query)).toEqual({
    role: 'role / east',
    tenant: 'tenant:one',
    search: 'name & email',
    page: '2',
    per_page: '3',
  });
  reply.data = { data: [], total_count: 19 };
  expect(await permit.api.userInvites.list({ role: '', tenant: '', search: '' })).toEqual(
    reply.data,
  );
  reply.data = { ...read, future: true };
  expect(await permit.api.userInvites.get('id / encoded')).toEqual(reply.data);
  expect(calls[2]?.path).toBe(`${prefix}/id%20%2F%20encoded`);
});

const operations: Array<[string, (api: IUserInvitesApi) => Promise<unknown>]> = [
  ['list', (api) => api.list()],
  ['create', (api) => api.create(invite)],
  ['get', (api) => api.get(id)],
  ['update', (api) => api.update(id, invite)],
  ['delete', (api) => api.delete(id)],
  ['approve', (api) => api.approve(id, approval)],
];

test.each(operations)(
  '%s fails without selected environment before operation traffic',
  async (_, call) => {
    let calls = 0;
    const permit = new Permit({
      token: 'invite-fixture',
      axiosInstance: axios.create({
        adapter: async () => {
          calls++;
          throw new Error('Unexpected transport');
        },
      }),
      log: { level: 'silent' },
    });
    permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project');
    permit.config.apiContext.setProjectLevelContext('org', 'project');
    await expect(call(permit.api.userInvites)).rejects.toBeInstanceOf(PermitContextError);
    expect(calls).toBe(0);
  },
);

test.each(operations)('%s retains normal HTTP failures and status metadata', async (_, call) => {
  const { permit, calls, reply } = await wire();
  for (const status of [401, 403, 404, 422, 503]) {
    reply.status = status;
    reply.data = { detail: 'Invite operation rejected', error_code: 'INVITE_REJECTED' };
    const error: unknown = await call(permit.api.userInvites).catch((caught: unknown) => caught);
    assert(error instanceof PermitApiError);
    expect(error.status).toBe(status);
    expect(error.message).toContain('Invite operation rejected');
    expect(error.response?.status).toBe(status);
  }
  expect(calls).toHaveLength(5);
});

test('real HTTP approval refusal drops unknown stored email text and body', async () => {
  const { permit, reply } = await wire();
  const storedEmail = 'unknown-stored@example.com';
  reply.status = 400;
  reply.data = {
    detail: `Requested ${approval.email} differs from stored ${storedEmail}`,
  };
  const error: unknown = await permit.api.userInvites.approve(id, approval).catch((e) => e);
  assert(error instanceof PermitApiError);
  expect(error.status).toBe(400);
  expect(error.message).toContain('approval refused');
  expect(error.response).toBeUndefined();
  expect(inspect(error, { depth: 8 })).not.toContain(storedEmail);
  expect(JSON.stringify(error.formattedAxiosError)).not.toContain(approval.email);
});

test('approval refusal detaches public/log surfaces and preserves caller error', async () => {
  const storedEmail = 'private-stored@example.com';
  const lines: string[] = [];
  const raw = new AxiosError(`Refused: ${storedEmail}`, 'ERR_BAD_REQUEST');
  raw.cause = new Error(`Stored email ${storedEmail}`);
  const caller = axios.create({
    adapter: async (config) => {
      raw.config = config;
      raw.status = 400;
      raw.response = {
        data: { detail: `${storedEmail} differs from ${approval.email}`, extra: 'remote-only' },
        status: 400,
        statusText: 'Bad Request',
        headers: new AxiosHeaders({ 'content-type': 'application/json' }),
        config,
      };
      throw raw;
    },
  });
  let callerSnapshot: string | undefined;
  const request = caller.request.bind(caller);
  vi.spyOn(caller, 'request').mockImplementation(async (config) => {
    try {
      return await request(config);
    } catch (error) {
      callerSnapshot = inspect(error, { depth: Infinity, showHidden: true });
      throw error;
    }
  });
  const permit = new Permit({
    token: 'invite-fixture',
    axiosInstance: caller,
    retry: false,
    log: { level: 'silent' },
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
  const api = new UserInvitesApi(
    permit.config,
    pino(
      { level: 'error' },
      {
        write: (line: string) => lines.push(line),
      },
    ),
  );
  const error: unknown = await api.approve(id, approval).catch((e) => e);
  assert(error instanceof PermitApiError);
  expect(error.status).toBe(400);
  expect(error.code).toBe('ERR_BAD_REQUEST');
  expect(error.response).toBeUndefined();
  expect(error.originalError.config?.url).toContain(`/user_invites/${id}/approve`);
  const surfaces = [
    inspect(error, { depth: Infinity, showHidden: true }),
    error.message,
    error.stack,
    JSON.stringify(error),
    JSON.stringify(error.formattedAxiosError),
    ...lines,
  ].join('\n');
  expect(surfaces).not.toContain(storedEmail);
  expect(surfaces).not.toContain(approval.email);
  expect(lines).toHaveLength(1);
  expect(inspect(raw, { depth: Infinity, showHidden: true })).toBe(callerSnapshot);
  expect(raw.response?.data).toEqual({
    detail: `${storedEmail} differs from ${approval.email}`,
    extra: 'remote-only',
  });
});

test('other HTTP400 and ordinary adapter failures retain established diagnostics', async () => {
  const { permit, reply } = await wire();
  reply.status = 400;
  reply.data = { detail: 'Create refused for a missing tenant' };
  await expect(permit.api.userInvites.create(invite)).rejects.toThrow('Create refused');
  const failing = new Permit({
    token: 'invite-fixture',
    log: { level: 'silent' },
    axiosInstance: axios.create({
      adapter: async () => {
        throw new Error('Adapter unavailable');
      },
    }),
  });
  failing.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
  await expect(failing.api.userInvites.get(id)).rejects.toThrow('Adapter unavailable');
});
