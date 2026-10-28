import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import pino from 'pino';
import { expect, test, vi } from 'vitest';

import {
  ApiContext,
  ApiContextLevel,
  ApiKeyLevel,
  PermitContextChangeError,
  PermitContextError,
} from '#src/api/context';
import { Permit } from '#src/index';
import { UsersApi } from '#src/api/users';

const environmentScope = {
  organization_id: 'org',
  project_id: 'project',
  environment_id: 'environment',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function response(config: InternalAxiosRequestConfig, data: unknown) {
  return { data, config, status: 200, statusText: 'OK', headers: {} };
}

function firstCalls(permit: Permit): Array<Promise<unknown>> {
  return [
    permit.api.users.get('alice'),
    permit.api.roles.get('reader'),
    permit.api.resources.get('document'),
  ];
}

function client(load: (config: InternalAxiosRequestConfig) => Promise<unknown>, options = {}) {
  const requests: InternalAxiosRequestConfig[] = [];
  const caller = axios.create();
  caller.defaults.adapter = async (config) => {
    requests.push(config);
    return response(
      config,
      config.url?.endsWith('/api-key/scope') ? await load(config) : { key: 'fixture' },
    );
  };
  const permit = new Permit({
    token: 'test-token',
    axiosInstance: caller,
    log: { level: 'silent' },
    ...options,
  });
  return { permit, requests, caller };
}

test('parallel API wrappers publish one complete scope before dispatching dependent requests', async () => {
  const pending = deferred<unknown>();
  const load = vi.fn(() => pending.promise);
  const { permit, requests } = client(load);
  const calls = firstCalls(permit);
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  expect(requests).toHaveLength(1);
  expect(permit.config.apiContext.contextLevel).toBe(ApiContextLevel.WAIT_FOR_INIT);
  expect(permit.config.apiContext.permittedAccessLevel).toBe(ApiKeyLevel.WAIT_FOR_INIT);
  pending.resolve(environmentScope);
  expect(await Promise.all(calls)).toHaveLength(3);
  expect(load).toHaveBeenCalledTimes(1);
  expect(requests).toHaveLength(4);
  expect(permit.config.apiContext.environmentContext).toEqual({
    projId: 'project',
    envId: 'environment',
  });
  expect(permit.config.apiContext.permittedAccessLevel).toBe(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
  await permit.api.users.get('bob');
  expect(load).toHaveBeenCalledTimes(1);
});

test('all waiters share a failed lookup and a later parallel wave recovers with one lookup', async () => {
  const pending = deferred<unknown>();
  const load = vi.fn(() => pending.promise);
  const { permit, requests } = client(load);
  const failed = Promise.allSettled(firstCalls(permit));
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  const cause = new AxiosError('network fixture', 'ECONNRESET');
  pending.reject(cause);
  const settled = await failed;
  const errors = settled.map((result) => (result.status === 'rejected' ? result.reason : null));
  expect(errors[0]).toBeInstanceOf(PermitContextError);
  expect(errors[1]).toBe(errors[0]);
  expect(errors[2]).toBe(errors[0]);
  expect(errors[0]).toHaveProperty('cause');
  expect(requests).toHaveLength(1);
  expect(permit.config.apiContext.permittedAccessLevel).toBe(ApiKeyLevel.WAIT_FOR_INIT);
  expect(permit.config.apiContext.contextLevel).toBe(ApiContextLevel.WAIT_FOR_INIT);
  load.mockResolvedValue(environmentScope);
  await Promise.all(firstCalls(permit));
  expect(load).toHaveBeenCalledTimes(2);
  expect(requests).toHaveLength(5);
});

const malformedScopes: Array<[string, unknown]> = [
  ['null', null],
  ['array', []],
  ['missing organization', {}],
  ['numeric organization', { organization_id: 123 }],
  ['blank organization', { organization_id: ' \t' }],
  ['blank project', { organization_id: 'org', project_id: '' }],
  ['numeric project', { organization_id: 'org', project_id: 123 }],
  ['blank environment', { organization_id: 'org', project_id: 'project', environment_id: ' ' }],
  ['numeric environment', { organization_id: 'org', project_id: 'project', environment_id: 123 }],
  ['environment without project', { organization_id: 'org', environment_id: 'environment' }],
  [
    'environment with null project',
    { organization_id: 'org', project_id: null, environment_id: 'environment' },
  ],
];

test.each(malformedScopes)(
  'rejects %s scope atomically and retries on the same SDK',
  async (_name, value) => {
    const load = vi.fn().mockResolvedValueOnce(value).mockResolvedValue(environmentScope);
    const { permit, requests } = client(load);
    await expect(permit.api.users.get('alice')).rejects.toBeInstanceOf(PermitContextError);
    const context = permit.config.apiContext;
    expect([context.organization, context.project, context.environment]).toEqual([
      null,
      null,
      null,
    ]);
    expect(context.contextLevel).toBe(ApiContextLevel.WAIT_FOR_INIT);
    expect(context.permittedAccessLevel).toBe(ApiKeyLevel.WAIT_FOR_INIT);
    expect(requests).toHaveLength(1);
    await Promise.all(firstCalls(permit));
    expect(load).toHaveBeenCalledTimes(2);
    expect(context.environmentContext).toEqual({ projId: 'project', envId: 'environment' });
  },
);

test('late scope success preserves explicitly updated permissions and context', async () => {
  const pending = deferred<unknown>();
  const load = vi.fn(() => pending.promise);
  const { permit, requests } = client(load);
  const calls = firstCalls(permit);
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  const context = permit.config.apiContext;
  context._saveApiKeyAccessibleScope('org');
  context.setEnvironmentLevelContext('org', 'chosen-project', 'chosen-environment');
  pending.resolve(environmentScope);
  await Promise.all(calls);
  expect(context.permittedAccessLevel).toBe(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
  expect(context.environmentContext).toEqual({
    projId: 'chosen-project',
    envId: 'chosen-environment',
  });
  expect(
    requests
      .slice(1)
      .every((request) => request.url?.includes('/chosen-project/chosen-environment/')),
  ).toBe(true);
});

test.each(['network failure', 'malformed scope'] as const)(
  'late %s rejects existing waiters while preserving selected context for later calls',
  async (outcome) => {
    const pending = deferred<unknown>();
    const load = vi.fn(() => pending.promise);
    const { permit, requests } = client(load);
    const failed = Promise.allSettled(firstCalls(permit));
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const context = permit.config.apiContext;
    context._saveApiKeyAccessibleScope('chosen-org');
    context.setEnvironmentLevelContext('chosen-org', 'chosen-project', 'chosen-environment');
    if (outcome === 'network failure')
      pending.reject(new AxiosError('network fixture', 'ECONNRESET'));
    else pending.resolve({ organization_id: 123 });
    const settled = await failed;
    expect(settled.every((result) => result.status === 'rejected')).toBe(true);
    expect(context.organization).toBe('chosen-org');
    expect(context.permittedAccessLevel).toBe(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    expect(context.environmentContext).toEqual({
      projId: 'chosen-project',
      envId: 'chosen-environment',
    });
    await permit.api.users.get('alice');
    expect(load).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toContain('/chosen-project/chosen-environment/');
  },
);

test('shared uninitialized context never shares a lookup or permissions between SDK tokens', async () => {
  const supplied = new ApiContext();
  const firstScope = deferred<unknown>();
  const secondScope = deferred<unknown>();
  const firstLoad = vi.fn(() => firstScope.promise);
  const secondLoad = vi.fn(() => secondScope.promise);
  const first = client(firstLoad, { token: 'first', apiContext: supplied });
  const second = client(secondLoad, { token: 'second', apiContext: supplied });
  const calls = [...firstCalls(first.permit), ...firstCalls(second.permit)];
  await vi.waitFor(() => {
    expect(firstLoad).toHaveBeenCalledTimes(1);
    expect(secondLoad).toHaveBeenCalledTimes(1);
  });
  firstScope.resolve(environmentScope);
  secondScope.resolve({
    organization_id: 'other-org',
    project_id: 'other-project',
    environment_id: 'other-environment',
  });
  await Promise.all(calls);
  expect(first.permit.config.apiContext.environment).toBe('environment');
  expect(second.permit.config.apiContext.environment).toBe('other-environment');
  expect(supplied.contextLevel).toBe(ApiContextLevel.WAIT_FOR_INIT);
  expect(
    first.requests.every((request) => request.headers.get('Authorization') === 'Bearer first'),
  ).toBe(true);
  expect(
    second.requests.every((request) => request.headers.get('Authorization') === 'Bearer second'),
  ).toBe(true);
});

test.each([
  [
    ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY,
    { organization_id: 'org' },
    ApiContextLevel.ORGANIZATION,
  ],
  [
    ApiKeyLevel.PROJECT_LEVEL_API_KEY,
    { organization_id: 'org', project_id: 'project' },
    ApiContextLevel.PROJECT,
  ],
  [ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY, environmentScope, ApiContextLevel.ENVIRONMENT],
] as const)(
  'initializes valid %s scope with its matching routing level',
  async (access, scope, level) => {
    const { permit, requests } = client(async () => scope);
    const api = new UsersApi(permit.config, pino({ level: 'silent' }));
    await api.ensureAccessLevel(access);
    expect(permit.config.apiContext.permittedAccessLevel).toBe(access);
    expect(permit.config.apiContext.contextLevel).toBe(level);
    await api.ensureContext(level);
    expect(requests).toHaveLength(1);
  },
);

test('an initial permission scope without a selection initializes locally', async () => {
  const supplied = new ApiContext();
  supplied._saveApiKeyAccessibleScope('org', 'project', 'environment');
  const load = vi.fn(async () => environmentScope);
  const { permit, requests } = client(load, { apiContext: supplied });
  await Promise.all(firstCalls(permit));
  expect(load).not.toHaveBeenCalled();
  expect(requests).toHaveLength(3);
  expect(permit.config.apiContext.contextLevel).toBe(ApiContextLevel.ENVIRONMENT);
  expect(supplied.contextLevel).toBe(ApiContextLevel.WAIT_FOR_INIT);
});

test('context setters enforce permissions and keep the previous selection on rejection', () => {
  const context = new ApiContext();
  expect(() => context.setOrganizationLevelContext('org')).toThrow(PermitContextChangeError);
  expect(() => context.environmentContext).toThrow(PermitContextError);
  context._saveApiKeyAccessibleScope('org', 'project', 'environment');
  context.setEnvironmentLevelContext('org', 'project', 'environment');
  expect(() => context.setOrganizationLevelContext('other-org')).toThrow(PermitContextChangeError);
  expect(() => context.setProjectLevelContext('org', 'other-project')).toThrow(
    PermitContextChangeError,
  );
  expect(() => context.setEnvironmentLevelContext('org', 'project', 'other-environment')).toThrow(
    PermitContextChangeError,
  );
  expect(() => context.setEnvironmentLevelContext('org', 'project', '')).toThrow(
    PermitContextError,
  );
  expect(() => context._saveApiKeyAccessibleScope('other-org')).toThrow(PermitContextChangeError);
  expect(context.environmentContext).toEqual({ projId: 'project', envId: 'environment' });
  context.setProjectLevelContext('org', 'project');
  expect(context.environment).toBeNull();
  context.setOrganizationLevelContext('org');
  expect(context.project).toBeNull();
  expect(context.permittedAccessLevel).toBe(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
});
