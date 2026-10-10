import assert from 'node:assert/strict';
import { inspect } from 'node:util';

import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import pino from 'pino';

import { AuditLogsApi, type IListAuditLogs } from '#src/api/audit-logs';
import { PermitApiError } from '#src/api/base';
import { PermitContextError } from '#src/api/context';
import {
  AuditLogQueryType,
  AuditLogSortKey,
  Permit,
  type DetailedAuditLogModel,
  type RawData1,
} from '#src/index';

const prefix = 'https://control.example/v2/pdps/project%2Fone/environment%20east/audit_logs';
const logId = 'log/a?b+c=%é';
const encodedId = 'log%2Fa%3Fb%2Bc%3D%25%C3%A9';
const row: DetailedAuditLogModel = {
  id: 'log-id',
  timestamp: '2026-10-08T00:00:00Z',
  org_id: 'org',
  project_id: 'project',
  env_id: 'environment',
  raw_data: {},
};
interface Request {
  method: string | undefined;
  url: string;
  body: unknown;
  headers: AxiosHeaders;
}
function response(config: InternalAxiosRequestConfig, data: unknown, status: number) {
  return { data, status, statusText: 'Fixture response', headers: new AxiosHeaders(), config };
}
function wire(proxyFactsViaPdp = true) {
  const calls: Request[] = [];
  const reply: { status: number; data: unknown; error?: string } = {
    status: 200,
    data: { data: [], total_count: 0, pagination_count: 0 },
  };
  const permit = new Permit({
    token: 'audit-fixture',
    apiUrl: 'https://control.example',
    pdp: 'https://pdp.invalid',
    proxyFactsViaPdp,
    retry: false,
    log: { level: 'silent' },
    axiosInstance: axios.create({
      adapter: async (config) => {
        calls.push({
          method: config.method,
          url: axios.getUri(config),
          body: config.data,
          headers: new AxiosHeaders(config.headers),
        });
        if (reply.error) throw new AxiosError('Fixture transport failed', reply.error, config);
        const result = response(config, reply.data, reply.status);
        if (reply.status >= 400) {
          throw new AxiosError(
            'Audit read rejected',
            'ERR_BAD_RESPONSE',
            config,
            undefined,
            result,
          );
        }
        return result;
      },
    }),
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org');
  permit.config.apiContext.setEnvironmentLevelContext('org', 'project/one', 'environment east');
  return { permit, calls, reply };
}

test.each([true, false])('both reads use selected API scope with facts proxy %s', async (proxy) => {
  const { permit, calls, reply } = wire(proxy);
  expect(await permit.api.auditLogs.list()).toEqual(reply.data);
  reply.data = { ...row, additive: { nullish: null, count: 0, permitted: false } };
  expect(await permit.api.auditLogs.get(logId)).toEqual(reply.data);
  expect(calls.map(({ method, url, body }) => [method, url, body])).toEqual([
    ['get', `${prefix}?page=1&per_page=100`, undefined],
    ['get', `${prefix}/${encodedId}`, undefined],
  ]);
  for (const request of calls) {
    expect(request.headers.get('authorization')).toBe('Bearer audit-fixture');
    expect(request.headers.get('accept')).toContain('application/json');
    expect(request.headers.has('x-wait-timeout')).toBe(false);
    expect(request.headers.has('x-timeout-policy')).toBe(false);
  }
  expect('waitForSync' in permit.api.auditLogs).toBe(false);
  expect('replay' in permit.api.auditLogs).toBe(false);
  expect('delete' in permit.api.auditLogs).toBe(false);
});

test('all twelve filters preserve repeated entries, false, zero, empty and enum spelling', async () => {
  const { permit, calls } = wire();
  const params = Object.freeze({
    page: 0,
    perPage: 0,
    pdpId: '',
    users: Object.freeze(['a,b', '', 'é /', 'a,b']),
    decision: false,
    resources: Object.freeze(['doc:one', '', 'doc:one']),
    tenant: '',
    action: '',
    timestampFrom: 0,
    timestampTo: 17,
    sortBy: AuditLogSortKey.None,
    query: AuditLogQueryType.None,
  });
  await permit.api.auditLogs.list(params);
  const url = new URL(calls[0]!.url);
  expect(url.origin + url.pathname).toBe(prefix);
  expect([...url.searchParams]).toEqual([
    ['pdp_id', ''],
    ['users', 'a,b'],
    ['users', ''],
    ['users', 'é /'],
    ['users', 'a,b'],
    ['decision', 'false'],
    ['resources', 'doc:one'],
    ['resources', ''],
    ['resources', 'doc:one'],
    ['tenant', ''],
    ['action', ''],
    ['timestamp_from', '0'],
    ['timestamp_to', '17'],
    ['sort_by', 'None'],
    ['query', 'none'],
    ['page', '0'],
    ['per_page', '0'],
  ]);
  expect(params.users).toEqual(['a,b', '', 'é /', 'a,b']);
});

test('empty arrays omit entries and unspecified query/sort remain service defaults', async () => {
  const { permit, calls } = wire();
  await permit.api.auditLogs.list({ users: [], resources: [], page: 2, perPage: 3 });
  expect(calls[0]?.url).toBe(`${prefix}?page=2&per_page=3`);
  await permit.api.auditLogs.list(undefined);
  expect(calls[1]?.url).toBe(`${prefix}?page=1&per_page=100`);
});

test('snapshots filters before context discovery and excludes forged scope or unknown fields', async () => {
  const { permit, calls } = wire();
  const users = ['before'],
    resources = ['document'];
  const params = {
    users,
    resources,
    decision: false,
    timestampFrom: 0,
    page: 2,
    perPage: 3,
    projId: 'forged',
    envId: 'forged',
    includeTotalCount: true,
  };
  const pending = permit.api.auditLogs.list(params);
  users[0] = 'after';
  resources.push('other');
  params.decision = true;
  params.timestampFrom = 19;
  params.page = 9;
  params.perPage = 10;
  await pending;
  const query = new URL(calls[0]!.url).searchParams;
  expect([...query]).toEqual([
    ['users', 'before'],
    ['decision', 'false'],
    ['resources', 'document'],
    ['timestamp_from', '0'],
    ['page', '2'],
    ['per_page', '3'],
  ]);
  expect(calls[0]?.url.startsWith(prefix)).toBe(true);
});

test('a filter snapshot failure rejects before scope discovery or traffic', async () => {
  const { permit, calls } = wire();
  const params: IListAuditLogs = {
    get users(): readonly string[] {
      throw new Error('Cannot read caller array');
    },
  };
  await expect(permit.api.auditLogs.list(params)).rejects.toBeInstanceOf(PermitApiError);
  expect(calls).toEqual([]);
});

const rawBranches: RawData1[] = [
  {
    engine: 'OPA',
    decision_id: 'decision',
    labels: { id: 'opa', version: '1' },
    timestamp: row.timestamp,
    path: 'permit/allow',
    metrics: { timer_rego_query_eval_ns: 0 },
    input: { user: 'alice' },
    result: false,
  },
  {
    engine: 'AVP',
    timestamp: row.timestamp,
    tenant: 'east',
    process_time_ms: 0,
    input: { principal: 'alice' },
    result: { decision: false },
  },
  {
    engine: 'GENERIC',
    timestamp: row.timestamp,
    decision: false,
    input: { user: 'alice' },
    result: null,
    context: { custom: ['value'] },
  },
  { engine: 'OPA' },
  {},
];
test.each(rawBranches)(
  'list and detail preserve complete received raw-data branch %#',
  async (raw) => {
    const { permit, reply } = wire();
    const detail = {
      ...row,
      raw_data: raw,
      decision: false,
      user_key: '',
      reason: '',
      input: null,
      result: { allowed: false },
      context: { amount: 0 },
      objects: { id: 'objects', user_object: { key: 'alice' } },
      additive: [null, false, 0],
    };
    reply.data = detail;
    expect(await permit.api.auditLogs.get('log-id')).toEqual(detail);
    reply.data = {
      data: [detail, { ...row, raw_data: undefined }],
      total_count: 0,
      pagination_count: 0,
      page_count: 0,
      additional: { nested: true },
    };
    expect(await permit.api.auditLogs.list()).toEqual(reply.data);
  },
);

test('list and detail retain nullable optional audit output through nested engine and objects', async () => {
  const { permit, reply } = wire();
  const detail: DetailedAuditLogModel = {
    ...row,
    decision: null,
    user_key: null,
    user_email: null,
    pdp_config_id: null,
    objects: {
      id: null,
      action_object: null,
      user_object: {
        id: 'user',
        key: 'alice',
        created_at: row.timestamp,
        updated_at: row.timestamp,
        email: null,
        first_name: null,
        attributes: null,
        roles: null,
        assigned_roles: null,
      },
    },
    raw_data: {
      engine: null,
      decision_id: 'decision',
      labels: { id: 'opa', version: '1' },
      timestamp: row.timestamp,
      path: 'permit/allow',
      metrics: { timer_rego_query_eval_ns: null },
    },
  };
  reply.data = detail;
  expect(await permit.api.auditLogs.get('log-id')).toEqual(detail);
  reply.data = {
    data: [detail, { ...row, raw_data: null }],
    total_count: 2,
    pagination_count: 2,
    page_count: null,
  };
  expect(await permit.api.auditLogs.list()).toEqual(reply.data);
  reply.data = { ...detail, objects: null };
  expect(await permit.api.auditLogs.get('log-id')).toEqual(reply.data);
});

test.each(['list', 'get'] as const)(
  '%s initializes missing scope through the API',
  async (method) => {
    const urls: string[] = [];
    const permit = new Permit({
      token: 'scope-fixture',
      apiUrl: 'https://control.example',
      retry: false,
      log: { level: 'silent' },
      axiosInstance: axios.create({
        adapter: async (config) => {
          urls.push(axios.getUri(config));
          return response(
            config,
            config.url?.endsWith('/v2/api-key/scope')
              ? {
                  organization_id: 'org',
                  project_id: 'project/one',
                  environment_id: 'environment east',
                }
              : method === 'list'
                ? { data: [], total_count: 0, pagination_count: 0 }
                : row,
            200,
          );
        },
      }),
    });
    await (method === 'list' ? permit.api.auditLogs.list() : permit.api.auditLogs.get(logId));
    expect(urls).toEqual([
      'https://control.example/v2/api-key/scope',
      method === 'list' ? `${prefix}?page=1&per_page=100` : `${prefix}/${encodedId}`,
    ]);
  },
);

test.each(['list', 'get'] as const)(
  '%s rejects missing environment without traffic',
  async (method) => {
    const { permit, calls } = wire();
    permit.config.apiContext.setProjectLevelContext('org', 'project');
    await expect(
      method === 'list' ? permit.api.auditLogs.list() : permit.api.auditLogs.get('id'),
    ).rejects.toBeInstanceOf(PermitContextError);
    expect(calls).toEqual([]);
  },
);

test.each(['list', 'get'] as const)(
  '%s context lookup failures reject and can recover',
  async (method) => {
    let status = 503,
      traffic = 0;
    const permit = new Permit({
      token: 'scope-fixture',
      apiUrl: 'https://control.example',
      retry: false,
      log: { level: 'silent' },
      axiosInstance: axios.create({
        adapter: async (config) => {
          traffic += 1;
          const data = config.url?.endsWith('/v2/api-key/scope')
            ? { organization_id: 'org', project_id: 'project', environment_id: 'environment' }
            : row;
          const result = response(config, data, status);
          if (status >= 400)
            throw new AxiosError(
              'Scope unavailable',
              'ERR_BAD_RESPONSE',
              config,
              undefined,
              result,
            );
          return result;
        },
      }),
    });
    const call = () =>
      method === 'list' ? permit.api.auditLogs.list() : permit.api.auditLogs.get('id');
    await expect(call()).rejects.toBeInstanceOf(PermitContextError);
    expect(traffic).toBe(1);
    status = 200;
    await call();
    expect(traffic).toBe(3);
  },
);

for (const method of ['list', 'get'] as const) {
  test.each([400, 401, 403, 404, 422, 429, 500, 503])(
    `${method} propagates HTTP %s without fallback`,
    async (status) => {
      const { permit, reply } = wire();
      reply.status = status;
      reply.data = { detail: 'Rejected' };
      const error: unknown = await (
        method === 'list' ? permit.api.auditLogs.list() : permit.api.auditLogs.get('id')
      ).catch((caught: unknown) => caught);
      assert(error instanceof PermitApiError);
      expect(error.status).toBe(status);
      expect(error.originalError.response?.status).toBe(status);
    },
  );
  test.each(['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'])(
    `${method} propagates %s`,
    async (code) => {
      const { permit, reply } = wire();
      reply.error = code;
      const error: unknown = await (
        method === 'list' ? permit.api.auditLogs.list() : permit.api.auditLogs.get('id')
      ).catch((caught: unknown) => caught);
      assert(error instanceof PermitApiError);
      expect(error.code).toBe(code);
    },
  );
}

test.each(
  (['list', 'get'] as const).flatMap((method) =>
    (['raw_data', 'input', 'context', 'user_email'] as const).map((field) => ({ method, field })),
  ),
)(
  '$method response-only $field remains private across code, cause, projections and logs',
  async ({ method, field }) => {
    const secret = 'AUDIT_RESPONSE_PRIVATE_CANARY',
      logs: string[] = [],
      rawErrors: AxiosError[] = [];
    const logger = pino(
      { level: 'error' },
      {
        write(value: string) {
          logs.push(value);
        },
      },
    );
    const data = { detail: `Rejected ${secret}`, [field]: { nested: secret } };
    const permit = new Permit({
      token: 'audit-fixture',
      apiUrl: 'https://control.example',
      retry: false,
      log: { level: 'silent' },
      axiosInstance: axios.create({
        adapter: async (config) => {
          const raw = new AxiosError(
            `Failed ${secret}`,
            secret,
            config,
            undefined,
            response(config, data, 422),
          );
          rawErrors.push(raw);
          throw raw;
        },
      }),
    });
    permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
    const api = new AuditLogsApi(permit.config, logger);
    const error: unknown = await (method === 'list' ? api.list() : api.get('log-id')).catch(
      (caught: unknown) => caught,
    );
    assert(error instanceof PermitApiError);
    const projections = [
      error.message,
      error.code,
      JSON.stringify(error),
      inspect(error, { showHidden: true, depth: 8 }),
      inspect(error, { showHidden: true, customInspect: false, depth: 12 }),
      ...logs,
    ].join(' ');
    expect(projections).not.toContain(secret);
    expect(error.status).toBe(422);
    expect(error.originalError.config?.data).toBeUndefined();
    expect(rawErrors[0]?.code).toBe(secret);
    expect(rawErrors[0]?.response?.data).toBe(data);
    expect(data[field]).toEqual({ nested: secret });
  },
);
