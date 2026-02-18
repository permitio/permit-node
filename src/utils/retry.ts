import { AxiosError } from 'axios';

/**
 * HTTP status codes that should trigger a retry
 */
export const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * HTTP status codes that should NOT trigger a retry
 */
export const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 404, 422];

/**
 * Default HTTP methods that are safe to retry
 */
export const DEFAULT_RETRY_METHODS = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'];

/**
 * Function type for custom retry condition evaluation
 */
export type RetryConditionFn = (error: AxiosError) => boolean;

/**
 * Configuration options for the retry mechanism
 */
export interface IRetryConfig {
  /**
   * Whether retry is enabled. Defaults to true.
   */
  enabled?: boolean;

  /**
   * Maximum number of retry attempts. Defaults to 3.
   */
  maxRetries?: number;

  /**
   * Initial delay between retries in milliseconds. Defaults to 1000 (1 second).
   */
  retryDelay?: number;

  /**
   * Multiplier for exponential backoff. Defaults to 2.
   * Each retry will wait: retryDelay * (backoffMultiplier ^ attemptNumber)
   */
  backoffMultiplier?: number;

  /**
   * Maximum delay between retries in milliseconds. Defaults to 30000 (30 seconds).
   * Prevents exponential backoff from growing too large.
   */
  maxDelay?: number;

  /**
   * Custom function to determine if a request should be retried.
   * If not provided, uses default retry condition (network errors + retryable status codes).
   */
  retryCondition?: RetryConditionFn;

  /**
   * Whether to respect the Retry-After header for 429 responses. Defaults to true.
   */
  respectRetryAfter?: boolean;

  /**
   * HTTP methods to retry. Defaults to ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].
   * POST is excluded by default as it may not be idempotent.
   */
  retryMethods?: string[];
}

/**
 * Resolved retry configuration with all defaults applied
 */
export interface IResolvedRetryConfig {
  enabled: boolean;
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
  retryCondition: RetryConditionFn;
  respectRetryAfter: boolean;
  retryMethods: string[];
}

/**
 * Default retry condition: retry on network errors and retryable HTTP status codes
 */
export function defaultRetryCondition(error: AxiosError): boolean {
  // Network errors (no response) - connection refused, timeout, etc.
  if (!error.response) {
    return true;
  }

  // Retryable status codes
  return RETRYABLE_STATUS_CODES.includes(error.response.status);
}

/**
 * Default retry configuration values
 */
export const DEFAULT_RETRY_CONFIG: IResolvedRetryConfig = {
  enabled: true,
  maxRetries: 3,
  retryDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
  retryCondition: defaultRetryCondition,
  respectRetryAfter: true,
  retryMethods: DEFAULT_RETRY_METHODS,
};

/**
 * Parse Retry-After header value
 * Supports both seconds (integer) and HTTP-date formats
 *
 * @param value - The Retry-After header value
 * @returns The delay in milliseconds, or null if parsing fails
 */
export function parseRetryAfter(value: string): number | null {
  // Try parsing as seconds (integer)
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP-date (e.g., "Wed, 21 Oct 2015 07:28:00 GMT")
  const date = Date.parse(value);
  if (!isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

/**
 * Calculate delay for next retry attempt using exponential backoff with jitter
 *
 * @param attemptNumber - The current retry attempt number (0-indexed)
 * @param config - The resolved retry configuration
 * @param retryAfterHeader - Optional Retry-After header value from response
 * @returns The delay in milliseconds before the next retry
 */
export function calculateRetryDelay(
  attemptNumber: number,
  config: IResolvedRetryConfig,
  retryAfterHeader?: string,
): number {
  // Respect Retry-After header if present and configured
  if (config.respectRetryAfter && retryAfterHeader) {
    const retryAfterMs = parseRetryAfter(retryAfterHeader);
    if (retryAfterMs !== null) {
      return Math.min(retryAfterMs, config.maxDelay);
    }
  }

  // Exponential backoff: delay * (multiplier ^ attempt)
  const exponentialDelay = config.retryDelay * Math.pow(config.backoffMultiplier, attemptNumber);

  // Add jitter (0-10% of the delay) to prevent thundering herd
  const jitter = Math.random() * 0.1 * exponentialDelay;

  // Apply max delay cap
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

/**
 * Resolve user-provided retry config with defaults
 *
 * @param userConfig - User-provided retry configuration or false to disable
 * @returns Resolved configuration with all defaults applied
 */
export function resolveRetryConfig(
  userConfig: IRetryConfig | false | undefined,
): IResolvedRetryConfig {
  // If explicitly disabled, return disabled config
  if (userConfig === false) {
    return {
      ...DEFAULT_RETRY_CONFIG,
      enabled: false,
    };
  }

  // If undefined or empty, use defaults
  if (!userConfig) {
    return DEFAULT_RETRY_CONFIG;
  }

  // Merge user config with defaults
  return {
    enabled: userConfig.enabled ?? DEFAULT_RETRY_CONFIG.enabled,
    maxRetries: userConfig.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
    retryDelay: userConfig.retryDelay ?? DEFAULT_RETRY_CONFIG.retryDelay,
    backoffMultiplier: userConfig.backoffMultiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier,
    maxDelay: userConfig.maxDelay ?? DEFAULT_RETRY_CONFIG.maxDelay,
    retryCondition: userConfig.retryCondition ?? DEFAULT_RETRY_CONFIG.retryCondition,
    respectRetryAfter: userConfig.respectRetryAfter ?? DEFAULT_RETRY_CONFIG.respectRetryAfter,
    retryMethods: userConfig.retryMethods ?? DEFAULT_RETRY_CONFIG.retryMethods,
  };
}
