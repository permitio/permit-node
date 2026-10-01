import { inspect } from 'node:util';

import axios, { type AxiosError } from 'axios';
import { afterEach, expect, test, vi } from 'vitest';

import { ApiContext } from '#src/api/context';
import { ConfigFactory, type IPermitOptions } from '#src/config';
import { Permit, type IPermitClient } from '#src/index';
import { LoggerFactory } from '#src/logger';
import { createMockPermit } from '#src/tests/helpers/mock-api';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const marker = 'private-option-value';
const invalidOptions: Array<[string, unknown]> = [
  ['null options', null],
  ['array options', []],
  ['string options', marker],
  ['numeric token', { token: 42 }],
  ['null token', { token: null }],
  ['empty token', { token: '' }],
  ['whitespace token', { token: `${marker} ` }],
  ['embedded token whitespace', { token: `${marker}\nkey` }],
  ['control token', { token: `${marker}\u007f` }],
  ['numeric API URL', { apiUrl: 42 }],
  ['relative API URL', { apiUrl: `/${marker}` }],
  ['credential URL with invalid scheme', { apiUrl: `ftp://user:${marker}@api.invalid` }],
  ['null PDP URL', { pdp: null }],
  ['malformed PDP URL', { pdp: marker }],
  ['whitespace PDP URL', { pdp: ` http://${marker}.invalid` }],
  ['negative timeout', { timeout: -1 }],
  ['nonfinite timeout', { timeout: Infinity }],
  ['NaN timeout', { timeout: NaN }],
  ['oversized timeout', { timeout: 2_147_483_648 }],
  ['string timeout', { timeout: marker }],
  ['null timeout', { timeout: null }],
  ['string error policy', { throwOnError: marker }],
  ['null error policy', { throwOnError: null }],
  ['string PDP proxy flag', { proxyFactsViaPdp: marker }],
  ['null PDP proxy flag', { proxyFactsViaPdp: null }],
  ['negative facts timeout', { factsSyncTimeout: -1 }],
  ['nonfinite facts timeout', { factsSyncTimeout: Infinity }],
  ['string facts timeout', { factsSyncTimeout: marker }],
  ['invalid facts policy', { factsSyncTimeoutPolicy: marker }],
  ['null logger', { log: null }],
  ['array logger', { log: [] }],
  ['invalid logger level', { log: { level: marker } }],
  ['invalid logger label', { log: { label: { secret: marker } } }],
  ['invalid logger JSON flag', { log: { json: marker } }],
  ['null tenancy', { multiTenancy: null }],
  ['array tenancy', { multiTenancy: [] }],
  ['empty tenant', { multiTenancy: { defaultTenant: '' } }],
  ['nonnumeric tenant flag', { multiTenancy: { useDefaultTenantIfEmpty: marker } }],
  ['incomplete REST client', { axiosInstance: {} }],
  ['null REST client', { axiosInstance: null }],
  ['incomplete OPA client', { opaAxiosInstance: {} }],
  ['invalid context', { apiContext: {} }],
  ['null context', { apiContext: null }],
  ['invalid retry callback', { retry: { retryCondition: {} } }],
  ['invalid PDP retry callback', { pdpRetry: { retryCondition: marker } }],
];

test.each(invalidOptions)('rejects %s before creating a logger or transport', (_name, value) => {
  const logger = vi.spyOn(LoggerFactory, 'createLogger');
  const transport = vi.spyOn(axios, 'create');
  const options =
    value && typeof value === 'object' && !Array.isArray(value)
      ? { token: 'test-token', ...value }
      : value;
  let failure: unknown;
  try {
    Reflect.construct(Permit, [options]);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(TypeError);
  expect(inspect(failure)).not.toContain(marker);
  expect(JSON.stringify(failure)).not.toContain(marker);
  expect(logger).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});

const baseUrlOptions = ['apiUrl', 'pdp'] as const;
const invalidBaseUrls = [
  `http://user:${marker}@api.invalid?${marker}=1`,
  `https://api.invalid/prefix#${marker}`,
  'http://api.invalid?',
  'http://api.invalid#',
  'http://api.invalid/prefix/?',
  'http://api.invalid/prefix/#',
  'http://api.invalid/prefix?%23=encoded',
  'http://api.invalid/prefix#%3Fencoded',
];

test.each(baseUrlOptions)('rejects query/fragment %s before logger and transport', (name) => {
  const logger = vi.spyOn(LoggerFactory, 'createLogger');
  const transport = vi.spyOn(axios, 'create');
  for (const value of invalidBaseUrls) {
    let failure: unknown;
    try {
      new Permit({ token: 'test-token', [name]: value });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TypeError);
    expect(failure).toHaveProperty('message', expect.stringContaining(`Invalid ${name}:`));
    expect(failure).toHaveProperty('message', expect.stringContaining('query or fragment'));
    expect(inspect(failure)).not.toContain(marker);
    expect(JSON.stringify(failure)).not.toContain(marker);
    expect(failure).not.toHaveProperty('cause');
  }
  expect(logger).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});

test.each(baseUrlOptions)('checks effective %s defaults and explicit overrides', (name) => {
  const variable = name === 'pdp' ? 'PERMIT_PDP_URL' : 'PERMIT_API_URL';
  vi.stubEnv('PERMIT_API_KEY', 'environment-key');
  const logger = vi.spyOn(LoggerFactory, 'createLogger');
  const transport = vi.spyOn(axios, 'create');
  for (const value of invalidBaseUrls) {
    vi.stubEnv(variable, value);
    expect(() => new Permit({ [name]: undefined })).toThrow(`Invalid ${name}:`);
  }
  expect(logger).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
  const valid = 'https://api.invalid/prefix/%3Fsegment/%23segment';
  const permit = new Permit({ [name]: valid, log: { level: 'silent' } });
  expect(permit.config[name]).toBe(valid);
});

test.each(baseUrlOptions)('preserves supported %s origins and encoded prefixes', (name) => {
  for (const value of [
    'http://localhost:7766',
    'https://api.invalid:8443/prefix/',
    'http://[::1]:7766/prefix/%3Fsegment/%23segment',
    'https://api.invalid/prefix/%3fsegment/%23segment',
    'https://api.invalid/prefix/%253F/%2523',
  ]) {
    const config = ConfigFactory.build({ token: 'test-token', [name]: value });
    expect(config[name]).toBe(value);
  }
});

test('requires a nonempty effective token and preserves opaque tokens and undefined fallback', () => {
  vi.stubEnv('PERMIT_API_KEY', 'environment-key');
  expect(ConfigFactory.build({ token: undefined }).token).toBe('environment-key');
  expect(ConfigFactory.build({ token: 'opaque/key+=:value' }).token).toBe('opaque/key+=:value');
  vi.stubEnv('PERMIT_API_KEY', '');
  expect(() => ConfigFactory.build({})).toThrow('Invalid token');
  vi.stubEnv('PERMIT_API_KEY', `${marker}\t`);
  expect(() => ConfigFactory.build({})).toThrow('Invalid token');
});

test('checks invalid environment defaults before constructing transport', () => {
  vi.stubEnv('PERMIT_API_KEY', 'environment-key');
  vi.stubEnv('PERMIT_PDP_URL', marker);
  const transport = vi.spyOn(axios, 'create');
  expect(() => ConfigFactory.build({})).toThrow('Invalid pdp');
  expect(transport).not.toHaveBeenCalled();
});

test('preserves zero/undefined timeout and nullable facts options', () => {
  const base = { token: 'test-token' };
  expect(ConfigFactory.build({ ...base, timeout: 0 }).timeout).toBe(0);
  expect(ConfigFactory.build({ ...base, timeout: undefined }).timeout).toBeUndefined();
  expect(ConfigFactory.build({ ...base, factsSyncTimeout: 0 }).factsSyncTimeout).toBe(0);
  expect(ConfigFactory.build({ ...base, factsSyncTimeout: null }).factsSyncTimeout).toBeNull();
  expect(
    ConfigFactory.build({ ...base, factsSyncTimeoutPolicy: 'ignore' }).factsSyncTimeoutPolicy,
  ).toBe('ignore');
  expect(
    ConfigFactory.build({ ...base, factsSyncTimeoutPolicy: 'fail' }).factsSyncTimeoutPolicy,
  ).toBe('fail');
});

test('snapshots and freezes owned settings while keeping clients and callbacks live', () => {
  const caller = axios.create();
  const condition = Object.assign((_error: AxiosError) => true, { enabled: true });
  const options: IPermitOptions = {
    token: 'original',
    axiosInstance: caller,
    opaAxiosInstance: caller,
    log: { level: 'silent' },
    multiTenancy: { defaultTenant: 'original-tenant' },
    retry: { maxRetries: 1, retryMethods: ['GET'], retryCondition: condition },
    pdpRetry: { maxRetries: 2, retryMethods: ['POST'] },
  };
  const config = ConfigFactory.build(options);
  options.token = 'changed';
  if (options.log) options.log.level = 'debug';
  if (options.multiTenancy) options.multiTenancy.defaultTenant = 'changed-tenant';
  if (options.retry && options.retry.retryMethods)
    Reflect.set(options.retry.retryMethods, 0, 'POST');
  expect(config.token).toBe('original');
  expect(config.log.level).toBe('silent');
  expect(config.multiTenancy.defaultTenant).toBe('original-tenant');
  expect(config.retry && config.retry.retryMethods).toEqual(['GET']);
  for (const settings of [config, config.log, config.multiTenancy, config.retry, config.pdpRetry]) {
    expect(Object.isFrozen(settings)).toBe(true);
  }
  expect(config.retry && Object.isFrozen(config.retry.retryMethods)).toBe(true);
  expect(config.pdpRetry && Object.isFrozen(config.pdpRetry.retryMethods)).toBe(true);
  expect(config.axiosInstance).toBe(caller);
  expect(config.opaAxiosInstance).toBe(caller);
  expect(config.retry && config.retry.retryCondition).toBe(condition);
  expect(Object.isFrozen(caller)).toBe(false);
  expect(Object.isFrozen(caller.defaults)).toBe(false);
  expect(Object.isFrozen(condition)).toBe(false);
  caller.defaults.timeout = 17;
  condition.enabled = false;
  expect(config.axiosInstance.defaults.timeout).toBe(17);
  expect(condition.enabled).toBe(false);
});

test('rejects malformed callable Axios facades', () => {
  const incomplete = Object.assign(() => undefined, { request: () => undefined, defaults: {} });
  expect(() => Reflect.construct(Permit, [{ token: 'test', axiosInstance: incomplete }])).toThrow(
    'Invalid axiosInstance',
  );
  const missingManager = axios.create();
  Reflect.set(missingManager.interceptors, 'response', null);
  expect(() =>
    Reflect.construct(Permit, [{ token: 'test', opaAxiosInstance: missingManager }]),
  ).toThrow('Invalid opaAxiosInstance');
});

test('owns independent snapshots of a supplied context and preserves its permissions', () => {
  const supplied = new ApiContext();
  supplied._saveApiKeyAccessibleScope('org', 'project');
  supplied.setEnvironmentLevelContext('org', 'project', 'first-environment');
  const first = ConfigFactory.build({ token: 'first', apiContext: supplied });
  const second = ConfigFactory.build({ token: 'second', apiContext: supplied });
  expect(first.apiContext).not.toBe(supplied);
  expect(second.apiContext).not.toBe(first.apiContext);
  expect(first.apiContext.environmentContext).toEqual({
    projId: 'project',
    envId: 'first-environment',
  });
  supplied.setEnvironmentLevelContext('org', 'project', 'caller-environment');
  first.apiContext.setEnvironmentLevelContext('org', 'project', 'sdk-environment');
  expect(second.apiContext.environment).toBe('first-environment');
  expect(supplied.environment).toBe('caller-environment');
  expect(first.apiContext.environment).toBe('sdk-environment');
  expect(() => first.apiContext.setProjectLevelContext('org', 'other-project')).toThrow();
});

const contextBridgeKey = Symbol.for('permitio.ApiContext.snapshot');
const validSnapshot = {
  scope: {
    level: 'PROJECT_LEVEL_API_KEY',
    organization: 'org',
    project: 'project',
    environment: null,
  },
  selection: { level: 3, organization: 'org', project: 'project', environment: 'environment' },
};

test('the readonly context bridge exposes only detached permission and selection copies', () => {
  const context = new ApiContext();
  context._saveApiKeyAccessibleScope('org', 'project');
  context.setEnvironmentLevelContext('org', 'project', 'environment');
  const descriptor = Object.getOwnPropertyDescriptor(context, contextBridgeKey);
  expect(descriptor).toMatchObject({ writable: false, configurable: false, enumerable: false });
  const bridge: unknown = Reflect.get(context, contextBridgeKey);
  if (typeof bridge !== 'function') throw new Error('Context fixture has no snapshot bridge.');
  const snapshot: unknown = Reflect.apply(bridge, context, []);
  expect(snapshot).toStrictEqual(validSnapshot);
  if (snapshot === null || typeof snapshot !== 'object')
    throw new Error('Invalid snapshot fixture.');
  const scope: unknown = Reflect.get(snapshot, 'scope');
  const selection: unknown = Reflect.get(snapshot, 'selection');
  if (
    scope === null ||
    typeof scope !== 'object' ||
    selection === null ||
    typeof selection !== 'object'
  ) {
    throw new Error('Invalid snapshot fields in fixture.');
  }
  Reflect.set(scope, 'project', 'forbidden-project');
  Reflect.set(selection, 'environment', 'changed-environment');
  expect(context.environment).toBe('environment');
  expect(() => context.setProjectLevelContext('org', 'forbidden-project')).toThrow();
  expect(Reflect.set(context, contextBridgeKey, () => validSnapshot)).toBe(false);
});

test('borrowed snapshot bridges reject receivers absent from the originating class state', () => {
  const real = new ApiContext();
  const fake: object = Object.create(ApiContext.prototype);
  Object.defineProperty(fake, contextBridgeKey, { value: Reflect.get(real, contextBridgeKey) });
  expect(() => Reflect.construct(Permit, [{ token: 'test', apiContext: fake }])).toThrow(TypeError);
});

test('a fake partial context cannot become an accepted option through a snapshot-shaped function', () => {
  const fake = { [contextBridgeKey]: () => validSnapshot };
  expect(() => Reflect.construct(Permit, [{ token: 'test', apiContext: fake }])).toThrow(TypeError);
});

const malformedSnapshots: Array<[string, unknown]> = [
  ['null', null],
  ['array', []],
  ['missing fields', {}],
  [
    'missing scope project',
    {
      ...validSnapshot,
      scope: { level: 'ORGANIZATION_LEVEL_API_KEY', organization: 'org', environment: null },
    },
  ],
  [
    'missing scope organization',
    { ...validSnapshot, scope: { ...validSnapshot.scope, organization: undefined } },
  ],
  ['blank scope project', { ...validSnapshot, scope: { ...validSnapshot.scope, project: '' } }],
  [
    'environment without scope project',
    {
      ...validSnapshot,
      scope: { ...validSnapshot.scope, project: null, environment: 'environment' },
    },
  ],
  [
    'incorrect permission level',
    { ...validSnapshot, scope: { ...validSnapshot.scope, level: 'ORGANIZATION_LEVEL_API_KEY' } },
  ],
  ['missing selection', { scope: validSnapshot.scope }],
  [
    'invalid selection level',
    { ...validSnapshot, selection: { ...validSnapshot.selection, level: 99 } },
  ],
  [
    'environment without selected project',
    { ...validSnapshot, selection: { ...validSnapshot.selection, project: null } },
  ],
  [
    'selected project outside permission scope',
    { ...validSnapshot, selection: { ...validSnapshot.selection, project: 'forbidden-project' } },
  ],
  ['selection without permissions', { ...validSnapshot, scope: null }],
];

test.each(malformedSnapshots)(
  'rejects %s snapshot before logger or transport creation',
  (_name, snapshot) => {
    const fake: object = Object.create(ApiContext.prototype);
    Object.defineProperty(fake, contextBridgeKey, { value: () => snapshot });
    const logger = vi.spyOn(LoggerFactory, 'createLogger');
    const transport = vi.spyOn(axios, 'create');
    expect(() => Reflect.construct(Permit, [{ token: 'test', apiContext: fake }])).toThrow(
      TypeError,
    );
    expect(logger).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  },
);

test('snapshot bridge errors never expose caller error text or retain a cause', () => {
  const fake: object = Object.create(ApiContext.prototype);
  Object.defineProperty(fake, contextBridgeKey, {
    get() {
      throw new Error(marker);
    },
  });
  let failure: unknown;
  try {
    Reflect.construct(Permit, [{ token: 'test', apiContext: fake }]);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(TypeError);
  expect(inspect(failure)).not.toContain(marker);
  expect(failure).not.toHaveProperty('cause');
});

test('prevents mutation from changing REST, PDP or OPA credentials', async () => {
  const { permit, rest, pdp, opa } = createMockPermit({ token: 'original' });
  expect(Reflect.set(permit.config, 'token', 'changed')).toBe(false);
  expect(Reflect.set(permit, 'config', {})).toBe(false);
  rest.resolveWith({ key: 'alice' });
  pdp.resolveWith({ allow: true });
  opa.resolveWith({ result: { allow: true } });
  await permit.api.users.get('alice');
  expect(await permit.check('alice', 'read', 'doc')).toBe(true);
  expect(await permit.check('alice', 'read', 'doc', {}, { useOpa: true })).toBe(true);
  for (const request of [rest.last, pdp.last, opa.last]) {
    expect(request?.headers['Authorization']).toBe('Bearer original');
  }
});

// Strict compilation checks these unreachable calls without running invalid constructors.
function constructorTypeChecks(): void {
  const caller = axios.create();
  new Permit({ token: 'test', axiosInstance: caller, retry: { retryCondition: () => true } });
  // @ts-expect-error An incomplete object is not an AxiosInstance.
  new Permit({ token: 'test', axiosInstance: { defaults: {} } });
  // @ts-expect-error OPA also requires an intact AxiosInstance.
  new Permit({ token: 'test', opaAxiosInstance: { request: () => undefined } });
  // @ts-expect-error A retry callback must be callable.
  new Permit({ token: 'test', retry: { retryCondition: {} } });
  // @ts-expect-error Retry callbacks return boolean decisions.
  new Permit({ token: 'test', retry: { retryCondition: () => 'yes' } });
  // @ts-expect-error API context must preserve its complete class type.
  new Permit({ token: 'test', apiContext: {} });
  const permit = new Permit({ token: 'test' });
  const facade: IPermitClient = permit;
  // @ts-expect-error The exported client interface also preserves the config binding.
  facade.config = permit.config;
  // @ts-expect-error Owned top-level settings are immutable.
  permit.config.token = 'changed';
  // @ts-expect-error Owned nested settings are immutable.
  permit.config.log.level = 'debug';
  // @ts-expect-error Owned retry options are immutable.
  if (permit.config.retry) permit.config.retry.maxRetries = 4;
  // @ts-expect-error Owned retry method arrays are immutable.
  if (permit.config.retry) permit.config.retry.retryMethods?.push('POST');
}

void constructorTypeChecks;
