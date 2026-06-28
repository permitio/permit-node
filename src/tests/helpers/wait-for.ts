export interface WaitForOptions {
  timeoutMs?: number;
  intervalMs?: number;
  message?: string;
}

/** Polls `predicate` until it returns true or the timeout elapses; throws on timeout. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  { timeoutMs = 30_000, intervalMs = 1_000, message }: WaitForOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (;;) {
    try {
      if (await predicate()) return;
    } catch (err) {
      lastError = err;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `waitFor timed out after ${timeoutMs}ms${message ? `: ${message}` : ''}` +
          (lastError ? ` (last error: ${lastError})` : ''),
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Convenience: poll a permit.check(...) until it equals `expected`. */
export async function waitForCheck(
  check: () => Promise<boolean>,
  expected: boolean,
  options?: WaitForOptions,
): Promise<void> {
  await waitFor(async () => (await check()) === expected, {
    timeoutMs: 60_000,
    intervalMs: 1_000,
    message: `permit.check did not become ${expected}`,
    ...options,
  });
}
