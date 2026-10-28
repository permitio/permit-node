import test from 'ava';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';

import { serializeError } from '../../logger';

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
