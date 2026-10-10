import assert from 'node:assert/strict';
import { inspect } from 'node:util';

import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import pino from 'pino';

import { PermitApiError } from '#src/api/base';
import { PermitContextError } from '#src/api/context';
import { ProxyConfigsApi, type IProxyConfigsApi } from '#src/api/proxy-configs';
import {
  AuthMechanism,
  MappingRuleUrlTypeEnum,
  Methods,
  Permit,
  type ProxyConfigCreate,
  type ProxyConfigRead,
  type ProxyConfigUpdate,
} from '#src/index';

const input: ProxyConfigCreate = {
  key: 'payments',
  name: 'Payments example',
  secret: 'inert-bearer-secret',
  auth_mechanism: AuthMechanism.Bearer,
  mapping_rules: [
    {
      url: '^https://service.example.test/items/[0-9]+$',
      url_type: MappingRuleUrlTypeEnum.Regex,
      http_method: Methods.Get,
      resource: 'document',
      action: 'read',
      priority: 0,
      headers: { 'X-Tenant': 'east' },
    },
  ],
};
const stored: ProxyConfigRead = {
  ...input,
  id: 'proxy-id',
  organization_id: 'org',
  project_id: 'project',
  environment_id: 'environment',
  created_at: '2026-10-08T00:00:00Z',
  updated_at: '2026-10-08T00:00:00Z',
  secret: 'received-mask',
};
const key = 'payments/a?b+c=%é';
const encodedKey = 'payments%2Fa%3Fb%2Bc%3D%25%C3%A9';
const prefix = 'https://control.example/v2/facts/project%2Fone/environment%20east/proxy_configs';
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
  const reply: { status: number; data: unknown; error?: string } = { status: 200, data: stored };
  const permit = new Permit({
    token: 'proxy-fixture',
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
        const result = response(config, reply.data, reply.status);
        if (reply.error) throw new AxiosError('Fixture transport failed', reply.error, config);
        if (reply.status >= 400)
          throw new AxiosError(
            'Proxy configuration rejected',
            'ERR_BAD_RESPONSE',
            config,
            undefined,
            result,
          );
        return result;
      },
    }),
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org');
  permit.config.apiContext.setEnvironmentLevelContext('org', 'project/one', 'environment east');
  return { permit, calls, reply };
}

test.each([true, false])(
  'all five routes stay on the control plane with facts proxy %s',
  async (proxy) => {
    const { permit, calls, reply } = wire(proxy);
    const api = permit.api.proxyConfigs;
    reply.data = { ...stored, additive: { nullable: null, enabled: false, count: 0 } };
    const update = {
      name: 'Updated',
      secret: { 'X-Authorization': 'inert-header-secret' },
      auth_mechanism: AuthMechanism.Headers,
      mapping_rules: [{ ...input.mapping_rules![0]!, should_delete: false }],
    };
    expect(await api.create(Object.freeze(structuredClone(input)))).toEqual(reply.data);
    expect(await api.get(key)).toEqual(reply.data);
    expect(await api.update(key, Object.freeze(update))).toEqual(reply.data);
    reply.data = [reply.data, reply.data];
    expect(await api.list()).toEqual(reply.data);
    reply.status = 204;
    reply.data = undefined;
    expect(await api.delete(key)).toBeUndefined();
    expect(calls.map(({ method, url, body }) => [method, url, body])).toEqual([
      ['post', prefix, JSON.stringify(input)],
      ['get', `${prefix}/${encodedKey}`, undefined],
      ['patch', `${prefix}/${encodedKey}`, JSON.stringify(update)],
      ['get', `${prefix}?page=1&per_page=100`, undefined],
      ['delete', `${prefix}/${encodedKey}`, undefined],
    ]);
    for (const request of calls) {
      expect(request.headers.get('authorization')).toBe('Bearer proxy-fixture');
      expect(request.headers.has('x-wait-timeout')).toBe(false);
      expect(request.headers.has('x-timeout-policy')).toBe(false);
      if (request.body) expect(request.headers.get('content-type')).toContain('application/json');
    }
    expect('waitForSync' in api).toBe(false);
    expect(input.secret).toBe('inert-bearer-secret');
    expect(update.secret).toEqual({ 'X-Authorization': 'inert-header-secret' });
  },
);

test.each([200, 201])(
  'POST preserves an existing or newly-created response at HTTP %s',
  async (status) => {
    const { permit, reply } = wire();
    reply.status = status;
    reply.data = {
      ...stored,
      name: 'Returned name',
      secret: { 'X-Authorization': 'received-header-mask' },
      mapping_rules: [],
      future: false,
    };
    const result = await permit.api.proxyConfigs.create(input);
    expect(result).toEqual(reply.data);
    expect(result.secret).not.toEqual(input.secret);
  },
);

test.each([AuthMechanism.Bearer, AuthMechanism.Basic, AuthMechanism.Headers])(
  '%s supports its published secret union without rewriting the returned mask',
  async (mechanism) => {
    const { permit, calls, reply } = wire();
    const secret =
      mechanism === AuthMechanism.Headers ? { 'X-Secret': 'dummy-header' } : 'dummy:credential';
    const body = { ...input, auth_mechanism: mechanism, secret };
    reply.data = { ...stored, auth_mechanism: mechanism, secret: 'server-mask' };
    expect((await permit.api.proxyConfigs.create(body)).secret).toBe('server-mask');
    expect(JSON.parse(String(calls[0]?.body))).toEqual(body);
    reply.data = {
      ...stored,
      auth_mechanism: mechanism,
      secret: { 'X-Secret': 'masked' },
      mapping_rules: [],
    };
    expect(
      await permit.api.proxyConfigs.update(key, {
        secret,
        auth_mechanism: mechanism,
        mapping_rules: [],
      }),
    ).toEqual(reply.data);
    expect(await permit.api.proxyConfigs.get(key)).toEqual(reply.data);
  },
);

test('snapshots nested write bodies and pagination before asynchronous scope checks', async () => {
  const { permit, calls, reply } = wire();
  const body = structuredClone(input);
  const pending = permit.api.proxyConfigs.create(body);
  body.name = 'Changed';
  body.secret = 'changed-secret';
  body.mapping_rules![0]!.headers!['X-Tenant'] = 'changed';
  body.mapping_rules!.push({ ...body.mapping_rules![0]!, resource: 'changed' });
  await pending;
  expect(JSON.parse(String(calls[0]?.body))).toEqual(input);
  const patch: ProxyConfigUpdate = {
    secret: { 'X-Secret': 'before' },
    mapping_rules: [
      {
        url: 'https://service.example.test/plain',
        http_method: Methods.Post,
        resource: 'document',
        priority: 0,
        headers: {},
        should_delete: false,
      },
    ],
  };
  const expected = structuredClone(patch),
    update = permit.api.proxyConfigs.update(key, patch);
  assert(typeof patch.secret === 'object');
  patch.secret['X-Secret'] = 'after';
  patch.mapping_rules![0]!.should_delete = true;
  await update;
  expect(JSON.parse(String(calls[1]?.body))).toEqual(expected);
  reply.data = [];
  const params = { page: 2, perPage: 3 },
    list = permit.api.proxyConfigs.list(params);
  params.page = 9;
  params.perPage = 10;
  expect(await list).toEqual([]);
  expect(calls[2]?.url).toBe(`${prefix}?page=2&per_page=3`);
  await permit.api.proxyConfigs.list({ page: 0, perPage: 0 });
  expect(calls[3]?.url).toBe(`${prefix}?page=0&per_page=0`);
  await permit.api.proxyConfigs.list(undefined);
  expect(calls[4]?.url).toBe(`${prefix}?page=1&per_page=100`);
});

test('partial update preserves empty, false, zero and rule removal values exactly', async () => {
  const { permit, calls } = wire();
  for (const body of [
    {},
    { name: '', secret: {} },
    { mapping_rules: [] },
    {
      mapping_rules: [
        {
          url: 'https://service.example.test/plain',
          http_method: Methods.Delete,
          resource: 'document',
          headers: {},
          action: '',
          priority: 0,
          should_delete: true,
        },
      ],
    },
  ]) {
    await permit.api.proxyConfigs.update(key, body);
    expect(JSON.parse(String(calls.at(-1)?.body))).toEqual(body);
  }
});

const operations: Array<[string, (api: IProxyConfigsApi) => Promise<unknown>]> = [
  ['list', (api) => api.list()],
  ['get', (api) => api.get(key)],
  ['create', (api) => api.create(input)],
  ['update', (api) => api.update(key, { name: 'Changed' })],
  ['delete', (api) => api.delete(key)],
];
test.each(operations)(
  '%s refuses missing environment before operation traffic',
  async (_, call) => {
    for (const project of [undefined, 'project']) {
      let requests = 0;
      const permit = new Permit({
        token: 'proxy-fixture',
        retry: false,
        log: { level: 'silent' },
        axiosInstance: axios.create({
          adapter: async () => {
            requests++;
            throw new Error('Unexpected traffic');
          },
        }),
      });
      permit.config.apiContext._saveApiKeyAccessibleScope('org', project);
      await expect(call(permit.api.proxyConfigs)).rejects.toBeInstanceOf(PermitContextError);
      expect(requests).toBe(0);
    }
  },
);
test.each(operations)(
  '%s propagates HTTP errors and never credits a failed deletion',
  async (_, call) => {
    const { permit, calls, reply } = wire();
    for (const status of [400, 401, 403, 404, 422, 503]) {
      reply.status = status;
      reply.data = { detail: 'Proxy configuration operation denied' };
      const error: unknown = await call(permit.api.proxyConfigs).catch((caught: unknown) => caught);
      assert(error instanceof PermitApiError);
      expect(error.status).toBe(status);
      expect(error.response?.status).toBe(status);
      expect(error.code).toBe('ERR_BAD_RESPONSE');
      expect(error.message).toContain('Proxy configuration operation denied');
    }
    expect(calls).toHaveLength(6);
  },
);
test.each(operations)(
  '%s keeps network and timeout failures visible without a fallback',
  async (_, call) => {
    const { permit, calls, reply } = wire();
    for (const code of ['ERR_NETWORK', 'ECONNABORTED']) {
      reply.error = code;
      const error: unknown = await call(permit.api.proxyConfigs).catch((caught: unknown) => caught);
      assert(error instanceof PermitApiError);
      expect(error.code).toBe(code);
      expect(error.status).toBeUndefined();
      expect(error.message).toContain('Fixture transport failed');
    }
    expect(calls).toHaveLength(2);
  },
);

test.each(['create', 'update'] as const)(
  '%s rejects cycles and bigint before scope or write traffic',
  async (method) => {
    const { permit, calls } = wire();
    const cyclic: Record<string, unknown> = { ...input };
    cyclic['secret'] = cyclic;
    for (const value of [cyclic, { ...input, secret: 1n }, { ...input, secret: () => undefined }]) {
      const error: unknown = await (
        method === 'create'
          ? permit.api.proxyConfigs.create(value as unknown as ProxyConfigCreate)
          : permit.api.proxyConfigs.update(key, value as ProxyConfigUpdate)
      ).catch((caught: unknown) => caught);
      assert(error instanceof PermitApiError);
      expect(error.message).toContain('Cannot serialize proxy configuration');
    }
    expect(calls).toHaveLength(0);
  },
);

test('discovers environment once and leaves scope failures named', async () => {
  const urls: string[] = [];
  const permit = new Permit({
    token: 'proxy-fixture',
    apiUrl: 'https://control.example',
    retry: false,
    log: { level: 'silent' },
    axiosInstance: axios.create({
      adapter: async (config) => {
        const url = axios.getUri(config);
        urls.push(url);
        return response(
          config,
          url.endsWith('/v2/api-key/scope')
            ? { organization_id: 'org', project_id: 'project', environment_id: 'environment' }
            : [],
          200,
        );
      },
    }),
  });
  expect(await permit.api.proxyConfigs.list()).toEqual([]);
  expect(await permit.api.proxyConfigs.list()).toEqual([]);
  expect(urls).toEqual([
    'https://control.example/v2/api-key/scope',
    'https://control.example/v2/facts/project/environment/proxy_configs?page=1&per_page=100',
    'https://control.example/v2/facts/project/environment/proxy_configs?page=1&per_page=100',
  ]);
  const failing = new Permit({
    token: 'proxy-fixture',
    retry: false,
    log: { level: 'silent' },
    axiosInstance: axios.create({
      adapter: async () => {
        throw new Error('Scope unavailable');
      },
    }),
  });
  await expect(failing.api.proxyConfigs.list()).rejects.toBeInstanceOf(PermitContextError);
});

test.each(['create', 'update'] as const)(
  '%s cannot leak input secrets through errors, logs or cause',
  async (method) => {
    const token = 'inert-proxy-token-canary',
      basic = 'inert-basic-canary:password',
      header = 'inert-header-secret-canary',
      mapping = 'inert-mapping-header-canary';
    const body = {
      ...input,
      secret: { 'X-Authorization': header, 'X-Basic': basic },
      mapping_rules: [
        {
          ...input.mapping_rules![0]!,
          headers: { 'X-Custom': mapping },
        },
      ],
    };
    const logs: string[] = [],
      callerErrors: AxiosError[] = [];
    const logger = pino(
      { level: 'error' },
      {
        write(value: string) {
          logs.push(value);
        },
      },
    );
    const permit = new Permit({
      token,
      apiUrl: 'https://control.example',
      retry: false,
      log: { level: 'silent' },
      axiosInstance: axios.create({
        adapter: async (config) => {
          const raw = new AxiosError(
            `Denied ${token} ${basic} ${header} ${mapping}`,
            'ERR_BAD_RESPONSE',
            config,
            undefined,
            response(config, { detail: `Rejected ${basic} ${header} ${mapping}` }, 422),
          );
          callerErrors.push(raw);
          throw raw;
        },
      }),
    });
    permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
    const api = new ProxyConfigsApi(permit.config, logger);
    const error: unknown = await (
      method === 'create' ? api.create(body) : api.update(key, body)
    ).catch((caught: unknown) => caught);
    assert(error instanceof PermitApiError);
    expect(error.status).toBe(422);
    const diagnostics = [
      error.message,
      JSON.stringify(error),
      inspect(error, { showHidden: true, depth: 8 }),
      ...logs,
    ].join(' ');
    for (const secret of [token, basic, header, mapping]) expect(diagnostics).not.toContain(secret);
    expect(callerErrors[0]?.message).toContain(header);
    expect(body.secret['X-Authorization']).toBe(header);
    expect(error.originalError.config?.data).toBeUndefined();
  },
);

test.each(['string', 'headers', 'nested', 'response header'] as const)(
  'response-only %s secrets stay out of every failure projection',
  async (location) => {
    const secret = 'RESPONSE_ONLY_PROXY_CANARY';
    const body = {
      detail: 'Proxy configuration denied',
      ...(location === 'string' ? { secret } : {}),
      ...(location === 'headers' ? { secret: { 'X-Proxy-Credential': secret } } : {}),
      ...(location === 'nested' ? { errors: [{ msg: 'Invalid proxy', input: { secret } }] } : {}),
    };
    const logs: string[] = [];
    let callerError: AxiosError | undefined;
    const logger = pino({ level: 'error' }, { write: (line: string) => logs.push(line) });
    const permit = new Permit({
      token: 'proxy-fixture',
      retry: false,
      log: { level: 'silent' },
      axiosInstance: axios.create({
        adapter: async (config) => {
          const reply = response(config, body, 422);
          if (location === 'response header') reply.headers.set('X-Proxy-Credential', secret);
          callerError = new AxiosError(`Denied ${secret}`, secret, config, undefined, reply);
          throw callerError;
        },
      }),
    });
    permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
    const error: unknown = await new ProxyConfigsApi(permit.config, logger)
      .get('payments')
      .catch((caught: unknown) => caught);
    assert(error instanceof PermitApiError);
    assert(callerError);
    const directCause = new PermitContextError('Proxy context unavailable', { cause: callerError });
    expect(error.status).toBe(422);
    expect(error.code).toBeUndefined();
    expect(error.message).toBe('Proxy configuration denied');
    if (location === 'nested')
      expect(error.response?.data).toMatchObject({ errors: [{ msg: 'Invalid proxy' }] });
    expect(directCause.code).toBeUndefined();
    for (const failure of [error, directCause]) {
      for (const value of [
        String(failure),
        JSON.stringify(failure),
        inspect(failure, { showHidden: true, depth: Infinity }),
        ...logs,
      ])
        expect(value).not.toContain(secret);
    }
    expect(callerError.code).toBe(secret);
    expect(callerError.message).toContain(secret);
    expect(callerError.response?.data).toBe(body);
  },
);

test.each(['ERR_BAD_RESPONSE', 'ECONNRESET', 'CUSTOM_PROXY_FAILURE'])(
  'retains unrelated transport code %s with private response fields',
  async (code) => {
    const { permit, reply } = wire();
    reply.status = 422;
    reply.data = { detail: 'Proxy configuration denied', secret: 'RESPONSE_ONLY_PROXY_CANARY' };
    const caller = axios.create({
      adapter: async (config) => {
        throw new AxiosError(
          'Proxy denied',
          code,
          config,
          undefined,
          response(config, reply.data, 422),
        );
      },
    });
    const client = new Permit({
      ...permit.config,
      axiosInstance: caller,
      retry: false,
      log: { level: 'silent' },
    });
    const error: unknown = await client.api.proxyConfigs
      .get('payments')
      .catch((caught: unknown) => caught);
    assert(error instanceof PermitApiError);
    expect(error.code).toBe(code);
    expect(error.status).toBe(422);
    expect(error.message).toBe('Proxy configuration denied');
    expect(error.originalError.config?.url).toContain('/proxy_configs/payments');
    expect(JSON.stringify(error)).not.toContain('RESPONSE_ONLY_PROXY_CANARY');
  },
);

test.each(['accessor', 'field limit', 'array limit', 'depth limit'] as const)(
  'incomplete response privacy at the %s fails closed before metadata projection',
  async (boundary) => {
    let getterCalls = 0;
    const data: Record<string, unknown> = { detail: 'Proxy configuration denied' };
    if (boundary === 'accessor')
      Object.defineProperty(data, 'secret', {
        enumerable: true,
        get() {
          getterCalls++;
          return 'RESPONSE_ONLY_PROXY_CANARY';
        },
      });
    if (boundary === 'field limit')
      for (let index = 0; index < 65; index++)
        data[`private${index}`] = 'RESPONSE_ONLY_PROXY_CANARY';
    if (boundary === 'array limit')
      data['errors'] = Array.from({ length: 9 }, () => ({ secret: 'RESPONSE_ONLY_PROXY_CANARY' }));
    if (boundary === 'depth limit')
      data['errors'] = [{ errors: [{ secret: 'RESPONSE_ONLY_PROXY_CANARY' }] }];
    const permit = new Permit({
      token: 'proxy-fixture',
      retry: false,
      log: { level: 'silent' },
      axiosInstance: axios.create({
        adapter: async (config) => {
          throw new AxiosError(
            'Denied RESPONSE_ONLY_PROXY_CANARY',
            'RESPONSE_ONLY_PROXY_CANARY',
            config,
            undefined,
            response(config, data, 422),
          );
        },
      }),
    });
    permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
    const error: unknown = await permit.api.proxyConfigs
      .get('payments')
      .catch((caught: unknown) => caught);
    assert(error instanceof PermitApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBeUndefined();
    expect(error.message).toBe('Permit API request failed with HTTP 422.');
    expect(getterCalls).toBe(0);
    for (const value of [JSON.stringify(error), inspect(error, { depth: Infinity })])
      expect(value).not.toContain('RESPONSE_ONLY_PROXY_CANARY');
  },
);

test.each(['numeric accessor', 'sparse index', 'custom slice'] as const)(
  'response arrays with a %s never execute accessors during diagnostics',
  (boundary) => {
    let getterCalls = 0;
    const secret = 'RESPONSE_ONLY_PROXY_CANARY';
    const errors: unknown[] = [{ msg: 'Invalid proxy', input: { secret } }];
    if (boundary === 'numeric accessor')
      Object.defineProperty(errors, '0', {
        enumerable: true,
        get() {
          getterCalls++;
          return { msg: `Rejected ${secret}`, secret };
        },
      });
    if (boundary === 'sparse index') delete errors[0];
    if (boundary === 'custom slice')
      Object.defineProperty(errors, 'slice', {
        get() {
          getterCalls++;
          throw new Error('Diagnostic traversal invoked an accessor');
        },
      });
    const data = { detail: 'Proxy configuration denied', errors };
    const config = { headers: new AxiosHeaders(), url: 'https://control.example/proxy_configs' };
    const raw = new AxiosError(
      'Proxy denied',
      secret,
      config,
      undefined,
      response(config, data, 422),
    );
    const error = new PermitApiError('Proxy denied', raw);
    expect(getterCalls).toBe(0);
    expect(error.status).toBe(422);
    expect(error.code).toBeUndefined();
    expect(raw.code).toBe(secret);
    expect(raw.response?.data).toBe(data);
    for (const value of [String(error), JSON.stringify(error), inspect(error, { depth: Infinity })])
      expect(value).not.toContain(secret);
  },
);

test.each(['secret', '01', '4294967295', 'accessor'] as const)(
  'enumerable non-index array property %s cannot leak through transport metadata',
  async (property) => {
    const secret = 'ARRAY_PROPERTY_PRIVATE_CANARY';
    const errors = [{ msg: 'Invalid proxy' }];
    let getterCalls = 0;
    if (property === 'accessor')
      Object.defineProperty(errors, 'secret', {
        enumerable: true,
        get() {
          getterCalls++;
          return secret;
        },
      });
    else Object.defineProperty(errors, property, { value: secret, enumerable: true });
    const descriptor = Object.getOwnPropertyDescriptor(
      errors,
      property === 'accessor' ? 'secret' : property,
    );
    const body = { detail: 'Proxy denied', errors };
    let raw: AxiosError | undefined;
    const logs: string[] = [];
    const logger = pino({ level: 'error' }, { write: (line: string) => logs.push(line) });
    const permit = new Permit({
      token: 'proxy-fixture',
      retry: false,
      log: { level: 'silent' },
      axiosInstance: axios.create({
        adapter: async (config) => {
          raw = new AxiosError(
            'Proxy denied',
            secret,
            config,
            undefined,
            response(config, body, 422),
          );
          throw raw;
        },
      }),
    });
    permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
    const failure: unknown = await new ProxyConfigsApi(permit.config, logger)
      .get('payments')
      .catch((caught: unknown) => caught);
    assert(failure instanceof PermitApiError);
    assert(raw);
    expect(failure.code).toBeUndefined();
    expect(failure.status).toBe(422);
    expect(failure.message).toBe('Permit API request failed with HTTP 422.');
    expect(getterCalls).toBe(0);
    expect(raw.code).toBe(secret);
    expect(raw.response?.data).toBe(body);
    expect(body.errors).toBe(errors);
    expect(
      Object.getOwnPropertyDescriptor(errors, property === 'accessor' ? 'secret' : property),
    ).toEqual(descriptor);
    for (const value of [
      String(failure),
      JSON.stringify(failure),
      inspect(failure, { depth: Infinity }),
      ...logs,
    ])
      expect(value).not.toContain(secret);
  },
);

test('repeated projections stay bounded and incomplete prior response privacy stays conservative', () => {
  let getterCalls = 0;
  const config = { headers: new AxiosHeaders(), url: 'https://control.example/proxy_configs' };
  const raw = new AxiosError(
    'Proxy denied',
    'CUSTOM_PROXY_FAILURE',
    config,
    undefined,
    response(config, { detail: 'Proxy denied', secret: 'RESPONSE_ONLY_PROXY_CANARY' }, 422),
  );
  for (let index = 0; index < 128; index++) {
    const error = new PermitApiError('Proxy denied', raw);
    expect(error.code).toBe('CUSTOM_PROXY_FAILURE');
    expect(error.originalError.config?.url).toBe(config.url);
    expect(error.status).toBe(422);
  }
  const incomplete = Object.defineProperty({ detail: 'Proxy denied' }, 'secret', {
    enumerable: true,
    get() {
      getterCalls++;
      return 'RESPONSE_ONLY_PROXY_CANARY';
    },
  });
  assert(raw.response);
  raw.response.data = incomplete;
  expect(new PermitApiError('Proxy denied', raw).code).toBeUndefined();
  raw.response.data = { detail: 'Small safe response' };
  const later = new PermitApiError('Proxy denied', raw);
  expect(later.code).toBeUndefined();
  expect(later.status).toBe(422);
  expect(later.originalError.config?.url).toBe('[REDACTED]');
  expect(raw.code).toBe('CUSTOM_PROXY_FAILURE');
  expect(raw.response.data).toEqual({ detail: 'Small safe response' });
  expect(getterCalls).toBe(0);
});

test.each(['create', 'update'] as const)(
  '%s remains a single attempt even when callers opt into unsafe retry methods',
  async (method) => {
    const attempts: string[] = [];
    const permit = new Permit({
      token: 'proxy-fixture',
      log: { level: 'silent' },
      retry: {
        enabled: true,
        maxRetries: 2,
        retryDelay: 1,
        retryMethods: ['GET', 'POST', 'PATCH'],
      },
      axiosInstance: axios.create({
        adapter: async (config) => {
          attempts.push(String(config.method));
          throw new AxiosError(
            'Write reply unavailable',
            'ERR_BAD_RESPONSE',
            config,
            undefined,
            response(config, { detail: 'Write unavailable' }, 503),
          );
        },
      }),
    });
    permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
    await expect(
      method === 'create'
        ? permit.api.proxyConfigs.create(input)
        : permit.api.proxyConfigs.update(key, { name: 'Changed' }),
    ).rejects.toMatchObject({
      name: 'PermitApiError',
      status: 503,
    });
    expect(attempts).toEqual([method === 'create' ? 'post' : 'patch']);
  },
);

test('GET keeps the existing opt-in safe retry behavior', async () => {
  let requests = 0;
  const permit = new Permit({
    token: 'proxy-fixture',
    log: { level: 'silent' },
    retry: { enabled: true, maxRetries: 2, retryDelay: 1 },
    axiosInstance: axios.create({
      adapter: async (config) => {
        requests++;
        if (requests < 3)
          throw new AxiosError(
            'Read unavailable',
            'ERR_BAD_RESPONSE',
            config,
            undefined,
            response(config, { detail: 'Read unavailable' }, 503),
          );
        return response(config, [stored], 200);
      },
    }),
  });
  permit.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
  expect(await permit.api.proxyConfigs.list()).toEqual([stored]);
  expect(requests).toBe(3);
});
