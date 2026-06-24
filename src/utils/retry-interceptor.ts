import { AxiosError, AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { Logger } from 'pino';

import { calculateRetryDelay, IResolvedRetryConfig } from './retry';

/**
 * Installs retry behavior on an axios instance using the axios-retry library,
 * driven by our resolved retry configuration (delay/condition policy).
 */
export class AxiosRetryInterceptor {
  /**
   * Setup retry on an axios instance.
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

    axiosRetry(axiosInstance, {
      retries: config.maxRetries,
      shouldResetTimeout: true,

      // Preserve our policy: per-instance method filtering (REST excludes POST,
      // PDP includes it) plus our error condition (network + retryable status).
      retryCondition: (error: AxiosError): boolean => {
        const method = (error.config?.method ?? 'GET').toUpperCase();
        if (!config.retryMethods.includes(method)) {
          return false;
        }
        return config.retryCondition(error);
      },

      // axios-retry's retryCount is 1-based (1 on the first retry); our
      // calculateRetryDelay expects a 0-based attempt number, so subtract one.
      retryDelay: (retryCount: number, error: AxiosError): number => {
        const retryAfterHeader = error.response?.headers?.['retry-after'] as string | undefined;
        return calculateRetryDelay(retryCount - 1, config, retryAfterHeader);
      },

      onRetry: (retryCount: number, error: AxiosError): void => {
        const status = error.response?.status ?? 'network error';
        const method = (error.config?.method ?? 'GET').toUpperCase();
        const url = error.config?.url ?? 'unknown';
        logger.warn(
          `[${clientName}] Request failed (${status}), ` +
            `retry ${retryCount}/${config.maxRetries}: ${method} ${url}`,
        );
      },
    });
  }
}
