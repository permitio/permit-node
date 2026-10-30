import http from 'http';
import { AddressInfo } from 'net';
import util from 'util';

import test from 'ava';
import axios, { AxiosError, AxiosHeaders, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { PermitApiError } from '../../api/base';
import { IPermitConfig } from '../../config';
import { LoggerFactory } from '../../logger';

// A token value that only this test uses.
const TOKEN = 'permit_key_exposure_test_0123456789abcdef';

interface PermitInternals {
  logger: unknown;
  enforcer: {
    client: AxiosInstance;
    logger: unknown;
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

// A 127.0.0.1 server that drops every connection before any response. It stays listening
// while `run` uses it, so no other listener can take the port in between.
async function withDroppingServer(run: (url: string) => Promise<void>): Promise<void> {
  const server = http.createServer();
  server.on('connection', (socket) => socket.destroy());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function assertNoToken(t: { false: (actual: boolean, message?: string) => void }, err: unknown) {
  t.false(util.inspect(err, { depth: 10 }).includes(TOKEN), 'util.inspect');
  // Hidden (non-enumerable) properties too, as some inspection modes show them.
  t.false(util.inspect(err, { depth: 10, showHidden: true }).includes(TOKEN), 'showHidden');
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

for (const failure of ['an error status', 'a dropped connection']) {
  test(`checkAllTenants rethrows ${failure} without the key, and logs it once`, async (t) => {
    const { Permit } = await import('../../index');
    const lines: string[] = [];
    const logger = LoggerFactory.createLogger(
      { log: { level: 'info', label: 'test', json: false } } as IPermitConfig,
      { write: (line: string) => lines.push(line) },
    );
    const check = async (pdp: string) => {
      const permit = new Permit({ token: TOKEN, pdp }) as unknown as PermitInternals;
      permit.logger = logger;
      permit.enforcer.logger = logger;
      const err = await t.throwsAsync(permit.checkAllTenants('user-1', 'read', 'document'));
      // The error callers got before: the axios error itself.
      t.true(axios.isAxiosError(err));
      assertNoToken(t, err);

      const logged = lines
        .map((line) => JSON.parse(line))
        .filter((record) => record.msg === 'Error fetching all tenants');
      t.is(logged.length, 1);
      if (failure === 'an error status') {
        t.is(logged[0].err.status, 500);
      }
      t.truthy(logged[0].err.code);
      t.false(lines.join('').includes(TOKEN));

      // The redaction edits that failed request's config, not the client's: the next call
      // still sends the key.
      let authorization: string | undefined;
      await withServer(
        (req, res) => {
          authorization = req.headers.authorization;
          res.setHeader('Content-Type', 'application/json');
          res.end('{"allowed_tenants":[]}');
        },
        async (url) => {
          permit.enforcer.client.defaults.baseURL = `${url}/`;
          t.deepEqual(await permit.checkAllTenants('user-1', 'read', 'document'), []);
        },
      );
      t.is(authorization, `Bearer ${TOKEN}`);
    };
    if (failure === 'an error status') {
      await withServer((_req, res) => {
        res.statusCode = 500;
        res.end('{}');
      }, check);
    } else {
      await withDroppingServer(check);
    }
  });
}

test('a PDP connection error names the PDP URL without its credentials', async (t) => {
  const { Permit, PermitConnectionError } = await import('../../index');
  await withDroppingServer(async (url) => {
    const { host } = new URL(url);
    const permit = new Permit({
      token: TOKEN,
      pdp: `http://pdp-user:pdp-password@${host}/prefix?sig=query-secret`,
      throwOnError: true,
    });

    for (const call of [
      () => permit.check('user-1', 'read', 'document'),
      () => permit.bulkCheck([{ user: 'user-1', action: 'read', resource: 'document' }]),
      () => permit.getUserPermissions('user-1'),
    ]) {
      const err = await t.throwsAsync(call(), { instanceOf: PermitConnectionError });
      t.true(err.message.includes(`PDP is running at http://${host}/prefix and`));
      for (const secret of [TOKEN, 'pdp-user', 'pdp-password', 'query-secret']) {
        t.false(err.message.includes(secret), secret);
      }
    }
  });
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
  // An accessor, so even inspecting hidden properties doesn't print the request.
  t.false(util.inspect(axiosError, { depth: 10, showHidden: true }).includes('GET /v2'));
  axiosError.request = { replaced: true };
  t.deepEqual(axiosError.request, { replaced: true });
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
