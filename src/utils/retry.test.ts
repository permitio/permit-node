import { AxiosError, CanceledError } from 'axios';
import { expect, test, vi } from 'vitest';

import {
  calculateRetryDelay,
  defaultRetryCondition,
  parseRetryAfter,
  resolveRetryConfig,
} from '#src/utils/retry';

for (const value of [
  null,
  true,
  [],
  1,
  'enabled',
  { enabled: null },
  { enabled: 'true' },
  { respectRetryAfter: 1 },
  { maxRetries: -1 },
  { maxRetries: 0.5 },
  { maxRetries: Number.MAX_SAFE_INTEGER + 1 },
  { maxRetries: NaN },
  { maxRetries: Infinity },
  { retryDelay: -1 },
  { retryDelay: Infinity },
  { retryDelay: 2_147_483_648 },
  { maxDelay: NaN },
  { maxDelay: -1 },
  { maxDelay: 2_147_483_648 },
  { backoffMultiplier: 0.5 },
  { backoffMultiplier: Infinity },
  { retryCondition: true },
  { retryMethods: 'GET' },
  { retryMethods: ['invalid'] },
  { retryMethods: [3] },
  { retryMethods: Array(1) },
]) {
  test(`rejects invalid JavaScript retry configuration ${JSON.stringify(value)}`, () => {
    expect(() => Reflect.apply(resolveRetryConfig, undefined, [value])).toThrow(/Invalid retry/);
  });
}

for (const code of [
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ERR_NETWORK',
]) {
  test(`classifies transient network code ${code}`, () => {
    expect(defaultRetryCondition(new AxiosError('network', code))).toBe(true);
  });
}
for (const code of [
  undefined,
  'ERR_BAD_OPTION_VALUE',
  'ERR_INVALID_URL',
  'ERR_CANCELED',
  'UNKNOWN',
  'ENOTFOUND',
]) {
  test(`does not classify missing/permanent code ${code} as transient`, () => {
    expect(defaultRetryCondition(new AxiosError('failure', code))).toBe(false);
  });
}
test('cancellation stays nonretryable without a code', () => {
  const error = new CanceledError('stop');
  delete error.code;
  expect(defaultRetryCondition(error)).toBe(false);
});

for (const header of [null, 5, ['5'], {}, '', '-1', '1.5', 'Infinity', '9'.repeat(400)]) {
  test(`ignores malformed Retry-After ${JSON.stringify(header)}`, () => {
    expect(parseRetryAfter(header)).toBeNull();
  });
}
for (const retryDelay of [0, 100]) {
  test(`bounds backoff overflow with initial delay ${retryDelay}`, () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const config = resolveRetryConfig({
        retryDelay,
        backoffMultiplier: Number.MAX_VALUE,
        maxDelay: 1000,
      });
      const delay = calculateRetryDelay(10, config);
      expect(delay).toBe(retryDelay === 0 ? 0 : 1000);
      expect(Number.isFinite(delay)).toBe(true);
    } finally {
      random.mockRestore();
    }
  });
}
