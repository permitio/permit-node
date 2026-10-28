import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';

import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import pino from 'pino';

import { EnvironmentsApi } from '#src/api/environments';
import { PermitApiError } from '#src/api/base';
import { PermitContextError } from '#src/api/context';
import {
  Permit,
  TaskStatus,
  type EnvironmentCopy,
  type EnvironmentRead,
  type IRetryConfig,
  type TaskResultEnvironmentRead,
} from '#src/index';

const project = 'project/one?é';
const source = 'source east/#';
const taskId = 'task/a?b+c=%é';
const prefix =
  'https://control.example/v2/projects/project%2Fone%3F%C3%A9/envs/source%20east%2F%23';
const resultPath = `${prefix}/copy/async/task%2Fa%3Fb%2Bc%3D%25%C3%A9/result`;
const body: EnvironmentCopy = {
  target_env: {
    new: {
      key: 'target',
      name: 'Target',
      description: '',
      custom_branch_name: 'branch',
      jwks: { url: 'https://keys.example/jwks' },
      settings: { custom: { count: 0, enabled: false, value: null } },
    },
    existing: 'published target fields are forwarded',
  },
  conflict_strategy: 'overwrite',
  scope: {
    resources: { include: ['doc', 'doc'], exclude: [] },
    roles: { include: [], exclude: ['other'] },
    user_sets: { include: ['active'] },
    resource_sets: { exclude: ['archived'] },
    custom_policies: { include: ['policy'], exclude: [] },
  },
};
const environment: EnvironmentRead = {
  key: 'target',
  name: 'Target',
  id: 'environment-id',
  organization_id: 'org',
  project_id: 'project-id',
  created_at: '2026-10-08T00:00:00Z',
  updated_at: '2026-10-08T00:01:00Z',
  description: '',
  custom_branch_name: 'branch',
  avp_policy_store_id: 'store',
  jwks: { url: 'https://keys.example/jwks' },
  settings: { count: 0, enabled: false, value: null },
};
const processing: TaskResultEnvironmentRead = {
  task_id: taskId,
  status: TaskStatus.Processing,
  result: null,
  error: null,
};
interface Request {
  method: string | undefined;
  url: string;
  body: unknown;
  timeout: number | undefined;
  headers: AxiosHeaders;
}
function response(config: InternalAxiosRequestConfig, data: unknown, status: number) {
  return { data, status, statusText: 'Fixture response', headers: new AxiosHeaders(), config };
}
function wire(
  options: {
    proxy?: boolean;
    seed?: boolean;
    retry?: IRetryConfig | false;
  } = {},
) {
  const calls: Request[] = [];
  const reply: { data: unknown; status: number; code?: string } = { data: processing, status: 202 };
  const permit = new Permit({
    token: 'async-copy-fixture',
    apiUrl: 'https://control.example',
    pdp: 'https://pdp.invalid',
    proxyFactsViaPdp: options.proxy ?? true,
    retry: options.retry ?? false,
    log: { level: 'silent' },
    axiosInstance: axios.create({
      timeout: 4711,
      adapter: async (config) => {
        calls.push({
          method: config.method,
          url: axios.getUri(config),
          body: config.data,
          timeout: config.timeout,
          headers: new AxiosHeaders(config.headers),
        });
        if (reply.code) throw new AxiosError('Transport unavailable', reply.code, config);
        const result = response(config, reply.data, reply.status);
        if (reply.status >= 400)
          throw new AxiosError('Request rejected', 'ERR_BAD_RESPONSE', config, undefined, result);
        return result;
      },
    }),
  });
  if (options.seed !== false) permit.config.apiContext._saveApiKeyAccessibleScope('org');
  return { permit, calls, reply };
}

test.each([true, false])(
  'uses explicit source/task API paths with facts proxy %s',
  async (proxy) => {
    const { permit, calls, reply } = wire({ proxy });
    permit.config.apiContext.setEnvironmentLevelContext('org', 'selected-project', 'selected-env');
    expect(await permit.api.environments.copyAsync(project, source, body)).toEqual(processing);
    reply.status = 200;
    expect(await permit.api.environments.getCopyResult(project, source, taskId)).toEqual(
      processing,
    );
    expect(calls.map(({ method, url, body: sent }) => [method, url, sent])).toEqual([
      ['post', `${prefix}/copy/async`, JSON.stringify(body)],
      ['get', resultPath, undefined],
    ]);
    expect(calls).toHaveLength(2);
    for (const request of calls) {
      expect(request.headers.get('authorization')).toBe('Bearer async-copy-fixture');
      expect(request.headers.has('x-wait-timeout')).toBe(false);
      expect(request.headers.has('x-timeout-policy')).toBe(false);
      expect(request.timeout).toBeGreaterThan(0);
      expect(request.timeout).toBeLessThanOrEqual(4711);
    }
  },
);

test.each([undefined, 0, 0.25, 60])('forwards wait %s on both routes', async (wait) => {
  const { permit, calls } = wire();
  await permit.api.environments.copyAsync(project, source, body, wait);
  await permit.api.environments.getCopyResult(project, source, taskId, wait);
  expect(calls.map(({ url }) => [...new URL(url).searchParams])).toEqual([
    wait === undefined ? [] : [['wait', String(wait)]],
    wait === undefined ? [] : [['wait', String(wait)]],
  ]);
});

test.each([null, '0', true, false, NaN, Infinity, -Infinity, -1, 60.01, {}, []])(
  'rejects invalid wait %s before discovery or traffic',
  async (wait) => {
    const { permit, calls } = wire({ seed: false });
    const submit = Reflect.apply(permit.api.environments.copyAsync, permit.api.environments, [
      project,
      source,
      body,
      wait,
    ]);
    await expect(submit).rejects.toBeInstanceOf(RangeError);
    const read = Reflect.apply(permit.api.environments.getCopyResult, permit.api.environments, [
      project,
      source,
      taskId,
      wait,
    ]);
    await expect(read).rejects.toBeInstanceOf(RangeError);
    expect(calls).toEqual([]);
  },
);

test.each([
  processing,
  { task_id: taskId, status: TaskStatus.Success, result: environment, error: null },
  {
    task_id: taskId,
    status: TaskStatus.Failure,
    result: null,
    error: {
      id: 'error-id',
      title: 'Copy failed',
      error_code: 'conflict',
      message: '',
      support_link: 'https://support.example',
      additional_info: { retry: false, count: 0 },
    },
  },
  { task_id: taskId, status: TaskStatus.Cancelled },
  { task_id: taskId, status: TaskStatus.Processing, additive: { count: 0, enabled: false } },
])('preserves the entire received task object %# without successful polling', async (data) => {
  const { permit, calls, reply } = wire({ retry: { enabled: true, maxRetries: 2, retryDelay: 1 } });
  reply.data = data;
  expect(await permit.api.environments.copyAsync(project, source, body)).toEqual(data);
  reply.status = 200;
  expect(await permit.api.environments.getCopyResult(project, source, taskId)).toEqual(data);
  expect(calls).toHaveLength(2);
});

test('snapshots nested inputs before delayed scope discovery and preserves explicit paths', async () => {
  let release: (() => void) | undefined;
  let announce: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    announce = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent: Request[] = [];
  const permit = new Permit({
    token: 'fixture',
    apiUrl: 'https://control.example',
    log: { level: 'silent' },
    retry: false,
    axiosInstance: axios.create({
      adapter: async (config) => {
        const url = axios.getUri(config);
        if (url.includes('/api-key/scope')) {
          announce?.();
          await gate;
          return response(config, { organization_id: 'org' }, 200);
        }
        sent.push({
          url,
          body: config.data,
          method: config.method,
          timeout: config.timeout,
          headers: new AxiosHeaders(config.headers),
        });
        return response(config, processing, 202);
      },
    }),
  });
  const caller = structuredClone(body);
  const expected = structuredClone(caller);
  const pending = permit.api.environments.copyAsync(project, source, caller, 0);
  await started;
  assert(caller.target_env.new && caller.scope?.resources?.include);
  caller.target_env.new.name = 'Mutated';
  caller.scope.resources.include.push('mutated');
  caller.conflict_strategy = 'fail';
  release?.();
  expect(await pending).toEqual(processing);
  permit.config.apiContext.setEnvironmentLevelContext('org', 'other', 'selected-target');
  await permit.api.environments.getCopyResult(project, source, taskId);
  expect(sent.map(({ url }) => url)).toEqual([`${prefix}/copy/async?wait=0`, resultPath]);
  expect(JSON.parse(String(sent[0]?.body))).toEqual(expected);
});

test('snapshot serialization failure is named and precedes discovery', async () => {
  const { permit, calls } = wire({ seed: false });
  const invalid = { ...body, scope: { resources: { include: [() => 'bad'] } } };
  await expect(
    Reflect.apply(permit.api.environments.copyAsync, permit.api.environments, [
      project,
      source,
      invalid,
    ]),
  ).rejects.toBeInstanceOf(PermitApiError);
  expect(calls).toEqual([]);
});

test.each(['organization', 'project', 'environment'] as const)(
  'submit and result apply their existing preflight gates for %s keys',
  async (level) => {
    const { permit, calls } = wire();
    const context = permit.config.apiContext;
    if (level === 'project') context._saveApiKeyAccessibleScope('org', 'selected');
    if (level === 'environment') context._saveApiKeyAccessibleScope('org', 'selected', 'env');
    if (level === 'environment') {
      await expect(permit.api.environments.copyAsync(project, source, body)).rejects.toBeInstanceOf(
        PermitContextError,
      );
      expect(calls).toEqual([]);
    } else
      expect(await permit.api.environments.copyAsync(project, source, body)).toEqual(processing);
    expect(await permit.api.environments.getCopyResult(project, source, taskId)).toEqual(
      processing,
    );
  },
);

test.each([401, 403, 404, 422, 500, 503])(
  'both routes preserve HTTP %s failures',
  async (status) => {
    const { permit, reply, calls } = wire();
    reply.status = status;
    reply.data = { detail: { request: 'COPY_RESPONSE_PRIVATE_CANARY' } };
    for (const pending of [
      permit.api.environments.copyAsync(project, source, body),
      permit.api.environments.getCopyResult(project, source, taskId),
    ]) {
      const failure: unknown = await pending.catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(PermitApiError);
      expect(failure).toMatchObject({ name: 'PermitApiError', status });
      expect(JSON.stringify(failure)).not.toContain('COPY_RESPONSE_PRIVATE_CANARY');
    }
    expect(calls).toHaveLength(2);
  },
);

test.each(['ERR_NETWORK', 'ECONNABORTED', 'ERR_CANCELED'])(
  'both routes preserve %s transport failure',
  async (code) => {
    const { permit, reply } = wire();
    reply.code = code;
    await expect(permit.api.environments.copyAsync(project, source, body)).rejects.toMatchObject({
      name: 'PermitApiError',
      code,
    });
    await expect(
      permit.api.environments.getCopyResult(project, source, taskId),
    ).rejects.toMatchObject({ name: 'PermitApiError', code });
  },
);

test('submission remains one attempt even when callers opt into POST retries', async () => {
  const { permit, reply, calls } = wire({
    retry: {
      enabled: true,
      maxRetries: 2,
      retryDelay: 1,
      retryMethods: ['GET', 'POST'],
    },
  });
  reply.status = 503;
  await expect(permit.api.environments.copyAsync(project, source, body)).rejects.toMatchObject({
    name: 'PermitApiError',
    status: 503,
  });
  expect(calls).toHaveLength(1);
});

test('result keeps opt-in safe GET retries within the caller REST timeout budget', async () => {
  const timeouts: number[] = [];
  let attempts = 0;
  const permit = new Permit({
    token: 'fixture',
    log: { level: 'silent' },
    retry: { enabled: true, maxRetries: 2, retryDelay: 1 },
    axiosInstance: axios.create({
      timeout: 1000,
      adapter: async (config) => {
        timeouts.push(config.timeout ?? 0);
        attempts++;
        if (attempts < 3)
          throw new AxiosError(
            'Read unavailable',
            'ERR_BAD_RESPONSE',
            config,
            undefined,
            response(config, {}, 503),
          );
        return response(config, processing, 200);
      },
    }),
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org');
  expect(await permit.api.environments.getCopyResult(project, source, taskId, 60)).toEqual(
    processing,
  );
  expect(attempts).toBe(3);
  expect(timeouts.every((value) => value > 0 && value <= 1000)).toBe(true);
  expect(timeouts[2]).toBeLessThan(timeouts[0]!);
});

test('task data is complete for the caller and absent from debug logs', async () => {
  const { permit, reply } = wire();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on('data', (value: Buffer) => chunks.push(value.toString()));
  const api = new EnvironmentsApi(permit.config, pino({ level: 'debug' }, output));
  reply.data = {
    task_id: taskId,
    status: 'failure',
    result: null,
    error: {
      id: 'id',
      title: 'COPY_TASK_PRIVATE_CANARY',
      error_code: 'conflict',
      additional_info: { arbitrary: 'COPY_TASK_PRIVATE_CANARY' },
    },
  };
  expect(await api.copyAsync(project, source, body)).toEqual(reply.data);
  expect(await api.getCopyResult(project, source, taskId)).toEqual(reply.data);
  expect(chunks.join('')).not.toContain('COPY_TASK_PRIVATE_CANARY');
});

test('scope discovery failures remain named without issuing a copy request', async () => {
  const { permit, calls, reply } = wire({ seed: false });
  reply.status = 401;
  reply.data = { detail: 'Scope unavailable' };
  await expect(permit.api.environments.copyAsync(project, source, body)).rejects.toMatchObject({
    name: 'PermitContextError',
    status: 401,
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.url).toContain('/api-key/scope');
});

test('malformed organization scope fails before a result request', async () => {
  const { permit, calls, reply } = wire({ seed: false });
  reply.status = 200;
  reply.data = { project_id: 'project' };
  await expect(
    permit.api.environments.getCopyResult(project, source, taskId),
  ).rejects.toBeInstanceOf(PermitContextError);
  expect(calls).toHaveLength(1);
});

test('the existing synchronous copy still returns its received environment with HTTP 201', async () => {
  const { permit, reply, calls } = wire();
  reply.status = 201;
  reply.data = environment;
  expect(await permit.api.environments.copy(project, source, body)).toEqual(environment);
  expect(calls.map(({ method, url }) => [method, url])).toEqual([['post', `${prefix}/copy`]]);
});
