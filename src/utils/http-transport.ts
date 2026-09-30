import axios, {
  CanceledError,
  isAxiosError,
  type AxiosDefaults,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { type Logger } from 'pino';

import {
  diagnosticRequestSecrets,
  diagnosticSecrets,
  diagnosticStatus,
  diagnosticUrl,
  recordDiagnosticSecrets,
} from '#src/utils/diagnostics';

import {
  calculateRetryDelay,
  isNonRetryableError,
  type IResolvedRetryConfig,
} from '#src/utils/retry';

interface TransportOptions {
  caller: AxiosInstance;
  logger: Logger;
  retry: IResolvedRetryConfig;
  name: string;
  defaults?: Pick<AxiosRequestConfig, 'baseURL' | 'headers'>;
}

function throwIfCancelled(config: InternalAxiosRequestConfig): void {
  config.cancelToken?.throwIfRequested();
  if (config.signal?.aborted) throw new CanceledError('Request canceled', config);
}

/** Waits between attempts, releasing both cancellation subscriptions on every completion. */
function waitForRetry(
  delay: number,
  configs: readonly InternalAxiosRequestConfig[],
): Promise<void> {
  for (const config of configs) throwIfCancelled(config);
  const signals = new Set(
    configs.map((config) => config.signal).filter((signal) => signal !== undefined),
  );
  const tokens = new Set(
    configs.map((config) => config.cancelToken).filter((token) => token !== undefined),
  );
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener?.('abort', cancel);
      for (const token of tokens) token.unsubscribe(cancel);
    };
    const cancel = () => {
      cleanup();
      const config = configs.find((entry) => entry.cancelToken?.reason || entry.signal?.aborted);
      reject(config?.cancelToken?.reason ?? new CanceledError('Request canceled', config));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
    for (const signal of signals) signal.addEventListener?.('abort', cancel);
    for (const token of tokens) token.subscribe(cancel);
    if (configs.some((config) => config.signal?.aborted || config.cancelToken?.reason)) cancel();
  });
}

async function dispatch(
  options: TransportOptions,
  config: InternalAxiosRequestConfig,
): Promise<AxiosResponse> {
  // The caller alone owns serialization, response parsing and its transport adapter.
  const {
    adapter: _adapter,
    transformRequest: _request,
    transformResponse: _response,
    ...requestConfig
  } = config;
  const forward: InternalAxiosRequestConfig = requestConfig;
  const signal = forward.signal ?? options.caller.defaults.signal;
  const cancelToken = forward.cancelToken ?? options.caller.defaults.cancelToken;
  if (signal !== undefined) forward.signal = signal;
  if (cancelToken !== undefined) forward.cancelToken = cancelToken;
  const timeout = forward.timeout ?? options.caller.defaults.timeout;
  if (
    timeout !== undefined &&
    (!Number.isFinite(timeout) || timeout < 0 || timeout > 2_147_483_647)
  ) {
    throw new TypeError('Invalid HTTP timeout: expected milliseconds between 0 and 2147483647.');
  }
  const callerSecrets = diagnosticSecrets(options.caller.defaults.headers);
  const privacy = diagnosticRequestSecrets({ config: forward }, callerSecrets);
  const requestUrl = diagnosticUrl(forward.url, privacy) ?? '';
  const started = performance.now();
  const method = (forward.method ?? 'GET').toUpperCase();
  const retry = options.retry;
  const canRetry = retry.enabled && retry.retryMethods.includes(method);
  let retries = 0;
  let cancellationConfig = forward;
  try {
    while (true) {
      throwIfCancelled(forward);
      throwIfCancelled(cancellationConfig);
      // Axios applies default Basic auth after merging headers. Keep the SDK's explicit Bearer
      // token authoritative without touching caller defaults; caller hooks may still replace transforms.
      const transforms = options.caller.defaults.transformRequest;
      forward.transformRequest = [
        ...(Array.isArray(transforms) ? transforms : transforms ? [transforms] : []),
        function clearDefaultBasicAuth(this: InternalAxiosRequestConfig, data: unknown): unknown {
          delete this.auth;
          return data;
        },
      ];
      options.logger.debug(
        { transport: options.name, method, url: requestUrl },
        `Sending HTTP request: ${method} ${requestUrl}`,
      );
      try {
        const response = await options.caller.request(forward);
        const status = diagnosticStatus(response.status);
        options.logger.debug(
          {
            transport: options.name,
            method,
            url: requestUrl,
            status,
          },
          `Received HTTP response: ${method} ${requestUrl}, status: ${status ?? 'unknown'}`,
        );
        return response;
      } catch (error) {
        throwIfCancelled(forward);
        if (isAxiosError(error) && error.config) cancellationConfig = error.config;
        throwIfCancelled(cancellationConfig);
        if (
          !canRetry ||
          retries >= retry.maxRetries ||
          !isAxiosError(error) ||
          !retry.retryMethods.includes((error.config?.method ?? method).toUpperCase()) ||
          isNonRetryableError(error)
        )
          throw error;
        const decision = retry.retryCondition(error);
        if (typeof decision !== 'boolean') {
          throw new TypeError('Invalid retry.retryCondition result: expected a boolean.', {
            cause: error,
          });
        }
        if (!decision) throw error;
        const retryAfter = Object.entries(error.response?.headers ?? {}).find(
          ([name]) => name.toLowerCase() === 'retry-after',
        )?.[1];
        const delay = calculateRetryDelay(retries, retry, retryAfter);
        if (timeout !== undefined && timeout > 0 && performance.now() - started + delay >= timeout)
          throw error;
        retries += 1;
        const status = diagnosticStatus(error.response?.status);
        options.logger.warn(
          {
            transport: options.name,
            method,
            url: requestUrl,
            retry: retries,
            status,
          },
          `[${options.name}] Request failed (${status ?? 'network error'}), ` +
            `retry ${retries}/${retry.maxRetries}: ${method} ${requestUrl}`,
        );
        await waitForRetry(delay, [forward, cancellationConfig]);
        throwIfCancelled(cancellationConfig);
        if (timeout !== undefined && timeout > 0) {
          const remaining = timeout - (performance.now() - started);
          if (remaining <= 0) throw error;
          forward.timeout = remaining;
        }
      }
    }
  } catch (error) {
    recordDiagnosticSecrets(error, privacy);
    throw error;
  }
}

/**
 * Creates a private SDK facade without registering anything on the caller's Axios instance.
 *
 * @param options - Caller transport, SDK retry/logging policy and explicit routing defaults.
 * @returns An SDK-owned instance delegating each attempt through the caller's live pipeline.
 */
export function createOwnedTransport(options: TransportOptions): AxiosInstance {
  const client = axios.create();
  const defaults: AxiosDefaults = {
    allowAbsoluteUrls: true,
    adapter: (config) => dispatch(options, config),
    transformRequest: [],
    transformResponse: [],
    headers: { common: {}, delete: {}, get: {}, head: {}, post: {}, put: {}, patch: {} },
  };
  // Axios binds request() to this original defaults object. Clear only our new facade's
  // inherited defaults so an implicit timeout:0 or transform cannot mask caller defaults.
  for (const key of Object.keys(client.defaults)) Reflect.deleteProperty(client.defaults, key);
  Object.assign(client.defaults, defaults, options.defaults);
  return client;
}
