import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { inspect } from 'node:util';

import axios from 'axios';
import pino from 'pino';

import { Permit, PermitApiError } from '#src/index';
import { rejectionOf } from '#src/tests/helpers/rejection';

const TOKEN = 'permit_key_rest-token-do-not-log';
const CUSTOM_SECRET = 'custom-header-secret-do-not-log';
const COOKIE_SECRET = 'session-cookie-do-not-log';
const SECRETS = [TOKEN, CUSTOM_SECRET, COOKIE_SECRET];
const USER_PATH = '/v2/facts/proj-1/env-1/users/user-1';

type Reply = { status: number; body: unknown } | 'reset';

/** The parts of a PermitApiError that pino and JSON.stringify keep. */
interface SerializedApiError {
  message: string;
  originalError: { status: number; config: { method: string; url: string } };
}

/**
 * Starts a REST API fixture on a free loopback port for the current test. It grants an
 * environment scope and fails the user request.
 */
async function startApi(reply: Reply): Promise<string> {
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
  onTestFinished(
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

/** The pathname of an absolute request URL kept on an error. */
function pathOf(url: string | undefined): string {
  assert(url, 'Expected the error to keep the request URL');
  return new URL(url).pathname;
}

function assertNoSecrets(error: unknown): void {
  const renderings = {
    inspect: inspect(error),
    inspectDeep: inspect(error, { depth: Infinity, showHidden: true }),
    json: JSON.stringify(error),
    pino: pinoLine(error),
  };
  for (const [name, text] of Object.entries(renderings)) {
    for (const secret of SECRETS) {
      expect(text, `${name} contains ${secret}`).not.toContain(secret);
    }
  }
}

describe('REST API errors (unit)', () => {
  for (const status of [401, 500]) {
    const body = { message: `test API failure ${status}`, error_code: 'TEST_FAILURE' };

    it(`PER-16544: a ${status} REST error does not expose the API key`, async () => {
      const permit = createPermit(await startApi({ status, body }));
      const error = await rejectionOf(permit.api.users.get('user-1'));
      expect(error).toBeInstanceOf(PermitApiError);
      assert(error instanceof PermitApiError);
      assertNoSecrets(error);

      expect(error.message).toBe(body.message);
      expect(error.response?.status).toBe(status);
      expect(error.response?.data).toStrictEqual(body);
      expect(error.formattedAxiosError).toStrictEqual({
        code: error.originalError.code,
        message: body.message,
        error: body,
        status,
      });
      const config = error.originalError.config;
      expect(config?.method).toBe('get');
      expect(pathOf(config?.url)).toBe(USER_PATH);
      expect(config?.headers.Authorization).toBe('[REDACTED]');
      expect(config?.headers['X-Custom-Secret']).toBe('[REDACTED]');
      expect(String(config?.headers['X-Permit-SDK-Version'])).toMatch(/^node:/);

      expect(String(error.response?.headers['set-cookie'])).toBe('[REDACTED]');

      // Pino and JSON.stringify render the nested Axios error through its toJSON(), which has the
      // status and request config but not the response body.
      const logged = (JSON.parse(pinoLine(error)) as { err: SerializedApiError }).err;
      expect(logged.message).toBe(body.message);
      expect(logged.originalError.status).toBe(status);
      expect(logged.originalError.config.method).toBe('get');
      expect(pathOf(logged.originalError.config.url)).toBe(USER_PATH);
      const serialized = JSON.parse(JSON.stringify(error)) as SerializedApiError;
      expect(serialized.originalError.status).toBe(status);
      expect(serialized.originalError.config.method).toBe('get');
    });

    const deprecatedError = `a ${status} error from a deprecated REST method`;
    it(`PER-16544: ${deprecatedError} does not expose the API key`, async () => {
      const permit = createPermit(await startApi({ status, body }));
      const error = await rejectionOf(permit.api.getUser('user-1'));
      expect(axios.isAxiosError(error)).toBe(true);
      assert(axios.isAxiosError(error));
      assertNoSecrets(error);
      expect(error.response?.status).toBe(status);
      expect(error.response?.data).toStrictEqual(body);
      expect(error.config?.method).toBe('get');
      expect(pathOf(error.config?.url)).toBe(USER_PATH);
    });
  }

  it('PER-16544: a REST transport error does not expose the API key', async () => {
    const permit = createPermit(await startApi('reset'));
    const error = await rejectionOf(permit.api.users.get('user-1'));
    expect(error).toBeInstanceOf(PermitApiError);
    assert(error instanceof PermitApiError);
    assertNoSecrets(error);
    expect(error.response).toBeUndefined();
    expect(error.originalError.config?.method).toBe('get');
    expect(pathOf(error.originalError.config?.url)).toBe(USER_PATH);
  });
});
