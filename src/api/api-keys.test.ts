import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { inspect } from 'node:util';

import axios, { AxiosError, AxiosHeaders } from 'axios';
import pino from 'pino';
import { onTestFinished, test, vi } from 'vitest';

import { PermitApiError } from '#src/api/base';
import { ApiContextLevel } from '#src/api/context';
import { ApiKeysApi, type APIKeyCreate, type IApiKeysApi } from '#src/api/api-keys';
import { Permit } from '#src/index';

const body: APIKeyCreate = Object.freeze({ organization_id: 'explicit-organization' });
const read = {
  ...body,
  owner_type: 'member',
  id: 'record-id',
  created_at: '2026-10-01T00:00:00Z',
  secret: 'returned-secret',
  created_by_member: { id: 'member-id', future: { preserved: [false, 0, null] } },
  project: { id: 'project-id', extra: true },
  env: { id: 'environment-id', extra: true },
  last_used_at: '2026-10-02T00:00:00Z',
  future: true,
};

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
    token: 'manager-credential',
    apiUrl: `http://127.0.0.1:${address.port}`,
    pdp: 'http://pdp.invalid',
    proxyFactsViaPdp,
    retry: { maxRetries: 2, retryDelay: 0, maxDelay: 0, retryMethods: ['POST'] },
    log: { level: 'silent' },
  });
  return { permit, calls, reply };
}

test.each([true, false])(
  'six exact control-plane operations work without context initialization (proxy %s)',
  async (proxy) => {
    const { permit, calls, reply } = await wire(proxy);
    const api = permit.api.apiKeys;
    expect(permit.config.apiContext.contextLevel).toBe(ApiContextLevel.WAIT_FOR_INIT);
    expect(await api.create(body)).toEqual(read);
    expect(await api.get('id /?#%')).toEqual(read);
    reply.data = { data: [read], total_count: 9, page_count: 1, future: { retained: true } };
    expect(await api.list()).toEqual(reply.data);
    reply.data = { ...read, id: 'new-record-id', secret: 'new-secret' };
    expect(await api.rotate('id /?#%')).toEqual(reply.data);
    reply.data = { organization_id: 'org', project_id: 'project', future: true };
    expect(await api.getScope()).toEqual(reply.data);
    reply.status = 204;
    expect(await api.delete('id /?#%')).toBeUndefined();
    expect(calls.map(({ method, path, body: value }) => [method, path, value])).toEqual([
      ['POST', '/v2/api-key', JSON.stringify(body)],
      ['GET', '/v2/api-key/id%20%2F%3F%23%25', ''],
      ['GET', '/v2/api-key?page=1&per_page=100', ''],
      ['POST', '/v2/api-key/id%20%2F%3F%23%25/rotate-secret', ''],
      ['GET', '/v2/api-key/scope', ''],
      ['DELETE', '/v2/api-key/id%20%2F%3F%23%25', ''],
    ]);
    for (const call of calls) {
      expect(call.headers.authorization).toBe('Bearer manager-credential');
      expect(call.headers['x-wait-timeout']).toBeUndefined();
      expect(call.headers['x-timeout-policy']).toBeUndefined();
    }
    expect(calls[0]?.headers['content-type']).toContain('application/json');
    expect(permit.config.apiContext.contextLevel).toBe(ApiContextLevel.WAIT_FOR_INIT);
    expect(permit.config.token).toBe('manager-credential');
    expect('waitForSync' in api).toBe(false);
    expect('update' in api).toBe(false);
  },
);

test('list snapshots filters and preserves empty/full pagination envelopes', async () => {
  const { permit, calls, reply } = await wire();
  const params = { objectType: 'project' as const, projId: 'project / &east', page: 2, perPage: 3 };
  reply.data = { data: [read], total_count: 19, page_count: 1, future: true };
  const pending = permit.api.apiKeys.list(params);
  params.projId = 'changed';
  params.page = 9;
  expect(await pending).toEqual(reply.data);
  const query = new URL(calls[0]?.path ?? '', 'http://fixture.invalid').searchParams;
  expect(Object.fromEntries(query)).toEqual({
    object_type: 'project',
    proj_id: 'project / &east',
    page: '2',
    per_page: '3',
  });
  reply.data = { data: [], total_count: 0, page_count: 0 };
  expect(await permit.api.apiKeys.list({ projId: '', page: 1, perPage: 100 })).toEqual(reply.data);
  expect(calls[1]?.path).toBe('/v2/api-key?proj_id=&page=1&per_page=100');
  reply.data = { data: [], total_count: 7 };
  expect(await permit.api.apiKeys.list({ perPage: 1 })).toEqual(reply.data);
});

test.each([
  { organization_id: 'org', object_type: 'org' as const },
  { organization_id: 'org', project_id: 'project', object_type: 'project' as const },
  {
    organization_id: 'org',
    project_id: 'project',
    environment_id: 'env',
    object_type: 'env' as const,
    access_level: 'read' as const,
    owner_type: 'member' as const,
    name: '',
  },
])(
  'create preserves explicitly supplied scope without injecting selected scope: %j',
  async (key) => {
    const { permit, calls, reply } = await wire();
    permit.config.apiContext._saveApiKeyAccessibleScope('selected-org');
    permit.config.apiContext.setEnvironmentLevelContext(
      'selected-org',
      'selected-proj',
      'selected-env',
    );
    const input = Object.freeze(key);
    reply.data = { ...read, secret: 'response-only-secret' };
    expect(await permit.api.apiKeys.create(input)).toEqual(reply.data);
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual(input);
    expect(calls).toHaveLength(1);
  },
);

test('create snapshots input before generated authentication awaits and preserves absent secrets', async () => {
  const { permit, calls, reply } = await wire();
  const input = { organization_id: 'original-org', name: 'original-name' };
  const { secret: _secret, ...withoutSecret } = read;
  reply.data = withoutSecret;
  const pending = permit.api.apiKeys.create(input);
  input.organization_id = 'changed';
  input.name = 'changed';
  expect(await pending).toEqual(withoutSecret);
  expect(JSON.parse(calls[0]?.body ?? '')).toEqual({
    organization_id: 'original-org',
    name: 'original-name',
  });
  expect('secret' in (await permit.api.apiKeys.get('id'))).toBe(false);
  expect('secret' in (await permit.api.apiKeys.rotate('id'))).toBe(false);
});

test.each([
  { organization_id: 'org' },
  { organization_id: 'org', project_id: null, environment_id: null },
  { organization_id: 'org', project_id: 'project', environment_id: null },
  { organization_id: 'org', project_id: 'project' },
  { organization_id: 'org', project_id: 'project', environment_id: 'env' },
])(
  'scope discovery returns its exact scope without recursively initializing: %j',
  async (scope) => {
    const { permit, calls, reply } = await wire();
    reply.data = scope;
    expect(await permit.api.apiKeys.getScope()).toEqual(scope);
    expect(calls.map((call) => call.path)).toEqual(['/v2/api-key/scope']);
    expect(permit.config.apiContext.contextLevel).toBe(ApiContextLevel.WAIT_FOR_INIT);
  },
);

test('scope discovery preserves a selected context', async () => {
  const { permit, calls, reply } = await wire();
  permit.config.apiContext._saveApiKeyAccessibleScope('selected-org');
  permit.config.apiContext.setEnvironmentLevelContext(
    'selected-org',
    'selected-project',
    'selected-environment',
  );
  const selected = structuredClone(permit.config.apiContext.environmentContext);
  reply.data = { organization_id: 'credential-org' };
  expect(await permit.api.apiKeys.getScope()).toEqual(reply.data);
  expect(permit.config.apiContext.contextLevel).toBe(ApiContextLevel.ENVIRONMENT);
  expect(permit.config.apiContext.environmentContext).toEqual(selected);
  expect(calls.map((call) => call.path)).toEqual(['/v2/api-key/scope']);
});

test.each(['cycle', 'bigint', 'function'] as const)(
  'unserializable %s creation input rejects before HTTP',
  async (kind) => {
    const { permit, calls } = await wire();
    const input: Record<string, unknown> = { organization_id: 'explicit-org' };
    if (kind === 'cycle') input['unsupported'] = input;
    if (kind === 'bigint') input['unsupported'] = 1n;
    if (kind === 'function') input['unsupported'] = () => undefined;
    await expect(
      permit.api.apiKeys.create(input as unknown as APIKeyCreate),
    ).rejects.toBeInstanceOf(PermitApiError);
    expect(calls).toEqual([]);
  },
);

const operations: Array<[string, (api: IApiKeysApi) => Promise<unknown>]> = [
  ['list', (api) => api.list()],
  ['get', (api) => api.get('record-id')],
  ['create', (api) => api.create(body)],
  ['delete', (api) => api.delete('record-id')],
  ['rotate', (api) => api.rotate('record-id')],
  ['getScope', (api) => api.getScope()],
];

test.each(operations)('%s preserves HTTP refusal without fallback', async (_, call) => {
  const { permit, calls, reply } = await wire();
  for (const status of [401, 403, 404, 422, 503]) {
    reply.status = status;
    reply.data = { detail: 'API key operation refused', error_code: 'KEY_REFUSED' };
    const error: unknown = await call(permit.api.apiKeys).catch((e: unknown) => e);
    assert(error instanceof PermitApiError);
    expect(error.status).toBe(status);
    expect(error.response?.status).toBe(status);
    expect(error.message).toContain('API key operation refused');
  }
  expect(calls).toHaveLength(5);
});

test.each(operations)('%s propagates detached transport failures', async (_, call) => {
  const raw = new AxiosError('Connection failed', 'ECONNRESET');
  let calls = 0;
  const permit = new Permit({
    token: 'manager-credential',
    axiosInstance: axios.create({
      adapter: async () => {
        calls++;
        throw raw;
      },
    }),
    retry: false,
    throwOnError: false,
    log: { level: 'silent' },
  });
  const error: unknown = await call(permit.api.apiKeys).catch((e: unknown) => e);
  assert(error instanceof PermitApiError);
  expect(error.code).toBe('ECONNRESET');
  expect(error.originalError).not.toBe(raw);
  expect(calls).toBe(1);
});

test.each(operations)(
  '%s protects response-only secrets across errors and logs',
  async (_, call) => {
    const secret = 'RESPONSE_ONLY_KEY_SECRET';
    const lines: string[] = [];
    const raw = new AxiosError(`Remote refusal ${secret}`, 'ERR_BAD_RESPONSE');
    raw.cause = new Error(secret);
    const caller = axios.create({
      adapter: async (config) => {
        raw.config = config;
        raw.status = 422;
        raw.response = {
          data: { secret, detail: `Cannot use ${secret}`, metadata: { value: secret } },
          status: 422,
          statusText: 'Refused',
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
    const permit = new Permit({ token: 'manager-credential', axiosInstance: caller, retry: false });
    const api = new ApiKeysApi(
      permit.config,
      pino({ level: 'debug' }, { write: (line: string) => lines.push(line) }),
    );
    const error: unknown = await call(api).catch((e: unknown) => e);
    assert(error instanceof PermitApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('ERR_BAD_RESPONSE');
    for (const projection of [
      inspect(error, { depth: Infinity, showHidden: true }),
      JSON.stringify(error),
      JSON.stringify(error.formattedAxiosError),
      JSON.stringify(error.cause),
      lines.join('\n'),
    ]) {
      expect(projection).not.toContain(secret);
      expect(projection).not.toContain('manager-credential');
    }
    expect(inspect(raw, { depth: Infinity, showHidden: true })).toBe(callerSnapshot);
    expect(raw.response?.data).toEqual({
      secret,
      detail: `Cannot use ${secret}`,
      metadata: { value: secret },
    });
  },
);

test.each(operations)(
  '%s omits response-only custom codes and leaves caller data intact',
  async (_, call) => {
    for (const arrayProperty of [false, true]) {
      const secret = 'API_KEY_RESPONSE_CREDENTIAL';
      const errors = [{ msg: 'Invalid key operation' }];
      if (arrayProperty)
        Object.defineProperty(errors, 'secret', { value: secret, enumerable: true });
      const data = arrayProperty ? { errors } : { secret, detail: 'Key operation rejected' };
      const descriptor = Object.getOwnPropertyDescriptor(errors, 'secret');
      let raw: AxiosError | undefined;
      const lines: string[] = [];
      const permit = new Permit({
        token: 'manager-credential',
        retry: false,
        log: { level: 'silent' },
        axiosInstance: axios.create({
          adapter: async (config) => {
            raw = new AxiosError('Key operation rejected', secret, config, undefined, {
              data,
              status: 422,
              statusText: 'Refused',
              headers: new AxiosHeaders(),
              config,
            });
            throw raw;
          },
        }),
      });
      const api = new ApiKeysApi(
        permit.config,
        pino({ level: 'error' }, { write: (line: string) => lines.push(line) }),
      );
      const error: unknown = await call(api).catch((caught: unknown) => caught);
      assert(error instanceof PermitApiError);
      assert(raw);
      expect(error.status).toBe(422);
      expect(error.code).toBeUndefined();
      expect(raw.code).toBe(secret);
      expect(raw.response?.data).toBe(data);
      expect(Object.getOwnPropertyDescriptor(errors, 'secret')).toEqual(descriptor);
      for (const value of [
        String(error),
        JSON.stringify(error),
        inspect(error, { depth: Infinity }),
        ...lines,
      ])
        expect(value).not.toContain(secret);
    }
  },
);

test.each(['create', 'rotate'] as const)(
  '%s does not replay an ambiguous POST failure',
  async (name) => {
    const { permit, calls, reply } = await wire();
    reply.status = 503;
    reply.data = { detail: 'Response lost after operation' };
    const pending =
      name === 'create' ? permit.api.apiKeys.create(body) : permit.api.apiKeys.rotate('id');
    await expect(pending).rejects.toBeInstanceOf(PermitApiError);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    if (name === 'rotate') expect(calls[0]?.body).toBe('');
  },
);

test('record and pagination responses preserve explicit nullable output without secret recovery', async () => {
  const { permit, calls, reply } = await wire();
  const record = {
    organization_id: 'org',
    owner_type: 'member',
    id: 'nullable-key',
    created_at: 'created',
    project_id: null,
    environment_id: null,
    object_type: null,
    access_level: null,
    name: null,
    secret: null,
    created_by_member: null,
    last_used_at: null,
    env: null,
    project: null,
    additive: { preserved: true },
  };
  reply.data = record;
  expect(
    await permit.api.apiKeys.create({ organization_id: 'org', name: 'supplied-name' }),
  ).toEqual(record);
  expect(await permit.api.apiKeys.get(record.id)).toEqual(record);
  expect(await permit.api.apiKeys.rotate(record.id)).toEqual(record);
  reply.data = { data: [record], total_count: 1, page_count: null, additive: 'complete' };
  expect(await permit.api.apiKeys.list()).toEqual(reply.data);
  expect(calls.map((call) => call.method)).toEqual(['POST', 'GET', 'POST', 'GET']);
  expect(permit.config.token).toBe('manager-credential');
});
