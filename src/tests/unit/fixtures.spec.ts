import { AxiosError, AxiosHeaders } from 'axios';
import pino from 'pino';

import { PermitApiError } from '#src/index';
import { cleanUp, expectNotFound, handleApiError, ignoreNotFound } from '#src/tests/fixtures';

/** A REST error as the SDK raises it; no status means the request got no response. */
function apiError(status?: number, data: unknown = { message: 'failed' }): PermitApiError<unknown> {
  const config = {
    method: 'delete',
    url: 'https://api.test/v2/facts/users/u1',
    headers: new AxiosHeaders(),
  };
  const response =
    status === undefined ? undefined : { status, statusText: '', headers: {}, config, data };
  const axiosError = new AxiosError('socket hang up', undefined, config, undefined, response);
  return new PermitApiError('failed', axiosError);
}

const silentLogger = pino({ level: 'silent' });

describe('handleApiError', () => {
  it('names the request and the reply, and keeps the API error as the cause', () => {
    const error = apiError(422, { message: 'invalid key' });

    const thrown = (() => {
      try {
        handleApiError(error, 'creating the environment', silentLogger);
      } catch (caught) {
        return caught;
      }
    })();

    expect(thrown).toHaveProperty(
      'message',
      'creating the environment: DELETE https://api.test/v2/facts/users/u1 returned 422: ' +
        '{"message":"invalid key"}',
    );
    expect(thrown).toHaveProperty('cause', error);
  });

  it('says when the request got no response', () => {
    expect(() => handleApiError(apiError(), 'listing', silentLogger)).toThrow(
      'listing: DELETE https://api.test/v2/facts/users/u1 got no response: socket hang up',
    );
  });
});

describe('ignoreNotFound', () => {
  it('tolerates a 404', () => {
    expect(ignoreNotFound(apiError(404))).toBeUndefined();
  });

  it.each([
    ['a 403', apiError(403)],
    ['a 500', apiError(500)],
    ['a request without a response', apiError()],
    ['a non-API error', new TypeError('boom')],
  ])('rethrows %s', (_, error) => {
    expect(() => ignoreNotFound(error)).toThrow(error);
  });
});

describe('cleanUp', () => {
  it('runs every step and reports each failure other than a 404 at the end', async () => {
    const forbidden = apiError(403);
    const ran: string[] = [];
    const step = (name: string, error?: unknown) => async () => {
      ran.push(name);
      if (error) {
        throw error;
      }
    };

    const failure = await cleanUp({
      'user u1': step('user', forbidden),
      'tenant t1': step('tenant', apiError(404)),
      'role r1': step('role', new TypeError('boom')),
      'resource d1': step('resource'),
    }).catch((error: unknown) => error);

    expect(ran).toEqual(['user', 'tenant', 'role', 'resource']);
    expect(failure).toHaveProperty(
      'message',
      'cleanup failed: user u1 (HTTP 403: failed); role r1 (TypeError: boom)',
    );
    expect(failure).toHaveProperty('cause', forbidden);
  });

  it('resolves when every step succeeds or finds nothing to delete', async () => {
    await expect(
      cleanUp({
        'user u1': async () => undefined,
        'tenant t1': () => Promise.reject(apiError(404)),
      }),
    ).resolves.toBeUndefined();
  });
});

describe('expectNotFound', () => {
  it('resolves when the read fails with a 404', async () => {
    await expect(expectNotFound(Promise.reject(apiError(404)), 'user u1')).resolves.toBeUndefined();
  });

  it('rejects when the entity is still there', async () => {
    await expect(expectNotFound(Promise.resolve({ key: 'u1' }), 'user u1')).rejects.toThrow(
      'user u1 still exists',
    );
  });

  it('rejects with the original error when the read fails otherwise', async () => {
    const error = apiError(500);
    await expect(expectNotFound(Promise.reject(error), 'user u1')).rejects.toBe(error);
  });
});
