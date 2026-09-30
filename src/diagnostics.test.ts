import { createServer } from 'node:http';
import { inspect } from 'node:util';
import { Writable } from 'node:stream';

import axios, { AxiosError, AxiosHeaders } from 'axios';
import pino from 'pino';
import pretty from 'pino-pretty';

import {
  ApiContext,
  Permit,
  PermitApiError,
  PermitConnectionError,
  PermitContextError,
  PermitError,
  PermitPDPStatusError,
} from '#src/index';
import { PermitContextChangeError } from '#src/api/context';
import { LoggerFactory } from '#src/logger';
import { rejectionOf } from '#src/tests/helpers/rejection';
import { createOwnedTransport } from '#src/utils/http-transport';
import { resolveRetryConfig } from '#src/utils/retry';

const TOKEN = 'permit_key_diagnostics_canary';
const PRIVATE = 'private_attribute_diagnostics_canary';
const COOKIE = 'cookie_diagnostics_canary';
const URL_SECRET = 'url_password_diagnostics_canary';
const CUSTOM = 'custom_header_diagnostics_canary';
const NUMBER = 92186753090077;
const CODE = 'PRIVATE_ATTRIBUTE_CANARY';
const CANARIES = [TOKEN, PRIVATE, COOKIE, URL_SECRET, CUSTOM, String(NUMBER), CODE];
const user = { key: 'user-1', email: PRIVATE, attributes: { note: PRIVATE } };

function initializedContext(): ApiContext {
  const context = new ApiContext();
  context._saveApiKeyAccessibleScope('org', 'proj', 'env');
  context.setEnvironmentLevelContext('org', 'proj', 'env');
  return context;
}

async function startApi(body: unknown, scopeFailure = false, status = 503): Promise<string> {
  const server = createServer((request, response) => {
    request.resume();
    if (request.url?.includes('/api-key/scope') && !scopeFailure) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({ organization_id: 'org', project_id: 'proj', environment_id: 'env' }),
      );
    } else if (body === 'reset') {
      request.socket.destroy();
    } else {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Set-Cookie': COOKIE });
      response.end(typeof body === 'string' ? body : JSON.stringify(body));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  onTestFinished(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  assert(address !== null && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

function fixture(options: ConstructorParameters<typeof Permit>[0], json = true) {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const logger = pino(
    { level: 'debug' },
    json ? destination : pretty({ sync: true, colorize: false, destination }),
  );
  vi.spyOn(LoggerFactory, 'createLogger').mockReturnValue(logger);
  onTestFinished(() => {
    vi.restoreAllMocks();
  });
  const permit = new Permit({ token: TOKEN, retry: false, ...options });
  return { permit, lines, logger };
}

function representations(error: Error): string[] {
  const lines: string[] = [];
  const logger = pino({ level: 'error' }, { write: (line: string) => lines.push(line) });
  logger.error({ err: error }, 'Application error');
  return [
    String(error),
    inspect(error, { depth: Infinity, showHidden: true }),
    JSON.stringify(error),
    ...lines,
  ];
}

function assertSafe(values: string[]): void {
  for (const value of values) {
    for (const canary of CANARIES) expect(value).not.toContain(canary);
  }
}

describe('PER-16565: safe diagnostics at public boundaries', () => {
  for (const [body, message] of [
    [null, '503'],
    ['', '503'],
    ['upstream unavailable', 'upstream unavailable'],
    [{ detail: 'Service unavailable' }, 'Service unavailable'],
    [{ detail: [{ msg: 'Invalid field', loc: ['body', 'key'], input: PRIVATE }] }, 'Invalid field'],
  ] as const) {
    it(`normalizes REST body ${JSON.stringify(body)}`, async () => {
      const { permit } = fixture({ apiUrl: await startApi(body) });
      const error = await rejectionOf(permit.api.users.get('user-1'));
      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.name).toBe('PermitApiError');
      expect(error.message).toContain(message);
      expect(error).toMatchObject({ status: 503 });
      assertSafe(representations(error));
    });
  }

  it('retains a safe network cause and transport code', async () => {
    const { permit } = fixture({ apiUrl: await startApi('reset') });
    const error = await rejectionOf(permit.api.users.get('user-1'));
    expect(error).toBeInstanceOf(PermitApiError);
    expect(error.message).toContain('socket hang up');
    expect(error).toMatchObject({ code: 'ECONNRESET', cause: { code: 'ECONNRESET' } });
    assertSafe(representations(error));
  });

  for (const code of ['OPAQUE_SECRET_CREDENTIAL', 'ECONNRESET']) {
    it(`sanitizes non-Axios adapter metadata ${code} without changing the caller error`, async () => {
      const token = 'OPAQUE_SECRET_CREDENTIAL';
      const raw = Object.assign(new Error('caller adapter failed'), { code, status: 502 });
      const apiContext = initializedContext();
      const { permit, lines } = fixture({
        token,
        apiContext,
        axiosInstance: axios.create({
          adapter: async () => {
            throw raw;
          },
        }),
      });
      const error = await rejectionOf(permit.api.users.get('user-1'));
      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.message).toContain('caller adapter failed');
      expect(error).toMatchObject({ status: 502 });
      expect((error as PermitApiError).code).toBe(code === token ? undefined : code);
      for (const value of [...lines, ...representations(error)]) expect(value).not.toContain(token);
      expect(raw.code).toBe(code);
      expect(raw.status).toBe(502);
    });
  }

  for (const source of [
    'adapter',
    'bare Axios error',
    'request hook',
    'response hook',
    'retry predicate',
  ]) {
    it(`redacts original request values when a caller ${source} throws an ordinary Error`, async () => {
      const raw =
        source === 'bare Axios error'
          ? new AxiosError(`Caller failed for ${PRIVATE} ${NUMBER}`, 'ECONNRESET')
          : new Error(`Caller failed for ${PRIVATE} ${NUMBER}`);
      const originalKeys = Object.keys(raw);
      let transient: AxiosError | undefined;
      let predicateCalls = 0;
      const caller = axios.create({
        adapter: async (config) => {
          if (source === 'adapter' || source === 'bare Axios error') throw raw;
          const response = {
            status: 503,
            statusText: 'Unavailable',
            headers: {},
            config,
            data: {},
          };
          if (source === 'retry predicate') {
            transient = new AxiosError(
              'upstream failed',
              'ERR_BAD_RESPONSE',
              config,
              undefined,
              response,
            );
            throw transient;
          }
          return { ...response, status: 200 };
        },
      });
      if (source === 'request hook')
        caller.interceptors.request.use(() => {
          throw raw;
        });
      if (source === 'response hook')
        caller.interceptors.response.use(() => {
          throw raw;
        });
      const apiContext = initializedContext();
      const { permit, lines } = fixture({
        apiContext,
        axiosInstance: caller,
        retry:
          source === 'retry predicate'
            ? {
                maxRetries: 1,
                retryCondition: (error) => {
                  predicateCalls += 1;
                  expect(error).toBe(transient);
                  throw raw;
                },
              }
            : false,
      });
      const error = await rejectionOf(
        permit.api.users.sync({
          key: 'user-1',
          attributes: { note: PRIVATE, number: NUMBER },
        }),
      );
      expect(error).toBeInstanceOf(PermitApiError);
      assertSafe([...lines, ...representations(error)]);
      expect(raw.message).toBe(`Caller failed for ${PRIVATE} ${NUMBER}`);
      expect(Object.keys(raw)).toEqual(originalKeys);
      expect(predicateCalls).toBe(source === 'retry predicate' ? 1 : 0);
      if (raw instanceof AxiosError) expect(raw.config).toBeUndefined();
      const direct = new PermitContextError(`Other operation ${PRIVATE} ${NUMBER}`, { cause: raw });
      assertSafe(representations(direct));
    });
  }

  for (const body of [
    {
      message: `Rejected ${PRIVATE}`,
      detail: [
        ...Array.from({ length: 8 }, () => ({ msg: 'Invalid field' })),
        { msg: 'Invalid field', input: PRIVATE },
      ],
    },
    {
      message: `Rejected ${PRIVATE}`,
      errors: [
        {
          errors: [
            {
              errors: [
                {
                  attributes: { note: PRIVATE },
                },
              ],
            },
          ],
        },
      ],
    },
  ]) {
    it(`fails closed when response privacy traversal cannot inspect ${'detail' in body ? 'an array tail' : 'deep objects'}`, () => {
      const raw = new AxiosError('request failed', 'ERR_BAD_RESPONSE', {
        headers: new AxiosHeaders(),
      });
      raw.response = {
        status: 503,
        statusText: 'Unavailable',
        headers: {},
        config: raw.config!,
        data: body,
      };
      const error = new PermitApiError('Request failed', raw);
      expect(error.status).toBe(503);
      expect(error.originalError.message).toContain('503');
      assertSafe(representations(error));
    });
  }

  it('redacts an opaque credential on a URL path before bounding public errors', () => {
    const credential = `opaque-${'abcde'.repeat(300)}-end`;
    const raw = new AxiosError('Request failed', 'ERR_BAD_RESPONSE', {
      headers: new AxiosHeaders({ Authorization: `Bearer ${credential}` }),
      url: `https://example.test/${credential}`,
    });
    const error = new PermitApiError('Request failed', raw);
    for (const value of representations(error))
      expect(value).not.toContain(credential.slice(0, 900));
    expect((error.originalError.config?.url ?? '').length).toBeLessThan(1100);
    expect(raw.config?.url).toContain(credential);
  });

  it('redacts long URL-path credentials before bounding real SDK request logs', async () => {
    const credential = `opaque-${'abcde'.repeat(300)}-end`;
    const { permit, lines } = fixture({
      token: credential,
      apiUrl: `${await startApi({ detail: 'Service unavailable' })}/${credential}`,
    });
    const error = await rejectionOf(permit.api.users.get('user-1'));
    expect(error).toBeInstanceOf(PermitApiError);
    for (const value of [...lines, ...representations(error)])
      expect(value).not.toContain(credential.slice(0, 900));
  });

  it('uses recorded caller-header privacy for ordinary scope-hook failures', async () => {
    const raw = new Error(`Scope hook failed for ${CUSTOM} ${TOKEN}`);
    const caller = axios.create({ headers: { 'X-Custom': CUSTOM } });
    caller.interceptors.request.use(() => {
      throw raw;
    });
    const { permit, lines } = fixture({ axiosInstance: caller });
    const error = await rejectionOf(permit.api.users.get('user-1'));
    expect(error).toBeInstanceOf(PermitContextError);
    expect(error.message).toContain('Scope hook failed');
    assertSafe([...lines, ...representations(error)]);
    expect(raw.message).toBe(`Scope hook failed for ${CUSTOM} ${TOKEN}`);
  });

  it('scrubs OPA ordinary caller failures and PDP URL guidance using the same request privacy', async () => {
    const raw = Object.assign(new Error(`Caller failed for ${PRIVATE} ${NUMBER}`), {
      code: 'ECONNRESET',
    });
    const { permit, lines } = fixture({
      pdp: `http://127.0.0.1:8181/${TOKEN}/${PRIVATE}`,
      opaAxiosInstance: axios.create({
        adapter: async () => {
          throw raw;
        },
      }),
    });
    const error = await rejectionOf(
      permit.check(user, 'read', 'doc', { privateNumber: NUMBER }, { useOpa: true }),
    );
    expect(error).toBeInstanceOf(PermitConnectionError);
    expect(error).toMatchObject({ code: 'ECONNRESET' });
    assertSafe([...lines, ...representations(error)]);
    expect(raw.message).toContain(PRIVATE);
  });

  for (const primitive of [PRIVATE, NUMBER, true]) {
    it(`fails closed with useful REST guidance for a primitive caller rejection ${typeof primitive}`, async () => {
      const apiContext = initializedContext();
      const caller = axios.create({
        adapter: async () => {
          throw primitive;
        },
      });
      const { permit, lines } = fixture({ apiContext, axiosInstance: caller });
      const error = await rejectionOf(permit.api.users.create(user));
      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.message).toContain('check connectivity and configuration');
      assertSafe([...lines, ...representations(error)]);
      const transport = createOwnedTransport({
        caller,
        logger: pino({ level: 'silent' }),
        retry: resolveRetryConfig(false),
        name: 'REST',
      });
      await expect(transport.post('/users', user)).rejects.toBe(primitive);
    });
  }

  it('merges privacy for a reused caller error across SDKs without mixing distinct failures', async () => {
    const firstToken = 'OPAQUE_FIRST_TOKEN';
    const secondToken = 'OPAQUE_SECOND_TOKEN';
    const raw = Object.assign(new Error(`Caller failed for ${PRIVATE} ${firstToken}`), {
      code: firstToken,
    });
    const caller = axios.create({
      adapter: async () => {
        throw raw;
      },
    });
    const apiContext = initializedContext();
    const first = fixture({ token: firstToken, apiContext, axiosInstance: caller });
    const firstError = await rejectionOf(
      first.permit.api.users.create({ key: 'one', attributes: { note: PRIVATE } }),
    );
    assertSafe([...first.lines, ...representations(firstError)]);
    raw.message = `Caller failed for ${PRIVATE} ${CUSTOM} ${firstToken} ${secondToken}`;
    const second = fixture({ token: secondToken, apiContext, axiosInstance: caller });
    const secondError = await rejectionOf(
      second.permit.api.users.create({ key: 'two', attributes: { note: CUSTOM } }),
    );
    expect((secondError as PermitApiError).code).toBeUndefined();
    for (const value of [
      ...first.lines,
      ...second.lines,
      ...representations(firstError),
      ...representations(secondError),
    ]) {
      for (const token of [firstToken, secondToken]) expect(value).not.toContain(token);
    }
    assertSafe([...second.lines, ...representations(secondError)]);
    expect(raw.code).toBe(firstToken);
    expect(raw.message).toContain(CUSTOM);
    const unrelated = fixture({
      apiContext,
      axiosInstance: axios.create({
        adapter: async () => {
          throw Object.assign(new Error('Upstream unavailable'), { code: 'ECONNRESET' });
        },
      }),
    });
    const unrelatedError = await rejectionOf(unrelated.permit.api.users.get('user-1'));
    expect(unrelatedError.message).toBe('Upstream unavailable');
    expect(unrelatedError).toMatchObject({ code: 'ECONNRESET' });
  });

  it('keeps reused request privacy bounded and permanently fails closed after overflow', async () => {
    const raw = Object.assign(new Error(`Caller failed for ${PRIVATE}`), { code: 'ECONNRESET' });
    const apiContext = initializedContext();
    const { permit, lines } = fixture({
      apiContext,
      axiosInstance: axios.create({
        adapter: async () => {
          throw raw;
        },
      }),
    });
    for (const phase of [1, 2, 3]) {
      const values =
        phase === 3 ? [] : Array.from({ length: 280 }, (_, index) => `private-${phase}-${index}`);
      const error = await rejectionOf(
        permit.api.users.create({ key: 'user-1', attributes: { values, note: PRIVATE } }),
      );
      assertSafe([...lines, ...representations(error)]);
      if (phase > 1) {
        expect(error.message).toContain('check connectivity and configuration');
        expect((error as PermitApiError).code).toBeUndefined();
      }
      expect(JSON.stringify(error).length).toBeLessThan(10_000);
    }
    expect(raw.code).toBe('ECONNRESET');
    expect(Object.keys(raw)).toEqual(['code']);
  });

  it('fails closed when ordinary caller request privacy exceeds the character budget', async () => {
    const raw = new Error(`Caller failed for ${PRIVATE}`);
    const apiContext = initializedContext();
    const { permit, lines } = fixture({
      apiContext,
      axiosInstance: axios.create({
        adapter: async () => {
          throw raw;
        },
      }),
    });
    const error = await rejectionOf(
      permit.api.users.create({
        key: 'user-1',
        attributes: { note: `${'x'.repeat(70_000)}${PRIVATE}` },
      }),
    );
    expect(error.message).toContain('check connectivity and configuration');
    assertSafe([...lines, ...representations(error)]);
  });

  it('scrubs slash/dot credentials before URL normalization can expose a suffix', async () => {
    const credential = 'credential-prefix/../opaque-credential-suffix';
    const raw = new AxiosError('Request failed', 'ERR_BAD_RESPONSE', {
      headers: new AxiosHeaders({ Authorization: `Bearer ${credential}` }),
      url: `https://example.test/${credential}`,
    });
    const direct = new PermitApiError('Request failed', raw);
    const { permit, lines } = fixture({
      token: credential,
      apiUrl: `${await startApi({ detail: 'Unavailable' })}/${credential}`,
    });
    const error = await rejectionOf(permit.api.users.get('user-1'));
    for (const value of [...lines, ...representations(error), ...representations(direct)])
      expect(value).not.toContain('opaque-credential-suffix');
  });

  for (const operation of ['REST', 'OPA']) {
    for (const status of [PRIVATE, NUMBER]) {
      it(`omits a fabricated private ${typeof status} HTTP status from ${operation} diagnostics`, async () => {
        const caller = axios.create({
          adapter: async (config) => {
            const response = {
              status: 503,
              statusText: 'Unavailable',
              headers: {},
              config,
              data: {},
            };
            Reflect.set(response, 'status', status);
            if (operation === 'REST')
              throw new AxiosError(
                'Request failed',
                'ERR_BAD_RESPONSE',
                config,
                undefined,
                response,
              );
            return response;
          },
        });
        const { permit, lines } = fixture({
          apiContext: initializedContext(),
          axiosInstance: caller,
          opaAxiosInstance: caller,
        });
        const error = await rejectionOf(
          operation === 'REST'
            ? permit.api.users.create({ ...user, attributes: { note: PRIVATE, number: NUMBER } })
            : permit.check(user, 'read', 'doc', { number: NUMBER }, { useOpa: true }),
        );
        expect(error).toBeInstanceOf(operation === 'REST' ? PermitApiError : PermitPDPStatusError);
        assertSafe([...lines, ...representations(error)]);
        if (error instanceof PermitApiError) expect(error.status).toBeUndefined();
        if (error instanceof PermitPDPStatusError) expect(error.statusCode).toBeUndefined();
      });
    }
  }

  for (const legacy of [true, false]) {
    for (const status of [PRIVATE, NUMBER, 200]) {
      it(`logs safe resolved ${legacy ? 'legacy' : 'modern'} statuses (${typeof status})`, async () => {
        const body = { key: 'user-1', attributes: { note: PRIVATE } };
        const { permit, lines } = fixture({
          apiContext: initializedContext(),
          axiosInstance: axios.create({
            adapter: async (config) => {
              const response = { config, status: 200, statusText: 'OK', headers: {}, data: body };
              Reflect.set(response, 'status', status);
              return response;
            },
          }),
        });
        const result = await (legacy
          ? permit.api.getUser('user-1')
          : permit.api.users.get('user-1'));
        expect(result).toEqual(body);
        assertSafe(lines);
        if (status === 200) expect(lines.join('')).toContain('200');
      });
    }
  }

  for (const [kind, credential, spelling] of [
    ['lowercase escapes', 'opaque:credential/with-space', 'opaque%3acredential%2fwith-space'],
    ['partial encoding', 'OPAQUE_CREDENTIAL', '%4fPAQUE_CREDENTIAL'],
    ['malformed suffix', 'OPAQUE_CREDENTIAL', '%4fPAQUE_CREDENTIAL/%zz'],
    ['invalid Unicode suffix', 'OPAQUE_CREDENTIAL', '%4fPAQUE_CREDENTIAL/%ED%A0%80'],
    ['Unicode escapes', 'opaque-雪', 'opaque-%e9%9b%aa'],
  ] as const) {
    it(`redacts ${kind} of known credentials before URL normalization and logging`, async () => {
      const raw = new AxiosError('Request failed', 'ECONNRESET', {
        headers: new AxiosHeaders({ Authorization: `Bearer ${credential}` }),
        url: `https://example.test/${spelling}`,
      });
      const direct = new PermitApiError('Request failed', raw);
      const { permit, lines } = fixture({
        token: credential,
        apiUrl: `${await startApi({ detail: 'Unavailable' })}/${spelling}`,
      });
      const error = await rejectionOf(permit.api.users.get('user-1'));
      for (const value of [...lines, ...representations(error), ...representations(direct)]) {
        expect(value).not.toContain(credential);
        expect(value).not.toContain(spelling);
      }
      expect(direct.originalError.config?.url).toBe('[REDACTED]');
      expect(raw.config?.url).toBe(`https://example.test/${spelling}`);
    });
  }

  for (const source of ['API response', 'ordinary caller failure']) {
    it(`redacts JSON-escaped private values in an ${source}`, async () => {
      const secret = 'json-private-canary\\path"quoted\nline\ud800';
      const escaped = JSON.stringify(secret).slice(1, -1);
      const raw = new Error(`Caller rejected ${escaped}`);
      const options =
        source === 'API response'
          ? { apiUrl: await startApi({ message: `API rejected ${escaped}` }) }
          : {
              apiContext: initializedContext(),
              axiosInstance: axios.create({
                adapter: async () => {
                  throw raw;
                },
              }),
            };
      const { permit, lines } = fixture(options);
      const error = await rejectionOf(
        permit.api.users.create({ key: 'user-1', attributes: { note: secret } }),
      );
      expect(error).toBeInstanceOf(PermitApiError);
      for (const value of [error.message, ...lines, ...representations(error)]) {
        expect(value).not.toContain(secret);
        expect(value).not.toContain(escaped);
      }
      expect(raw.message).toBe(`Caller rejected ${escaped}`);
    });
  }

  it('retains a named safe scope failure and status', async () => {
    const { permit, lines } = fixture({
      apiUrl: await startApi({ detail: 'Scope unavailable', attributes: { note: PRIVATE } }, true),
    });
    const error = await rejectionOf(permit.api.users.get('user-1'));
    expect(error).toBeInstanceOf(PermitContextError);
    expect(error.name).toBe('PermitContextError');
    expect(error.message).toContain('Scope unavailable');
    expect(error).toMatchObject({ status: 503, cause: { status: 503 } });
    assertSafe([...lines, ...representations(error)]);
  });

  it('bounds and sanitizes request, response, URL, custom cause and logs without mutating transport errors', async () => {
    const raw = new AxiosError(
      'failed',
      CODE,
      {
        headers: new AxiosHeaders({ Authorization: `Bearer ${TOKEN}`, 'X-Custom': CUSTOM }),
        method: 'post',
        url: `https://name:${URL_SECRET}@example.test/users?api_key=${TOKEN}#${PRIVATE}`,
        params: { private: PRIVATE },
        data: JSON.stringify({ ...user, privateNumber: NUMBER, privateCode: CODE }),
      },
      { raw: TOKEN },
    );
    raw.response = {
      status: 503,
      statusText: PRIVATE,
      config: raw.config!,
      headers: new AxiosHeaders({ 'Set-Cookie': COOKIE, 'X-Private': PRIVATE }),
      data: {
        message: `Failed for ${PRIVATE} ${TOKEN} ${NUMBER} ${CODE}`,
        attributes: { note: PRIVATE },
        huge: 'x'.repeat(100_000),
      },
    };
    raw.cause = Object.assign(new Error(TOKEN), { private: PRIVATE });
    const { permit, lines } = fixture({
      axiosInstance: axios.create({
        adapter: async (config) => {
          if (config.url?.includes('/api-key/scope'))
            return {
              config,
              status: 200,
              statusText: 'OK',
              headers: {},
              data: { organization_id: 'org', project_id: 'proj', environment_id: 'env' },
            };
          throw raw;
        },
      }),
    });
    const error = await rejectionOf(permit.api.users.get('user-1'));
    expect(error).toBeInstanceOf(PermitApiError);
    assert(error instanceof PermitApiError);
    expect(error.code).toBeUndefined();
    const url = new URL(error.originalError.config?.url ?? '');
    expect(url.username).toBe('');
    expect(url.password).toBe('');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
    assertSafe([...lines, ...representations(error)]);
    expect(JSON.stringify(error).length).toBeLessThan(10_000);
    expect(inspect(raw, { depth: Infinity })).toContain(TOKEN);
  });

  it('removes credentials from callback URLs inside server error descriptions', async () => {
    const address = `https://name:${URL_SECRET}@example.test/retry?token=${CUSTOM}#${PRIVATE}`;
    const { permit, lines } = fixture({
      apiUrl: await startApi({ detail: `Upstream callback failed at ${address}` }),
    });
    const error = await rejectionOf(permit.api.users.get('user-1'));
    expect(error).toBeInstanceOf(PermitApiError);
    expect(error.message).toContain('https://example.test/retry');
    assertSafe([...lines, ...representations(error)]);
  });

  it('sanitizes the exported REST error constructor against opaque header and numeric secrets', () => {
    const raw = new AxiosError('Opaque failure', 'ECONNRESET', {
      headers: new AxiosHeaders({ 'X-Custom': CUSTOM }),
      data: { privateNumber: NUMBER, privateCode: CODE },
    });
    const error = new PermitApiError(`Failed for ${CUSTOM} ${NUMBER} ${CODE}`, raw);
    assertSafe(representations(error));
    expect(error.code).toBe('ECONNRESET');
    expect(error.originalError).not.toBe(raw);
  });

  it('sanitizes direct Axios causes on exported context errors', () => {
    const raw = new AxiosError(`Transport failed for ${CUSTOM} ${NUMBER}`, 'ECONNRESET', {
      headers: new AxiosHeaders({ 'X-Custom': CUSTOM }),
      data: { privateNumber: NUMBER },
    });
    const error = new PermitContextError('Scope request failed', { cause: raw });
    expect(error.code).toBe('ECONNRESET');
    expect(error.cause).not.toBe(raw);
    assertSafe(representations(error));
  });

  for (const Constructor of [
    PermitError,
    PermitContextError,
    PermitContextChangeError,
    PermitConnectionError,
  ]) {
    it(`sanitizes the ${Constructor.name} constructor message against raw cause private values`, () => {
      const raw = new AxiosError('Request failed', 'ERR_BAD_RESPONSE', {
        headers: new AxiosHeaders({ 'X-Custom': CUSTOM }),
        data: { privateNumber: NUMBER },
      });
      raw.response = {
        status: 503,
        statusText: 'Unavailable',
        config: raw.config!,
        headers: {},
        data: { detail: 'Upstream unavailable' },
      };
      const error = new Constructor(`Operation rejected ${CUSTOM} ${NUMBER}`, { cause: raw });
      expect(error.name).toBe(Constructor.name);
      expect(error.message).toContain('Operation rejected');
      expect(error.cause).toMatchObject({ status: 503, code: 'ERR_BAD_RESPONSE' });
      expect(error.cause).not.toBe(raw);
      assertSafe(representations(error));
      expect(raw.config?.headers['X-Custom']).toBe(CUSTOM);
      expect(raw.config?.data).toEqual({ privateNumber: NUMBER });
    });
  }

  it('sanitizes and bounds the PDP status constructor message and body against raw cause private values', () => {
    const raw = new AxiosError('Request failed', 'ERR_BAD_RESPONSE', {
      headers: new AxiosHeaders({ 'X-Custom': CUSTOM }),
      data: { privateNumber: NUMBER },
    });
    const body = {
      message: `Operation rejected ${CUSTOM} ${NUMBER}`,
      detail: NUMBER,
      errors: Array.from({ length: 100 }, () => ({ msg: `${CUSTOM} ${'x'.repeat(9000)}` })),
      attributes: { note: PRIVATE },
    };
    const error = new PermitPDPStatusError(body.message, 503, body, { cause: raw });
    expect(error.name).toBe('PermitPDPStatusError');
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('ERR_BAD_RESPONSE');
    expect(error.cause).not.toBe(raw);
    expect(error.responseBody).toMatchObject({ detail: '[REDACTED]' });
    expect(JSON.stringify(error.responseBody).length).toBeLessThan(4000);
    assertSafe(representations(error));
    expect(body.detail).toBe(NUMBER);
    expect(raw.config?.headers['X-Custom']).toBe(CUSTOM);
  });

  it('fails closed on oversized or deeply nested private requests and bounds response descriptions', async () => {
    let attributes: unknown = PRIVATE;
    for (let depth = 0; depth < 20; depth++) attributes = { nested: attributes };
    const raw = new AxiosError('failure', 'ERR_BAD_RESPONSE', {
      headers: new AxiosHeaders(),
      data: { attributes },
    });
    raw.response = {
      status: 500,
      statusText: 'failed',
      headers: {},
      config: raw.config!,
      data: {
        message: `Failure for ${PRIVATE}`,
        detail: Array.from({ length: 1000 }, () => ({ msg: 'x'.repeat(20_000), input: PRIVATE })),
      },
    };
    const error = new PermitApiError(`Failure for ${PRIVATE}`, raw);
    assertSafe(representations(error));
    expect(JSON.stringify(error.response?.data).length).toBeLessThan(4000);
    expect(error.status).toBe(500);
    const oversized = new PermitApiError(
      `Failure for ${PRIVATE}`,
      new AxiosError('failure', 'ERR_BAD_RESPONSE', {
        headers: new AxiosHeaders(),
        data: `${'x'.repeat(70_000)}${PRIVATE}`,
      }),
    );
    assertSafe(representations(oversized));
  });

  it('redacts private response fields even when they were not part of the request', async () => {
    const { permit, lines } = fixture({
      apiUrl: await startApi({
        message: `Unexpected private value ${PRIVATE} ${NUMBER}`,
        email: PRIVATE,
        attributes: { privateNumber: NUMBER },
      }),
    });
    const error = await rejectionOf(permit.api.users.get('user-1'));
    assertSafe([...lines, ...representations(error)]);
    expect(error).toMatchObject({
      response: { data: { message: expect.stringContaining('[REDACTED]') } },
    });
  });

  it('redacts scalar numeric descriptions and tolerates unpaired Unicode in private attributes', async () => {
    const apiUrl = await startApi({ detail: NUMBER, message: 'Request rejected' });
    const { permit, lines } = fixture({ apiUrl });
    const error = await rejectionOf(
      permit.api.users.create({
        key: 'user-1',
        attributes: { privateNumber: NUMBER, unicode: '\ud800' },
      }),
    );
    expect(error).toBeInstanceOf(PermitApiError);
    expect(error).toMatchObject({ status: 503, response: { data: { detail: '[REDACTED]' } } });
    assertSafe([...lines, ...representations(error)]);
    expect(error.message).toBe('Request rejected');
  });

  it('bounds long descriptions and validation arrays on every public error projection', async () => {
    const { permit, lines } = fixture({
      apiUrl: await startApi({
        message: 'x'.repeat(40_000),
        detail: Array.from({ length: 100 }, () => ({ msg: 'y'.repeat(9000) })),
      }),
    });
    const error = await rejectionOf(permit.api.users.get('user-1'));
    expect(error).toBeInstanceOf(PermitApiError);
    assert(error instanceof PermitApiError);
    expect(error.message.length).toBeLessThan(1100);
    expect(JSON.stringify(error.response?.data).length).toBeLessThan(4000);
    for (const value of [...lines, ...representations(error)])
      expect(value.length).toBeLessThan(30_000);
  });

  for (const json of [true, false]) {
    it(`captures safe ${json ? 'JSON' : 'pretty'} output on a real REST failure with echoed inputs`, async () => {
      const apiUrl = await startApi({
        message: `Invalid user ${PRIVATE} ${NUMBER} ${TOKEN}`,
        email: PRIVATE,
        attributes: { privateNumber: NUMBER },
      });
      const { permit, lines } = fixture({ apiUrl }, json);
      const error = await rejectionOf(
        permit.api.users.create({
          key: 'user-1',
          email: PRIVATE,
          attributes: { privateNumber: NUMBER },
        }),
      );
      assertSafe([...lines, ...representations(error)]);
      expect(lines.join('')).toContain('Permit REST API request failed');
      if (json) expect(lines.some((line) => JSON.parse(line).operation === 'REST')).toBe(true);
      else expect(lines.join('')).toContain('ERROR');
    });

    it(`omits identity and permission attributes from successful ${json ? 'JSON' : 'pretty'} PDP logs`, async () => {
      const pdp = await startApi(
        {
          tenant: {
            permissions: ['read'],
            resource: {
              type: 'doc',
              key: 'one',
              attributes: { privateNumber: NUMBER, note: PRIVATE },
            },
          },
        },
        false,
        200,
      );
      const { permit, lines } = fixture({ pdp }, json);
      const permissions = await permit.getUserPermissions(user);
      expect(permissions).toMatchObject({
        tenant: { resource: { attributes: { note: PRIVATE } } },
      });
      assertSafe(lines);
      expect(lines.join('')).toContain('permit.getUserPermissions() succeeded');
    });
  }

  it('redacts credentials from HTTP retry logs while preserving private transport error identity', async () => {
    const { logger, lines } = fixture({});
    const raw = new AxiosError('failure', 'ECONNRESET');
    const caller = axios.create({
      adapter: async () => {
        throw raw;
      },
      headers: { 'X-Custom': CUSTOM },
    });
    const transport = createOwnedTransport({
      caller,
      logger,
      name: 'API',
      retry: resolveRetryConfig({ maxRetries: 1, retryDelay: 0 }),
    });
    await expect(
      transport.get(`https://name:${URL_SECRET}@example.test/${CUSTOM}?token=${TOKEN}#${PRIVATE}`),
    ).rejects.toBe(raw);
    assertSafe(lines);
    expect(lines.join('')).toContain('retry 1/1');
  });

  for (const status of [200, 201]) {
    for (const useOpa of [true, false]) {
      it(`redacts echoed private inputs in resolved ${status} ${useOpa ? 'OPA' : 'PDP'} responses`, async () => {
        const transport = axios.create({
          adapter: async (config) => ({
            config,
            status,
            statusText: 'OK',
            headers: {},
            data: { detail: `Rejected ${PRIVATE} ${NUMBER}` },
          }),
        });
        const { permit, lines } = fixture({
          pdp: await startApi({ detail: `Rejected ${PRIVATE} ${NUMBER}` }, false, status),
          opaAxiosInstance: transport,
        });
        const error = await rejectionOf(
          permit.check(user, 'read', 'doc:one', { privateNumber: NUMBER }, { useOpa }),
        );
        expect(error).toMatchObject({
          name: 'PermitPDPStatusError',
          statusCode: status,
          cause: { status },
        });
        assertSafe([...lines, ...representations(error)]);
        expect(error).toMatchObject({
          responseBody: { detail: expect.stringContaining('[REDACTED]') },
        });
      });
    }
  }

  for (const operation of [
    'check',
    'bulkCheck',
    'getUserPermissions',
    'checkAllTenants',
  ] as const) {
    it(`redacts identity, bodies and credential URLs for PDP ${operation}`, async () => {
      const pdp = await startApi({ detail: 'PDP unavailable', attributes: { note: PRIVATE } });
      const { permit, lines } = fixture({
        pdp: pdp.replace('http://', `http://name:${URL_SECRET}@`),
      });
      const call = {
        check: () =>
          permit.check(user, 'read', { type: 'doc', key: 'one', attributes: { note: PRIVATE } }),
        bulkCheck: () => permit.bulkCheck([{ user, action: 'read', resource: 'doc:one' }]),
        getUserPermissions: () => permit.getUserPermissions(user),
        checkAllTenants: () => permit.checkAllTenants(user, 'read', 'doc:one'),
      };
      const error = await rejectionOf(call[operation]());
      expect(error).toBeInstanceOf(PermitConnectionError);
      assertSafe([...lines, ...representations(error)]);
    });
  }
});
