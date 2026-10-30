import test from 'ava';
import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosInstance,
  CreateAxiosDefaults,
  InternalAxiosRequestConfig,
} from 'axios';
import pino from 'pino';

import { IPermitConfig } from '../../config';
import { LoggerFactory, serializeError } from '../../logger';
import { AxiosLoggingInterceptor } from '../../utils/http-logger';

// A token value that only this test uses.
const TOKEN = 'permit_key_logger_test_0123456789abcdef';

function axiosErrorWithTheToken(): AxiosError {
  const config = {
    method: 'post',
    url: 'http://user:password@pdp.example.com:7766/allowed?sig=query-secret',
    headers: new AxiosHeaders({ Authorization: `Bearer ${TOKEN}` }),
  } as InternalAxiosRequestConfig;
  const request = { _header: `POST /allowed HTTP/1.1\r\nAuthorization: Bearer ${TOKEN}\r\n` };
  const response = {
    status: 502,
    statusText: 'Bad Gateway',
    data: 'bad gateway',
    headers: {},
    config,
  };
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, request, response as never);
}

test('an axios error is logged without its config, request or response', (t) => {
  const serialized = serializeError(axiosErrorWithTheToken());

  const text = JSON.stringify(serialized);
  for (const secret of [TOKEN, 'password', 'query-secret']) {
    t.false(text.includes(secret), secret);
  }
  t.deepEqual(serialized, {
    type: 'AxiosError',
    message: 'Request failed',
    code: 'ERR_BAD_RESPONSE',
    status: 502,
    method: 'POST',
    url: 'http://pdp.example.com:7766/allowed',
  });
});

test('any other error is logged as pino logs it', (t) => {
  const serialized = serializeError(new TypeError('boom')) as Record<string, unknown>;

  t.is(serialized.type, 'TypeError');
  t.is(serialized.message, 'boom');
});

// The SDK's logger, writing its JSON lines to an array instead of stdout.
function capturingLogger(level = 'info') {
  const lines: string[] = [];
  const logger = LoggerFactory.createLogger(
    { log: { level, label: 'test', json: false } } as IPermitConfig,
    { write: (line: string) => lines.push(line) },
  );
  return { logger, lines, records: () => lines.map((line) => JSON.parse(line)) };
}

test('the SDK logger serializes an axios error without its config, request or response', (t) => {
  const { logger, lines, records } = capturingLogger();

  logger.error({ err: axiosErrorWithTheToken() }, 'failed');

  for (const secret of [TOKEN, 'password', 'query-secret']) {
    t.false(lines.join('').includes(secret), secret);
  }
  t.deepEqual(records()[0].err, {
    type: 'AxiosError',
    message: 'Request failed',
    code: 'ERR_BAD_RESPONSE',
    status: 502,
    method: 'POST',
    url: 'http://pdp.example.com:7766/allowed',
  });
});

// One case per redact path, so each path is pinned: the logged object, and where the
// censored value ends up in the record.
for (const [path, logged, read] of [
  ['token', { token: TOKEN }, (r: any) => r.token],
  ['*.token', { client: { token: TOKEN } }, (r: any) => r.client.token],
  [
    'headers.Authorization',
    { headers: { Authorization: `Bearer ${TOKEN}` } },
    (r: any) => r.headers.Authorization,
  ],
  [
    'headers.authorization',
    { headers: { authorization: `Bearer ${TOKEN}` } },
    (r: any) => r.headers.authorization,
  ],
  [
    '*.headers.Authorization',
    { request: { headers: { Authorization: `Bearer ${TOKEN}` } } },
    (r: any) => r.request.headers.Authorization,
  ],
  [
    '*.headers.authorization',
    { request: { headers: { authorization: `Bearer ${TOKEN}` } } },
    (r: any) => r.request.headers.authorization,
  ],
] as Array<[string, Record<string, unknown>, (record: any) => unknown]>) {
  test(`the SDK logger redacts ${path}`, (t) => {
    const { logger, lines, records } = capturingLogger();

    logger.info(logged);

    t.false(lines.join('').includes(TOKEN));
    t.is(read(records()[0]), '[REDACTED]');
  });
}

test('any other error keeps no URL credentials in its input field', (t) => {
  let invalid: unknown;
  try {
    new URL('http://user:password@host:bad/path?sig=query-secret');
  } catch (err) {
    invalid = err;
  }
  t.is((invalid as { code?: string }).code, 'ERR_INVALID_URL');
  const { logger, lines, records } = capturingLogger();

  logger.error({ err: invalid }, 'failed');

  for (const secret of ['user:', 'password', 'query-secret']) {
    t.false(lines.join('').includes(secret), secret);
  }
  t.is(records()[0].err.input, 'http://host:bad/path');
  t.is(records()[0].err.code, 'ERR_INVALID_URL');
});

test('the input redaction never writes to the logged value', (t) => {
  // Not error-like (no message), so pino hands back this same object; frozen, so a write
  // would throw.
  const value = Object.freeze({ code: 'X', input: 'http://user:password@host:7766/path' });
  const { logger, lines, records } = capturingLogger();

  t.notThrows(() => logger.error({ err: value }, 'failed'));

  t.is(value.input, 'http://user:password@host:7766/path');
  t.false(lines.join('').includes('password'));
  t.is(records()[0].err.input, 'http://host:7766/path');
});

test('the HTTP debug lines show a URL without its credentials or query', async (t) => {
  const { logger, lines, records } = capturingLogger('debug');
  const client = axios.create();
  AxiosLoggingInterceptor.setupInterceptor(client, logger);
  client.defaults.adapter = async (config: InternalAxiosRequestConfig) => ({
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    data: {},
  });

  await client.get('http://user:password@pdp.example.com:7766/allowed?sig=query-secret');

  for (const secret of ['user', 'password', 'query-secret']) {
    t.false(lines.join('').includes(secret), secret);
  }
  t.deepEqual(
    records().map((record) => record.msg),
    [
      'Sending HTTP request: GET http://pdp.example.com:7766/allowed',
      'Received HTTP response: GET http://pdp.example.com:7766/allowed, status: 200',
    ],
  );
});

test('the HTTP debug lines show the URL a relative path goes to, an @ in its path kept', async (t) => {
  const { logger, lines, records } = capturingLogger('debug');
  const client = axios.create({ baseURL: 'http://user:password@pdp.example.com:7766/' });
  AxiosLoggingInterceptor.setupInterceptor(client, logger);
  client.defaults.adapter = async (config: InternalAxiosRequestConfig) => ({
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    data: {},
  });

  await client.get('/users/a@example.com/x', { params: { sig: 'query-secret' } });

  for (const secret of ['user:', 'password', 'query-secret']) {
    t.false(lines.join('').includes(secret), secret);
  }
  t.deepEqual(
    records().map((record) => record.msg),
    [
      'Sending HTTP request: GET http://pdp.example.com:7766/users/a@example.com/x',
      'Received HTTP response: GET http://pdp.example.com:7766/users/a@example.com/x, status: 200',
    ],
  );
});

function stubbedClient(logger: pino.Logger, config: CreateAxiosDefaults = {}): AxiosInstance {
  const client = axios.create(config);
  AxiosLoggingInterceptor.setupInterceptor(client, logger);
  client.defaults.adapter = async (sent: InternalAxiosRequestConfig) => ({
    status: 200,
    statusText: 'OK',
    headers: {},
    config: sent,
    data: {},
  });
  return client;
}

test('the HTTP debug lines show config.url, redacted, when getUri throws', async (t) => {
  const { logger, records } = capturingLogger('debug');
  const client = stubbedClient(logger);
  client.getUri = () => {
    throw new Error('getUri');
  };

  await client.get('http://user:password@pdp.example.com:7766/allowed?sig=query-secret');

  t.deepEqual(
    records().map((record) => record.msg),
    [
      'Sending HTTP request: GET http://pdp.example.com:7766/allowed',
      'Received HTTP response: GET http://pdp.example.com:7766/allowed, status: 200',
    ],
  );
});

test('the HTTP debug lines build their URL without the params', async (t) => {
  const { logger, records } = capturingLogger('debug');
  let serialized = 0;
  const client = stubbedClient(logger, {
    params: { sig: 'query-secret' },
    paramsSerializer: {
      serialize: () => {
        serialized += 1;
        return 'sig=query-secret';
      },
    },
  });

  await client.get('http://pdp.example.com:7766/allowed');

  // The stub adapter never builds the URL, so any call is the debug lines'.
  t.is(serialized, 0);
  t.is(records().length, 2);
});

test('a request with neither url nor baseURL logs an empty URL', async (t) => {
  const { logger, records } = capturingLogger('debug');
  const client = stubbedClient(logger);

  await client.request({ method: 'get' });

  t.deepEqual(
    records().map((record) => record.msg),
    ['Sending HTTP request: GET ', 'Received HTTP response: GET , status: 200'],
  );
});

for (const level of ['warn', 'debug']) {
  test(`a url given as a URL object is sent and logged (level ${level})`, async (t) => {
    const { logger, records } = capturingLogger(level);
    const client = stubbedClient(logger);

    const response = await client.get(
      new URL('http://user:password@pdp.example.com:7766/allowed') as unknown as string,
    );

    t.is(response.status, 200);
    t.deepEqual(
      records().map((record) => record.msg),
      level === 'debug'
        ? [
            'Sending HTTP request: GET http://pdp.example.com:7766/allowed',
            'Received HTTP response: GET http://pdp.example.com:7766/allowed, status: 200',
          ]
        : [],
    );
  });
}

test('the HTTP lines are not built when debug is off', async (t) => {
  const { logger } = capturingLogger('info');
  const client = stubbedClient(logger);
  let built = 0;
  client.getUri = () => {
    built += 1;
    return 'http://pdp.example.com:7766/allowed';
  };

  await client.get('http://pdp.example.com:7766/allowed');

  t.is(built, 0);
});
