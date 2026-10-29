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

test('the SDK logger redacts a token or Authorization header passed in an object', (t) => {
  const { logger, lines, records } = capturingLogger();

  logger.info({ token: TOKEN });
  logger.info({ client: { token: TOKEN } });
  logger.info({ headers: { Authorization: `Bearer ${TOKEN}` } });
  logger.info({ request: { headers: { authorization: `Bearer ${TOKEN}` } } });

  t.false(lines.join('').includes(TOKEN));
  const [top, nested, header, nestedHeader] = records();
  t.is(top.token, '[REDACTED]');
  t.is(nested.client.token, '[REDACTED]');
  t.is(header.headers.Authorization, '[REDACTED]');
  t.is(nestedHeader.request.headers.authorization, '[REDACTED]');
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
