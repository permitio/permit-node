import {
  PermitApiError,
  PermitConnectionError,
  PermitPDPStatusError,
  RETRYABLE_STATUS_CODES,
} from '#src/index';

export interface WaitForOptions<T> {
  /** How long to keep starting attempts, in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number | undefined;
  /** Pause between attempts, in milliseconds, cut short at the deadline. Defaults to 1 second. */
  intervalMs?: number;
  /** How long one attempt may run before it fails, in milliseconds. Defaults to 10 seconds. */
  attemptTimeoutMs?: number;
  /** What the wait is for, quoted in the timeout error. */
  message?: string;
  /** Renders the last rejected value for the timeout error. Defaults to its JSON. */
  describe?: (value: T) => string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 10_000;
const CHECK_TIMEOUT_MS = 60_000;

type Outcome<T> = { value: T } | { error: unknown };

class AttemptTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`the attempt did not settle within ${timeoutMs}ms`);
    this.name = 'AttemptTimeoutError';
  }
}

/** No status means the request got no response, such as a refused or reset connection. */
function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || RETRYABLE_STATUS_CODES.includes(status);
}

/**
 * Whether repeating the attempt can succeed: it timed out, got no response, or got a status the
 * SDK's own retries treat as temporary (408, 429 or a 5xx). Anything else, such as a 4xx, a
 * malformed PDP response or a bug in the probe, cannot change by waiting.
 */
function isTransient(error: unknown): boolean {
  if (error instanceof AttemptTimeoutError) {
    return true;
  }
  if (error instanceof PermitPDPStatusError) {
    return isRetryableStatus(error.statusCode);
  }
  if (error instanceof PermitConnectionError) {
    return true;
  }
  if (error instanceof PermitApiError) {
    return isRetryableStatus(error.response?.status);
  }
  return false;
}

async function attempt<T>(probe: () => T | Promise<T>, timeoutMs: number): Promise<Outcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AttemptTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return { value: await Promise.race([Promise.resolve().then(probe), timedOut]) };
  } catch (error) {
    return { error };
  } finally {
    clearTimeout(timer);
  }
}

function describeJson(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function timeoutError<T>(
  timeoutMs: number,
  attempts: number,
  last: Outcome<T>,
  options: WaitForOptions<T>,
): Error {
  const what = options.message ? `: ${options.message}` : '';
  const summary = `waitFor timed out after ${timeoutMs}ms and ${attempts} attempts${what}`;
  if ('error' in last) {
    return Object.assign(new Error(`${summary}; last error: ${String(last.error)}`), {
      cause: last.error,
    });
  }
  const describe = options.describe ?? describeJson;
  return new Error(`${summary}; last value: ${describe(last.value)}`);
}

/**
 * Calls `probe` until `accept` returns true for its result, and resolves with that result.
 *
 * A new attempt starts every `intervalMs` until `timeoutMs` has passed, and one more starts at the
 * deadline. An attempt that has not settled after `attemptTimeoutMs` counts as failed, so the
 * wait always settles within `timeoutMs + attemptTimeoutMs`. An attempt that throws a transient
 * error (see {@link isTransient}) is retried; any other error rejects the wait at once. The
 * timeout error reports the last result, or the last error, which it keeps as its `cause`.
 *
 * @param probe - Reads the state being waited for.
 * @param accept - Returns true once the state read by `probe` is the expected one.
 * @param options - Budgets and failure reporting, see {@link WaitForOptions}.
 * @returns The first result that `accept` accepted.
 */
export async function waitFor<T>(
  probe: () => T | Promise<T>,
  accept: (value: T) => boolean,
  options: WaitForOptions<T> = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  for (let attempts = 1; ; attempts += 1) {
    const outcome = await attempt(probe, attemptTimeoutMs);
    if ('value' in outcome && accept(outcome.value)) {
      return outcome.value;
    }
    if ('error' in outcome && !isTransient(outcome.error)) {
      throw outcome.error;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw timeoutError(timeoutMs, attempts, outcome, options);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remainingMs)));
  }
}

/**
 * Waits until `check` resolves to `expected`. The budget is 60 seconds unless `options.timeoutMs`
 * sets one.
 */
export function waitForCheck(
  check: () => Promise<boolean>,
  expected: boolean,
  options: WaitForOptions<boolean> = {},
): Promise<boolean> {
  return waitFor(check, (allowed) => allowed === expected, {
    ...options,
    timeoutMs: options.timeoutMs ?? CHECK_TIMEOUT_MS,
    message: options.message ?? `permit.check did not become ${expected}`,
  });
}
