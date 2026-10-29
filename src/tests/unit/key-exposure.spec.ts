import http from 'http';
import { AddressInfo } from 'net';
import util from 'util';

import test from 'ava';
import axios, { AxiosError, AxiosHeaders, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { PermitApiError } from '../../api/base';

// A token value that only this test uses.
const TOKEN = 'permit_key_exposure_test_0123456789abcdef';

interface PermitInternals {
  enforcer: {
    client: AxiosInstance;
    contextStore: { add: (context: Record<string, unknown>) => void };
  };
  checkAllTenants: (
    user: string,
    action: string,
    resource: string,
    context?: Record<string, unknown>,
  ) => Promise<Array<{ key: string }>>;
  api: { users: { get: (key: string) => Promise<unknown> } };
}

// A server on 127.0.0.1 that answers with `handler`, so the errors below are the ones the
// Node http adapter really builds, request objects included.
async function withServer(
  handler: http.RequestListener,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// A 127.0.0.1 URL that refuses connections: a port that was just free.
async function refusedUrl(): Promise<string> {
  let url = '';
  await withServer(
    (_req, res) => res.end(),
    async (serverUrl) => {
      url = serverUrl;
    },
  );
  return url;
}

function assertNoToken(t: { false: (actual: boolean, message?: string) => void }, err: unknown) {
  t.false(util.inspect(err, { depth: 10 }).includes(TOKEN), 'util.inspect');
  t.false(JSON.stringify(err).includes(TOKEN), 'JSON.stringify');
  t.false(String(err).includes(TOKEN), 'String');
}

test('checkAllTenants sends the query in the body and the key only in the header', async (t) => {
  const { Permit } = await import('../../index');
  const permit = new Permit({ token: TOKEN, timeout: 4321 }) as unknown as PermitInternals;
  permit.enforcer.contextStore.add({ region: 'eu' });
  let sent: InternalAxiosRequestConfig | undefined;
  permit.enforcer.client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    sent = config;
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { allowed_tenants: [{ tenant: { key: 'tenant-1', attributes: {} } }] },
    };
  };

  const tenants = await permit.checkAllTenants('user-1', 'read', 'document', { ip: '1.2.3.4' });

  t.deepEqual(
    tenants.map((tenant) => tenant.key),
    ['tenant-1'],
  );
  t.truthy(sent);
  t.is(axios.getUri(sent), 'http://localhost:7766/allowed/all-tenants');
  t.is(sent?.method, 'post');
  t.is(sent?.timeout, 4321);
  t.is(AxiosHeaders.from(sent?.headers).get('Authorization'), `Bearer ${TOKEN}`);
  const body = JSON.parse(String(sent?.data));
  t.deepEqual(body, {
    user: { key: 'user-1' },
    action: 'read',
    resource: { type: 'document' },
    // The context store's context, merged with the call's.
    context: { region: 'eu', ip: '1.2.3.4' },
  });
  t.false(String(sent?.data).includes(TOKEN));
});

for (const failure of ['an error status', 'a refused connection']) {
  test(`checkAllTenants rethrows ${failure} without the key`, async (t) => {
    const { Permit } = await import('../../index');
    const check = async (pdp: string) => {
      const permit = new Permit({ token: TOKEN, pdp }) as unknown as PermitInternals;
      const err = await t.throwsAsync(permit.checkAllTenants('user-1', 'read', 'document'));
      // The error callers got before: the axios error itself.
      t.true(axios.isAxiosError(err));
      assertNoToken(t, err);
    };
    if (failure === 'an error status') {
      await withServer((_req, res) => {
        res.statusCode = 500;
        res.end('{}');
      }, check);
    } else {
      await check(await refusedUrl());
    }
  });
}

test('a PDP connection error names the PDP URL without its credentials', async (t) => {
  const { Permit, PermitConnectionError } = await import('../../index');
  const refused = new URL(await refusedUrl());
  const permit = new Permit({
    token: TOKEN,
    pdp: `http://pdp-user:pdp-password@${refused.host}/prefix?sig=query-secret`,
    throwOnError: true,
  });

  for (const call of [
    () => permit.check('user-1', 'read', 'document'),
    () => permit.bulkCheck([{ user: 'user-1', action: 'read', resource: 'document' }]),
    () => permit.getUserPermissions('user-1'),
  ]) {
    const err = await t.throwsAsync(call(), { instanceOf: PermitConnectionError });
    t.true(err.message.includes(`PDP is running at http://${refused.host}/prefix and`));
    for (const secret of [TOKEN, 'pdp-user', 'pdp-password', 'query-secret']) {
      t.false(err.message.includes(secret), secret);
    }
  }
});

// A REST API that grants an environment-level scope, and fails the call that follows with
// `fail`.
function apiServer(fail: (res: http.ServerResponse) => void): http.RequestListener {
  return (req, res) => {
    if (req.url === '/v2/api-key/scope') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({ organization_id: 'org', project_id: 'proj', environment_id: 'env' }),
      );
      return;
    }
    fail(res);
  };
}

async function apiError(t: { true: (actual: boolean) => void }, apiUrl: string) {
  const { Permit } = await import('../../index');
  const permit = new Permit({ token: TOKEN, apiUrl }) as unknown as PermitInternals;
  let caught: unknown;
  try {
    await permit.api.users.get('user-1');
  } catch (err) {
    caught = err;
  }
  t.true(caught instanceof PermitApiError);
  return caught as PermitApiError<unknown>;
}

test('a real API error status neither prints nor keeps the key', async (t) => {
  await withServer(
    apiServer((res) => {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"message":"boom"}');
    }),
    async (apiUrl) => {
      const error = await apiError(t, apiUrl);

      t.is(error.message, 'boom');
      t.is(error.response?.status, 500);
      assertNoToken(t, error);
      assertNoToken(t, error.originalError);
      t.false(JSON.stringify(error.formattedAxiosError).includes(TOKEN));
    },
  );
});

test('a network failure surfaces as a PermitApiError that says why, without the key', async (t) => {
  await withServer(
    // The connection drops before any response.
    apiServer((res) => res.socket?.destroy()),
    async (apiUrl) => {
      const error = await apiError(t, apiUrl);

      t.is(error.response, undefined);
      t.truthy(error.message);
      t.is(error.message, error.originalError.message);
      assertNoToken(t, error);
      assertNoToken(t, error.originalError);
    },
  );
});

test('an API error neither prints nor keeps the key', (t) => {
  const config = {
    method: 'get',
    url: 'https://api.example.com/v2/facts/p/e/users/u',
    headers: new AxiosHeaders({ Authorization: `Bearer ${TOKEN}` }),
  } as InternalAxiosRequestConfig;
  const request = { _header: `GET /v2 HTTP/1.1\r\nAuthorization: Bearer ${TOKEN}\r\nHost: x\r\n` };
  const response = {
    status: 500,
    statusText: 'Error',
    data: { message: 'boom' },
    headers: {},
    config,
    request,
  };
  const axiosError = new AxiosError(
    'failed',
    'ERR_BAD_RESPONSE',
    config,
    request,
    response as never,
  );

  const error = new PermitApiError('boom', axiosError);

  t.false(util.inspect(error, { depth: 10 }).includes(TOKEN));
  t.false(util.inspect(error.originalError, { depth: 10 }).includes(TOKEN));
  t.false(JSON.stringify(error.formattedAxiosError).includes(TOKEN));
  t.false(request._header.includes(TOKEN));
  // Still there, only not enumerable, so printing the error doesn't print the axios error.
  t.is(error.originalError, axiosError);
  t.is(error.request, request);
  t.is(error.response?.status, 500);
  t.false(Object.prototype.propertyIsEnumerable.call(error, 'originalError'));
  t.false(Object.prototype.propertyIsEnumerable.call(axiosError, 'request'));
  t.false(Object.prototype.propertyIsEnumerable.call(axiosError.response, 'request'));
  // And writable, as a public field was before.
  const other = new AxiosError('other');
  error.originalError = other;
  t.is(error.originalError, other);
  t.false(Object.prototype.propertyIsEnumerable.call(error, 'originalError'));
});

test('a PermitApiError without an API message falls back to the axios message', (t) => {
  const error = new PermitApiError(
    undefined as unknown as string,
    new AxiosError('timeout of 1ms'),
  );

  t.is(error.message, 'timeout of 1ms');
});
