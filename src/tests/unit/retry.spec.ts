import { AxiosError, AxiosHeaders } from 'axios';

import {
  calculateRetryDelay,
  DEFAULT_RETRY_CONFIG,
  defaultRetryCondition,
  IRetryConfig,
  parseRetryAfter,
  resolveRetryConfig,
  RETRYABLE_STATUS_CODES,
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

it('RETRYABLE_STATUS_CODES contains expected status codes', () => {
  expect(RETRYABLE_STATUS_CODES).toEqual([408, 429, 500, 502, 503, 504]);
});

// ============================================
// Tests for defaultRetryCondition
// ============================================

it('defaultRetryCondition returns true for network errors (no response)', () => {
  const error = createAxiosError();
  expect(defaultRetryCondition(error)).toBe(true);
});

it('defaultRetryCondition returns true for 408 Request Timeout', () => {
  const error = createAxiosError(408);
  expect(defaultRetryCondition(error)).toBe(true);
});

it('defaultRetryCondition returns true for 429 Too Many Requests', () => {
  const error = createAxiosError(429);
  expect(defaultRetryCondition(error)).toBe(true);
});

it('defaultRetryCondition returns true for 500 Internal Server Error', () => {
  const error = createAxiosError(500);
  expect(defaultRetryCondition(error)).toBe(true);
});

it('defaultRetryCondition returns true for 502 Bad Gateway', () => {
  const error = createAxiosError(502);
  expect(defaultRetryCondition(error)).toBe(true);
});

it('defaultRetryCondition returns true for 503 Service Unavailable', () => {
  const error = createAxiosError(503);
  expect(defaultRetryCondition(error)).toBe(true);
});

it('defaultRetryCondition returns true for 504 Gateway Timeout', () => {
  const error = createAxiosError(504);
  expect(defaultRetryCondition(error)).toBe(true);
});

it('defaultRetryCondition returns false for 400 Bad Request', () => {
  const error = createAxiosError(400);
  expect(defaultRetryCondition(error)).toBe(false);
});

it('defaultRetryCondition returns false for 401 Unauthorized', () => {
  const error = createAxiosError(401);
  expect(defaultRetryCondition(error)).toBe(false);
});

it('defaultRetryCondition returns false for 403 Forbidden', () => {
  const error = createAxiosError(403);
  expect(defaultRetryCondition(error)).toBe(false);
});

it('defaultRetryCondition returns false for 404 Not Found', () => {
  const error = createAxiosError(404);
  expect(defaultRetryCondition(error)).toBe(false);
});

it('defaultRetryCondition returns false for 422 Unprocessable Entity', () => {
  const error = createAxiosError(422);
  expect(defaultRetryCondition(error)).toBe(false);
});

it('defaultRetryCondition returns false for 200 OK', () => {
  const error = createAxiosError(200);
  expect(defaultRetryCondition(error)).toBe(false);
});

// ============================================
// Tests for parseRetryAfter
// ============================================

it('parseRetryAfter parses integer seconds correctly', () => {
  expect(parseRetryAfter('5')).toBe(5000);
  expect(parseRetryAfter('60')).toBe(60000);
  expect(parseRetryAfter('0')).toBe(0);
  expect(parseRetryAfter('120')).toBe(120000);
});

it('parseRetryAfter returns null for invalid values', () => {
  expect(parseRetryAfter('invalid')).toBe(null);
  expect(parseRetryAfter('')).toBe(null);
  expect(parseRetryAfter('abc123')).toBe(null);
});

it('parseRetryAfter returns null for non digits-only delta-seconds', () => {
  expect(parseRetryAfter('5abc')).toBe(null);
});

it('parseRetryAfter parses HTTP-date format', () => {
  const realNow = Date.now;
  try {
    const fixedNow = Date.UTC(2015, 9, 21, 7, 28, 0); // "Wed, 21 Oct 2015 07:28:00 GMT"
    Date.now = () => fixedNow;

    // 10 seconds in the future relative to the stubbed clock
    const httpDate = new Date(fixedNow + 10000).toUTCString();
    expect(parseRetryAfter(httpDate)).toBe(10000);
  } finally {
    Date.now = realNow;
  }
});

it('parseRetryAfter returns 0 for past HTTP-date', () => {
  const realNow = Date.now;
  try {
    const fixedNow = Date.UTC(2015, 9, 21, 7, 28, 0);
    Date.now = () => fixedNow;

    const httpDate = new Date(fixedNow - 10000).toUTCString();
    expect(parseRetryAfter(httpDate)).toBe(0);
  } finally {
    Date.now = realNow;
  }
});

// ============================================
// Tests for calculateRetryDelay
// ============================================

it('calculateRetryDelay calculates exponential backoff correctly', () => {
  const config = { ...DEFAULT_RETRY_CONFIG, retryDelay: 1000, backoffMultiplier: 2 };

  // First retry (attempt 0): 1000 * 2^0 = 1000ms + jitter
  const delay0 = calculateRetryDelay(0, config);
  expect(delay0 >= 1000 && delay0 <= 1100).toBe(true); // 10% jitter max

  // Second retry (attempt 1): 1000 * 2^1 = 2000ms + jitter
  const delay1 = calculateRetryDelay(1, config);
  expect(delay1 >= 2000 && delay1 <= 2200).toBe(true);

  // Third retry (attempt 2): 1000 * 2^2 = 4000ms + jitter
  const delay2 = calculateRetryDelay(2, config);
  expect(delay2 >= 4000 && delay2 <= 4400).toBe(true);
});

it('calculateRetryDelay respects maxDelay limit', () => {
  const config = {
    ...DEFAULT_RETRY_CONFIG,
    retryDelay: 1000,
    backoffMultiplier: 10,
    maxDelay: 5000,
  };

  // Even with high multiplier, should cap at maxDelay
  const delay = calculateRetryDelay(5, config);
  expect(delay <= 5000).toBe(true);
});

it('calculateRetryDelay respects Retry-After header', () => {
  const config = { ...DEFAULT_RETRY_CONFIG, respectRetryAfter: true };

  const delay = calculateRetryDelay(0, config, '3');
  expect(delay).toBe(3000);
});

it('calculateRetryDelay caps Retry-After at maxDelay', () => {
  const config = { ...DEFAULT_RETRY_CONFIG, respectRetryAfter: true, maxDelay: 5000 };

  const delay = calculateRetryDelay(0, config, '60');
  expect(delay).toBe(5000);
});

it('calculateRetryDelay ignores Retry-After when disabled', () => {
  const config = {
    ...DEFAULT_RETRY_CONFIG,
    respectRetryAfter: false,
    retryDelay: 1000,
    backoffMultiplier: 2,
  };

  const delay = calculateRetryDelay(0, config, '60');
  // Should use exponential backoff, not Retry-After
  expect(delay >= 1000 && delay <= 1100).toBe(true);
});

// ============================================
// Tests for resolveRetryConfig
// ============================================

it('resolveRetryConfig returns defaults when config is undefined', () => {
  const resolved = resolveRetryConfig(undefined);

  expect(resolved.enabled).toBe(false);
  expect(resolved.maxRetries).toBe(3);
  expect(resolved.retryDelay).toBe(1000);
  expect(resolved.backoffMultiplier).toBe(2);
  expect(resolved.maxDelay).toBe(30000);
  expect(resolved.respectRetryAfter).toBe(true);
  expect(resolved.retryMethods).toEqual(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
});

it('resolveRetryConfig opts in when a config object is provided', () => {
  const resolved = resolveRetryConfig({ maxRetries: 5 });

  expect(resolved.enabled).toBe(true);
});

it('resolveRetryConfig normalizes retry methods to uppercase', () => {
  const resolved = resolveRetryConfig({ retryMethods: ['get', 'post'] });

  expect(resolved.retryMethods).toEqual(['GET', 'POST']);
});

it('resolveRetryConfig returns a copy that does not mutate the default', () => {
  const resolved = resolveRetryConfig(undefined);
  resolved.retryMethods.push('PATCH');

  expect(DEFAULT_RETRY_CONFIG.retryMethods).toEqual(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
});

it('DEFAULT_RETRY_CONFIG.retryMethods is frozen', () => {
  expect(Object.isFrozen(DEFAULT_RETRY_CONFIG.retryMethods)).toBe(true);
});

it('RETRYABLE_STATUS_CODES is frozen', () => {
  expect(Object.isFrozen(RETRYABLE_STATUS_CODES)).toBe(true);
});

it('resolveRetryConfig returns disabled config when false', () => {
  const resolved = resolveRetryConfig(false);

  expect(resolved.enabled).toBe(false);
  // Other defaults should still be present
  expect(resolved.maxRetries).toBe(3);
});

it('resolveRetryConfig merges user config with defaults', () => {
  const userConfig: IRetryConfig = {
    maxRetries: 5,
    retryDelay: 500,
  };

  const resolved = resolveRetryConfig(userConfig);

  expect(resolved.enabled).toBe(true);
  expect(resolved.maxRetries).toBe(5); // User value
  expect(resolved.retryDelay).toBe(500); // User value
  expect(resolved.backoffMultiplier).toBe(2); // Default
  expect(resolved.maxDelay).toBe(30000); // Default
});

it('resolveRetryConfig allows custom retry condition', () => {
  const customCondition = () => false;
  const userConfig: IRetryConfig = {
    retryCondition: customCondition,
  };

  const resolved = resolveRetryConfig(userConfig);

  expect(resolved.retryCondition).toBe(customCondition);
});

it('resolveRetryConfig allows custom retry methods', () => {
  const userConfig: IRetryConfig = {
    retryMethods: ['GET', 'POST'],
  };

  const resolved = resolveRetryConfig(userConfig);

  expect(resolved.retryMethods).toEqual(['GET', 'POST']);
});

it('resolveRetryConfig allows disabling via enabled: false', () => {
  const userConfig: IRetryConfig = {
    enabled: false,
    maxRetries: 10,
  };

  const resolved = resolveRetryConfig(userConfig);

  expect(resolved.enabled).toBe(false);
  expect(resolved.maxRetries).toBe(10);
});

// ============================================
// Tests for DEFAULT_RETRY_CONFIG
// ============================================

it('DEFAULT_RETRY_CONFIG has expected default values', () => {
  expect(DEFAULT_RETRY_CONFIG.enabled).toBe(false);
  expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
  expect(DEFAULT_RETRY_CONFIG.retryDelay).toBe(1000);
  expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
  expect(DEFAULT_RETRY_CONFIG.maxDelay).toBe(30000);
  expect(DEFAULT_RETRY_CONFIG.respectRetryAfter).toBe(true);
  expect(DEFAULT_RETRY_CONFIG.retryMethods).toEqual(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
  expect(typeof DEFAULT_RETRY_CONFIG.retryCondition).toBe('function');
});

// ============================================
// Tests for exports from SDK
// ============================================

it('retry types are exported from SDK', async () => {
  const sdk = await import('../../index');

  expect(sdk.RETRYABLE_STATUS_CODES).toBeTruthy();
  expect(sdk.RETRYABLE_STATUS_CODES).toEqual([408, 429, 500, 502, 503, 504]);
});

it('Permit accepts retry configuration', async () => {
  const { Permit } = await import('../../index');

  // With retry off (opt-in default)
  const permit1 = new Permit({ token: 'test' });
  expect(permit1).toBeTruthy();

  // With custom retry config
  const permit2 = new Permit({
    token: 'test',
    retry: { maxRetries: 5 },
  });
  expect(permit2).toBeTruthy();

  // With retry disabled
  const permit3 = new Permit({
    token: 'test',
    retry: false,
  });
  expect(permit3).toBeTruthy();

  // With separate PDP retry config
  const permit4 = new Permit({
    token: 'test',
    retry: { maxRetries: 3 },
    pdpRetry: { maxRetries: 5 },
  });
  expect(permit4).toBeTruthy();
});
