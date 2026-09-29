import { AxiosError, AxiosHeaders } from 'axios';

import { PermitApiError, PermitConnectionError, PermitPDPStatusError } from '../../index';
import { waitFor, waitForCheck } from '../helpers/wait-for';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A REST error as the SDK raises it; no status means the request got no response. */
function apiError(status?: number): PermitApiError<unknown> {
  const config = { headers: new AxiosHeaders() };
  const response =
    status === undefined ? undefined : { status, statusText: '', headers: {}, config, data: {} };
  const axiosError = new AxiosError('request failed', undefined, config, undefined, response);
  return new PermitApiError(`status ${status}`, axiosError);
}

/** Records how long, on the fake clock, the promise took to settle. */
function track(promise: Promise<unknown>): { settledAfterMs?: number } {
  const start = Date.now();
  const state: { settledAfterMs?: number } = {};
  const record = () => {
    state.settledAfterMs = Date.now() - start;
  };
  promise.then(record, record);
  return state;
}

describe('waitFor', () => {
  it('resolves with the first accepted value and stops calling the probe', async () => {
    let count = 0;
    const probe = vi.fn(() => ++count);

    const result = waitFor(probe, (value) => value === 3, { timeoutMs: 10_000, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(200);

    await expect(result).resolves.toBe(3);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it('rejects at the deadline with the message and the last value', async () => {
    let count = 0;
    const result = waitFor(
      () => ++count,
      () => false,
      {
        timeoutMs: 1_000,
        intervalMs: 100,
        message: 'the counter was never accepted',
        describe: (value) => `count=${value}`,
      },
    );
    const settled = track(result);
    const assertion = expect(result).rejects.toThrow(
      'waitFor timed out after 1000ms and 11 attempts: the counter was never accepted; ' +
        'last value: count=11',
    );

    await vi.advanceTimersByTimeAsync(1_000);

    expect(settled.settledAfterMs).toBe(1_000);
    await assertion;
  });

  it('cuts the last pause short so the final attempt starts at the deadline', async () => {
    const probe = vi.fn(() => false);

    const result = waitFor(probe, (value) => value, { timeoutMs: 2_500, intervalMs: 1_000 });
    const settled = track(result);
    const assertion = expect(result).rejects.toThrow('after 2500ms and 4 attempts');

    await vi.advanceTimersByTimeAsync(2_500);

    expect(settled.settledAfterMs).toBe(2_500);
    expect(probe).toHaveBeenCalledTimes(4);
    await assertion;
  });

  it('fails an attempt that never settles and still rejects on time', async () => {
    const probe = vi.fn(() => new Promise<boolean>(() => undefined));

    const result = waitFor(probe, (value) => value, {
      timeoutMs: 1_000,
      intervalMs: 100,
      attemptTimeoutMs: 300,
    });
    const settled = track(result);
    const assertion = expect(result).rejects.toThrow(
      'last error: AttemptTimeoutError: the attempt did not settle within 300ms',
    );

    await vi.advanceTimersByTimeAsync(1_300);

    expect(settled.settledAfterMs).toBeLessThanOrEqual(1_300);
    expect(probe.mock.calls.length).toBeGreaterThan(1);
    await assertion;
  });

  it.each([
    ['a TypeError from the probe', new TypeError('cannot read properties of undefined')],
    ['a REST 404', apiError(404)],
    ['a REST 403', apiError(403)],
    ['a PDP 400', new PermitPDPStatusError('bad request', 400)],
    ['a malformed PDP response', new PermitPDPStatusError('unexpected body', 200)],
  ])('rejects at once on %s, which waiting cannot fix', async (_, error) => {
    const probe = vi.fn((): boolean => {
      throw error;
    });

    const result = waitFor(probe, () => true, { timeoutMs: 10_000, intervalMs: 100 });
    const settled = track(result);
    await vi.advanceTimersByTimeAsync(0);

    expect(settled.settledAfterMs).toBe(0);
    await expect(result).rejects.toBe(error);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a PDP connection failure', new PermitConnectionError('connect ECONNREFUSED')],
    ['a PDP 502', new PermitPDPStatusError('bad gateway', 502)],
    ['a REST request without a response', apiError()],
    ['a REST 429', apiError(429)],
    ['a REST 503', apiError(503)],
  ])('retries after %s', async (_, error) => {
    let calls = 0;
    const probe = vi.fn(() => {
      calls += 1;
      if (calls === 1) {
        throw error;
      }
      return true;
    });

    const result = waitFor(probe, (value) => value, { timeoutMs: 10_000, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBe(true);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('reports the last outcome rather than an earlier error', async () => {
    let calls = 0;
    const probe = () => {
      calls += 1;
      if (calls === 1) {
        throw new PermitConnectionError('connect ECONNREFUSED');
      }
      return false;
    };

    const result = waitFor(probe, (value) => value, { timeoutMs: 500, intervalMs: 100 });
    const failure = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(500);

    const error = await failure;
    expect(String(error)).toMatch(/last value: false$/);
    expect(String(error)).not.toContain('ECONNREFUSED');
    expect(error).not.toHaveProperty('cause');
  });

  it('keeps the last error as the cause of the timeout', async () => {
    const connectionError = new PermitConnectionError('connect ECONNREFUSED');

    const result = waitFor(
      (): boolean => {
        throw connectionError;
      },
      () => true,
      { timeoutMs: 300, intervalMs: 100 },
    );
    const failure = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(300);

    const error = await failure;
    expect(String(error)).toContain('last error: PermitConnectionError: connect ECONNREFUSED');
    expect(error).toHaveProperty('cause', connectionError);
  });
});

describe('waitForCheck', () => {
  it('resolves once the check returns the expected decision', async () => {
    const decisions = [true, true, false];
    const check = vi.fn(async () => decisions.shift() ?? true);

    const result = waitForCheck(check, false, { intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(200);

    await expect(result).resolves.toBe(false);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('keeps its 60 second budget when timeoutMs is passed as undefined', async () => {
    const check = vi.fn(async () => false);

    const result = waitForCheck(check, true, { timeoutMs: undefined });
    const settled = track(result);
    const assertion = expect(result).rejects.toThrow(
      'waitFor timed out after 60000ms and 61 attempts: permit.check did not become true',
    );

    await vi.advanceTimersByTimeAsync(59_999);
    expect(settled.settledAfterMs).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(settled.settledAfterMs).toBe(60_000);
    await assertion;
  });
});
