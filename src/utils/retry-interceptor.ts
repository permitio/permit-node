import { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Logger } from 'pino';

import { calculateRetryDelay, IResolvedRetryConfig } from './retry';

// String key used to track the retry count on the request config. A string
// (rather than a Symbol) is required: axios's mergeConfig — run on every
// axiosInstance.request() during a retry — only carries string-keyed
// properties, so a Symbol key would be dropped and the counter would reset to
// 0 each retry, causing an infinite retry loop.
const RETRY_COUNT_KEY = '__permitRetryCount';

/**
 * Extended request config with retry tracking
 */
interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  [RETRY_COUNT_KEY]?: number;
}

/**
 * Axios interceptor that implements retry logic with exponential backoff
 */
export class AxiosRetryInterceptor {
  /**
   * Setup retry interceptor on an axios instance
   *
   * @param axiosInstance - The axios instance to add retry capability to
   * @param config - Resolved retry configuration
   * @param logger - Logger instance for retry attempt logging
   * @param clientName - Name of the client for logging purposes (e.g., 'API', 'PDP', 'OPA')
   */
  static setupInterceptor(
    axiosInstance: AxiosInstance,
    config: IResolvedRetryConfig,
    logger: Logger,
    clientName = 'HTTP',
  ): void {
    if (!config.enabled) {
      return;
    }

    axiosInstance.interceptors.response.use(
      // Success handler - pass through unchanged
      (response) => response,

      // Error handler - implement retry logic
      async (error: AxiosError) => {
        const originalRequest = error.config as RetryableRequestConfig | undefined;

        // If no request config, cannot retry
        if (!originalRequest) {
          return Promise.reject(error);
        }

        // Initialize or get current retry count
        const currentRetryCount = originalRequest[RETRY_COUNT_KEY] ?? 0;

        // Check if we should retry this request
        const method = (originalRequest.method ?? 'GET').toUpperCase();
        const shouldRetryMethod = config.retryMethods.includes(method);
        const shouldRetryError = config.retryCondition(error);
        const hasRetriesLeft = currentRetryCount < config.maxRetries;

        // If any condition fails, reject with original error
        if (!shouldRetryMethod || !shouldRetryError || !hasRetriesLeft) {
          return Promise.reject(error);
        }

        // Increment retry count for next attempt
        originalRequest[RETRY_COUNT_KEY] = currentRetryCount + 1;

        // Calculate delay before retry
        const retryAfterHeader = error.response?.headers?.['retry-after'] as string | undefined;
        const delay = calculateRetryDelay(currentRetryCount, config, retryAfterHeader);

        // Log retry attempt
        const statusInfo = error.response?.status ?? 'network error';
        const url = originalRequest.url ?? 'unknown';
        logger.warn(
          `[${clientName}] Request failed (${statusInfo}), ` +
            `retrying in ${Math.round(delay)}ms (attempt ${currentRetryCount + 1}/${
              config.maxRetries
            }): ` +
            `${method} ${url}`,
        );

        // Wait for the calculated delay
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry the request
        return axiosInstance.request(originalRequest);
      },
    );
  }
}
