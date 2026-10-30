import { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import pino from 'pino';

import { redactUrl } from './redact-url';

// The URL a request goes to, `baseURL` included: a relative `url` on its own isn't a URL, so
// redactUrl would cut it at its last '@' (e.g. `/users/a@example.com/x`). Built without
// `params` (`null`: `undefined` falls back to the instance's), which the line doesn't show,
// so an app's `paramsSerializer` doesn't run for it. Whatever `getUri` returns, its type
// aside, is made a string: undefined for a request with neither `url` nor `baseURL`, and a
// `url` given as a `URL` object as it is.
function requestedUrl(
  axiosInstance: AxiosInstance,
  config: InternalAxiosRequestConfig | undefined,
): string {
  if (config === undefined) {
    return '';
  }
  let uri: unknown;
  try {
    uri = axiosInstance.getUri({ ...config, params: null });
  } catch {
    uri = config.url;
  }
  return uri == null ? '' : String(uri);
}

export class AxiosLoggingInterceptor {
  static setupInterceptor(axiosInstance: AxiosInstance, logger: pino.Logger): void {
    // Add a request interceptor
    axiosInstance.interceptors.request.use(
      function (request: InternalAxiosRequestConfig) {
        request.headers = request.headers || {}; // Ensure headers are not undefined
        // Built only when it's logged, so a request at another level pays nothing for it.
        if (logger.isLevelEnabled('debug')) {
          logger.debug(
            `Sending HTTP request: ${request?.method?.toUpperCase()} ${redactUrl(
              requestedUrl(axiosInstance, request),
            )}`,
          );
        }
        return request;
      },
      function (error: any) {
        // Do something with request error
        return Promise.reject(error);
      },
    );

    // Add a response interceptor
    axiosInstance.interceptors.response.use(
      function (response: AxiosResponse<any>) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug(
            `Received HTTP response: ${response?.config?.method?.toUpperCase()} ${redactUrl(
              requestedUrl(axiosInstance, response?.config),
            )}, status: ${response?.status}`,
          );
        }
        return response;
      },
      function (error) {
        return Promise.reject(error);
      },
    );
  }
}
