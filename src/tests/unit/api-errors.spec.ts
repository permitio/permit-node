import { createServer, IncomingMessage, ServerResponse } from 'http';
import { inspect } from 'util';

import test, { ExecutionContext } from 'ava';
import axios from 'axios';
import pino from 'pino';

import { Permit, PermitApiError } from '../../index';

const TOKEN = 'permit_key_rest-token-do-not-log';
const CUSTOM_SECRET = 'custom-header-secret-do-not-log';
const COOKIE_SECRET = 'session-cookie-do-not-log';
const SECRETS = [TOKEN, CUSTOM_SECRET, COOKIE_SECRET];
const USER_PATH = '/v2/facts/proj-1/env-1/users/user-1';

type Reply = { status: number; body: unknown } | 'reset';

/** Starts a REST API fixture that grants an environment scope and fails the user request. */
async function startApi(t: ExecutionContext, reply: Reply): Promise<string> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    request.resume();
    if (request.url === '/v2/api-key/scope') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          organization_id: 'org-1',
          project_id: 'proj-1',
          environment_id: 'env-1',
        }),
      );
    } else if (reply === 'reset') {
      request.socket.destroy();
    } else {
      response.writeHead(reply.status, {
        'Content-Type': 'application/json',
        'Set-Cookie': `session=${COOKIE_SECRET}`,
      });
      response.end(JSON.stringify(reply.body));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  t.teardown(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected the REST API fixture to listen on a TCP port');
  }
  return `http://127.0.0.1:${address.port}`;
}

function createPermit(apiUrl: string): Permit {
  return new Permit({
    token: TOKEN,
    apiUrl,
    retry: false,
    log: { level: 'silent' },
    axiosInstance: axios.create({ headers: { 'X-Custom-Secret': CUSTOM_SECRET } }),
  });
}

/** Logs the error the way applications commonly do: through pino's standard err serializer. */
function pinoLine(error: unknown): string {
  const lines: string[] = [];
  const logger = pino({ level: 'error' }, { write: (line: string) => lines.push(line) });
  logger.error({ err: error }, 'REST call failed');
  return lines.join('');
}

function assertNoSecrets(t: ExecutionContext, error: unknown): void {
  const renderings = {
    inspect: inspect(error),
    inspectDeep: inspect(error, { depth: Infinity, showHidden: true }),
    json: JSON.stringify(error),
    pino: pinoLine(error),
  };
  for (const [name, text] of Object.entries(renderings)) {
    for (const secret of SECRETS) {
      t.false(text.includes(secret), `${name} contains ${secret}`);
    }
  }
}

for (const status of [401, 500]) {
  const body = { message: `test API failure ${status}`, error_code: 'TEST_FAILURE' };

  test(`PER-16544: a ${status} REST error does not expose the API key`, async (t) => {
    const permit = createPermit(await startApi(t, { status, body }));
    const error = await t.throwsAsync(permit.api.users.get('user-1'));
    t.true(error instanceof PermitApiError);
    if (!(error instanceof PermitApiError)) {
      return;
    }
    assertNoSecrets(t, error);

    t.is(error.message, body.message);
    t.is(error.response?.status, status);
    t.deepEqual(error.response?.data, body);
    t.deepEqual(error.formattedAxiosError, {
      code: error.originalError.code,
      message: body.message,
      error: body,
      status,
    });
    const config = error.originalError.config;
    t.is(config?.method, 'get');
    t.true(String(config?.url).endsWith(USER_PATH));
    t.is(config?.headers.Authorization, '[REDACTED]');
    t.is(config?.headers['X-Custom-Secret'], '[REDACTED]');
    t.regex(String(config?.headers['X-Permit-SDK-Version']), /^node:/);

    t.is(String(error.response?.headers['set-cookie']), '[REDACTED]');

    // Pino and JSON.stringify render the nested Axios error through its toJSON(), which has the
    // status and request config but not the response body.
    const logged = JSON.parse(pinoLine(error)).err;
    t.is(logged.message, body.message);
    t.is(logged.originalError.status, status);
    t.is(logged.originalError.config.method, 'get');
    t.true(String(logged.originalError.config.url).endsWith(USER_PATH));
    const serialized = JSON.parse(JSON.stringify(error));
    t.is(serialized.originalError.status, status);
    t.is(serialized.originalError.config.method, 'get');
  });

  test(`PER-16544: a ${status} error from a deprecated REST method does not expose the API key`, async (t) => {
    const permit = createPermit(await startApi(t, { status, body }));
    const error = await t.throwsAsync(permit.api.getUser('user-1'));
    t.true(axios.isAxiosError(error));
    if (!axios.isAxiosError(error)) {
      return;
    }
    assertNoSecrets(t, error);
    t.is(error.response?.status, status);
    t.deepEqual(error.response?.data, body);
    t.is(error.config?.method, 'get');
    t.true(String(error.config?.url).endsWith(USER_PATH));
  });
}

test('PER-16544: a REST transport error does not expose the API key', async (t) => {
  const permit = createPermit(await startApi(t, 'reset'));
  const error = await t.throwsAsync(permit.api.users.get('user-1'));
  t.true(error instanceof PermitApiError);
  if (!(error instanceof PermitApiError)) {
    return;
  }
  assertNoSecrets(t, error);
  t.is(error.response, undefined);
  t.is(error.originalError.config?.method, 'get');
  t.true(String(error.originalError.config?.url).endsWith(USER_PATH));
});
