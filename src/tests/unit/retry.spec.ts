import test from 'ava';
import { AxiosError, AxiosHeaders } from 'axios';

import {
  DEFAULT_RETRY_CONFIG,
  defaultRetryCondition,
  calculateRetryDelay,
  parseRetryAfter,
  resolveRetryConfig,
  RETRYABLE_STATUS_CODES,
  NON_RETRYABLE_STATUS_CODES,
  IRetryConfig,
} from '../../utils/retry';

// Helper to create mock AxiosError
function createAxiosError(status?: number): AxiosError {
  const error = new Error('Request failed') as AxiosError;
  error.isAxiosError = true;
  error.config = { headers: new AxiosHeaders() };
  error.toJSON = () => ({});

  if (status !== undefined) {
    error.response = {
      status,
      statusText: 'Error',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {},
    };
  }

  return error;
}

// ============================================
// Tests for RETRYABLE_STATUS_CODES
// ============================================

test('RETRYABLE_STATUS_CODES contains expected status codes', (t) => {
  t.deepEqual(RETRYABLE_STATUS_CODES, [408, 429, 500, 502, 503, 504]);
});

test('NON_RETRYABLE_STATUS_CODES contains expected status codes', (t) => {
  t.deepEqual(NON_RETRYABLE_STATUS_CODES, [400, 401, 403, 404, 422]);
});

// ============================================
// Tests for defaultRetryCondition
// ============================================

test('defaultRetryCondition returns true for network errors (no response)', (t) => {
  const error = createAxiosError();
  t.true(defaultRetryCondition(error));
});

test('defaultRetryCondition returns true for 408 Request Timeout', (t) => {
  const error = createAxiosError(408);
  t.true(defaultRetryCondition(error));
});

test('defaultRetryCondition returns true for 429 Too Many Requests', (t) => {
  const error = createAxiosError(429);
  t.true(defaultRetryCondition(error));
});

test('defaultRetryCondition returns true for 500 Internal Server Error', (t) => {
  const error = createAxiosError(500);
  t.true(defaultRetryCondition(error));
});

test('defaultRetryCondition returns true for 502 Bad Gateway', (t) => {
  const error = createAxiosError(502);
  t.true(defaultRetryCondition(error));
});

test('defaultRetryCondition returns true for 503 Service Unavailable', (t) => {
  const error = createAxiosError(503);
  t.true(defaultRetryCondition(error));
});

test('defaultRetryCondition returns true for 504 Gateway Timeout', (t) => {
  const error = createAxiosError(504);
  t.true(defaultRetryCondition(error));
});

test('defaultRetryCondition returns false for 400 Bad Request', (t) => {
  const error = createAxiosError(400);
  t.false(defaultRetryCondition(error));
});

test('defaultRetryCondition returns false for 401 Unauthorized', (t) => {
  const error = createAxiosError(401);
  t.false(defaultRetryCondition(error));
});

test('defaultRetryCondition returns false for 403 Forbidden', (t) => {
  const error = createAxiosError(403);
  t.false(defaultRetryCondition(error));
});

test('defaultRetryCondition returns false for 404 Not Found', (t) => {
  const error = createAxiosError(404);
  t.false(defaultRetryCondition(error));
});

test('defaultRetryCondition returns false for 422 Unprocessable Entity', (t) => {
  const error = createAxiosError(422);
  t.false(defaultRetryCondition(error));
});

test('defaultRetryCondition returns false for 200 OK', (t) => {
  const error = createAxiosError(200);
  t.false(defaultRetryCondition(error));
});

// ============================================
// Tests for parseRetryAfter
// ============================================

test('parseRetryAfter parses integer seconds correctly', (t) => {
  t.is(parseRetryAfter('5'), 5000);
  t.is(parseRetryAfter('60'), 60000);
  t.is(parseRetryAfter('0'), 0);
  t.is(parseRetryAfter('120'), 120000);
});

test('parseRetryAfter returns null for invalid values', (t) => {
  t.is(parseRetryAfter('invalid'), null);
  t.is(parseRetryAfter(''), null);
  t.is(parseRetryAfter('abc123'), null);
});

test('parseRetryAfter parses HTTP-date format', (t) => {
  // Use a future date
  const futureDate = new Date(Date.now() + 10000);
  const httpDate = futureDate.toUTCString();
  const result = parseRetryAfter(httpDate);

  t.truthy(result);
  // Should be approximately 10 seconds (10000ms), with some tolerance
  t.true(result! > 9000 && result! < 11000);
});

test('parseRetryAfter returns 0 for past HTTP-date', (t) => {
  const pastDate = new Date(Date.now() - 10000);
  const httpDate = pastDate.toUTCString();
  const result = parseRetryAfter(httpDate);

  t.is(result, 0);
});

// ============================================
// Tests for calculateRetryDelay
// ============================================

test('calculateRetryDelay calculates exponential backoff correctly', (t) => {
  const config = { ...DEFAULT_RETRY_CONFIG, retryDelay: 1000, backoffMultiplier: 2 };

  // First retry (attempt 0): 1000 * 2^0 = 1000ms + jitter
  const delay0 = calculateRetryDelay(0, config);
  t.true(delay0 >= 1000 && delay0 <= 1100); // 10% jitter max

  // Second retry (attempt 1): 1000 * 2^1 = 2000ms + jitter
  const delay1 = calculateRetryDelay(1, config);
  t.true(delay1 >= 2000 && delay1 <= 2200);

  // Third retry (attempt 2): 1000 * 2^2 = 4000ms + jitter
  const delay2 = calculateRetryDelay(2, config);
  t.true(delay2 >= 4000 && delay2 <= 4400);
});

test('calculateRetryDelay respects maxDelay limit', (t) => {
  const config = {
    ...DEFAULT_RETRY_CONFIG,
    retryDelay: 1000,
    backoffMultiplier: 10,
    maxDelay: 5000,
  };

  // Even with high multiplier, should cap at maxDelay
  const delay = calculateRetryDelay(5, config);
  t.true(delay <= 5000);
});

test('calculateRetryDelay respects Retry-After header', (t) => {
  const config = { ...DEFAULT_RETRY_CONFIG, respectRetryAfter: true };

  const delay = calculateRetryDelay(0, config, '3');
  t.is(delay, 3000);
});

test('calculateRetryDelay caps Retry-After at maxDelay', (t) => {
  const config = { ...DEFAULT_RETRY_CONFIG, respectRetryAfter: true, maxDelay: 5000 };

  const delay = calculateRetryDelay(0, config, '60');
  t.is(delay, 5000);
});

test('calculateRetryDelay ignores Retry-After when disabled', (t) => {
  const config = {
    ...DEFAULT_RETRY_CONFIG,
    respectRetryAfter: false,
    retryDelay: 1000,
    backoffMultiplier: 2,
  };

  const delay = calculateRetryDelay(0, config, '60');
  // Should use exponential backoff, not Retry-After
  t.true(delay >= 1000 && delay <= 1100);
});

// ============================================
// Tests for resolveRetryConfig
// ============================================

test('resolveRetryConfig returns defaults when config is undefined', (t) => {
  const resolved = resolveRetryConfig(undefined);

  t.true(resolved.enabled);
  t.is(resolved.maxRetries, 3);
  t.is(resolved.retryDelay, 1000);
  t.is(resolved.backoffMultiplier, 2);
  t.is(resolved.maxDelay, 30000);
  t.true(resolved.respectRetryAfter);
  t.deepEqual(resolved.retryMethods, ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
});

test('resolveRetryConfig returns disabled config when false', (t) => {
  const resolved = resolveRetryConfig(false);

  t.false(resolved.enabled);
  // Other defaults should still be present
  t.is(resolved.maxRetries, 3);
});

test('resolveRetryConfig merges user config with defaults', (t) => {
  const userConfig: IRetryConfig = {
    maxRetries: 5,
    retryDelay: 500,
  };

  const resolved = resolveRetryConfig(userConfig);

  t.true(resolved.enabled);
  t.is(resolved.maxRetries, 5); // User value
  t.is(resolved.retryDelay, 500); // User value
  t.is(resolved.backoffMultiplier, 2); // Default
  t.is(resolved.maxDelay, 30000); // Default
});

test('resolveRetryConfig allows custom retry condition', (t) => {
  const customCondition = () => false;
  const userConfig: IRetryConfig = {
    retryCondition: customCondition,
  };

  const resolved = resolveRetryConfig(userConfig);

  t.is(resolved.retryCondition, customCondition);
});

test('resolveRetryConfig allows custom retry methods', (t) => {
  const userConfig: IRetryConfig = {
    retryMethods: ['GET', 'POST'],
  };

  const resolved = resolveRetryConfig(userConfig);

  t.deepEqual(resolved.retryMethods, ['GET', 'POST']);
});

test('resolveRetryConfig allows disabling via enabled: false', (t) => {
  const userConfig: IRetryConfig = {
    enabled: false,
    maxRetries: 10,
  };

  const resolved = resolveRetryConfig(userConfig);

  t.false(resolved.enabled);
  t.is(resolved.maxRetries, 10);
});

// ============================================
// Tests for DEFAULT_RETRY_CONFIG
// ============================================

test('DEFAULT_RETRY_CONFIG has expected default values', (t) => {
  t.true(DEFAULT_RETRY_CONFIG.enabled);
  t.is(DEFAULT_RETRY_CONFIG.maxRetries, 3);
  t.is(DEFAULT_RETRY_CONFIG.retryDelay, 1000);
  t.is(DEFAULT_RETRY_CONFIG.backoffMultiplier, 2);
  t.is(DEFAULT_RETRY_CONFIG.maxDelay, 30000);
  t.true(DEFAULT_RETRY_CONFIG.respectRetryAfter);
  t.deepEqual(DEFAULT_RETRY_CONFIG.retryMethods, ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
  t.is(typeof DEFAULT_RETRY_CONFIG.retryCondition, 'function');
});

// ============================================
// Tests for exports from SDK
// ============================================

test('retry types are exported from SDK', async (t) => {
  const sdk = await import('../../index');

  t.truthy(sdk.RETRYABLE_STATUS_CODES);
  t.truthy(sdk.NON_RETRYABLE_STATUS_CODES);
  t.deepEqual(sdk.RETRYABLE_STATUS_CODES, [408, 429, 500, 502, 503, 504]);
});

test('Permit accepts retry configuration', async (t) => {
  const { Permit } = await import('../../index');

  // With retry enabled (default)
  const permit1 = new Permit({ token: 'test' });
  t.truthy(permit1);

  // With custom retry config
  const permit2 = new Permit({
    token: 'test',
    retry: { maxRetries: 5 },
  });
  t.truthy(permit2);

  // With retry disabled
  const permit3 = new Permit({
    token: 'test',
    retry: false,
  });
  t.truthy(permit3);

  // With separate PDP retry config
  const permit4 = new Permit({
    token: 'test',
    retry: { maxRetries: 3 },
    pdpRetry: { maxRetries: 5 },
  });
  t.truthy(permit4);
});
