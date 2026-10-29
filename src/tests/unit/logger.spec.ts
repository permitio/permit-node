import test from 'ava';
import axios, { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';

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
