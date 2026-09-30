import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosHeaderValue,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { type Logger } from 'pino';

import { type FactsSyncTimeoutPolicy, type IPermitConfig } from '#src/config';
import { APIKeysApi, Configuration } from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';

import {
  API_ACCESS_LEVELS,
  ApiContextLevel,
  ApiKeyLevel,
  initializeApiContext,
  PermitContextError,
} from '#src/api/context';

const REDACTED = '[REDACTED]';

// Request headers that carry no credentials. Every other request header value is redacted,
// including custom headers set on a caller-provided axiosInstance.
const SAFE_REQUEST_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'content-length',
  'content-type',
  'user-agent',
  'x-permit-sdk-version',
  'x-timeout-policy',
  'x-wait-timeout',
]);

/** Copies headers, replacing the value of every header that `keep` rejects. */
function redactHeaders(
  headers: Record<string, AxiosHeaderValue | undefined>,
  keep: (lowerCaseName: string) => boolean,
): AxiosHeaders {
  const redacted = new AxiosHeaders();
  for (const [name, value] of Object.entries(headers)) {
    redacted.set(name, keep(name.toLowerCase()) ? value : REDACTED);
  }
  return redacted;
}

function redactRequestConfig(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const { method, baseURL, url, params, data, timeout } = config;
  const headers = redactHeaders(config.headers, (name) => SAFE_REQUEST_HEADERS.has(name));
  return {
    ...(method !== undefined && { method }),
    ...(baseURL !== undefined && { baseURL }),
    ...(url !== undefined && { url }),
    params,
    data,
    ...(timeout !== undefined && { timeout }),
    headers,
  };
}

/**
 * Removes credentials from an Axios error in place, so that logging or serializing it cannot
 * leak the API key. Keeps the method, URL, params, request body, status and response body.
 * Redacts the values of request headers that are not known to be safe and of the response
 * Set-Cookie header, and drops the underlying request objects, whose raw header block contains
 * the Authorization header. Errors other than Axios errors are returned unchanged.
 *
 * @param error - The error thrown by an Axios request.
 * @returns The same error.
 */
export function redactAxiosError<E>(error: E): E {
  if (!axios.isAxiosError(error)) {
    return error;
  }
  const config = error.config && redactRequestConfig(error.config);
  if (config !== undefined) error.config = config;
  error.request = undefined;
  if (error.response) {
    error.response = {
      status: error.response.status,
      statusText: error.response.statusText,
      headers: redactHeaders(error.response.headers, (name) => name !== 'set-cookie'),
      data: error.response.data,
      config: config ?? redactRequestConfig(error.response.config),
    };
  }
  return error;
}

interface FormattedAxiosError<T> {
  code?: string | undefined;
  message: string;
  error?: T | undefined;
  status?: number | undefined;
}
export class PermitApiError<T> extends Error {
  public originalError: AxiosError<T>;

  /**
   * @param message - The error message.
   * @param originalError - The failed Axios request error. Its credentials, such as the
   * Authorization header, are removed in place before it is stored.
   */
  constructor(message: string, originalError: AxiosError<T>) {
    super(message);
    this.originalError = redactAxiosError(originalError);
  }

  public get formattedAxiosError(): FormattedAxiosError<T> {
    return {
      code: this.originalError.code,
      message: this.message,
      error: this.originalError.response?.data,
      status: this.originalError.status,
    };
  }

  /**
   * Undefined: the underlying request object is not kept, because its raw header block contains
   * the API key. `originalError.config` holds the request method and URL.
   */
  public get request(): any {
    return this.originalError.request;
  }

  public get response(): AxiosResponse<T> | undefined {
    return this.originalError.response;
  }
}

export interface IPagination {
  /**
   * the page number to fetch (default: 1)
   */
  page?: number;
  /**
   * how many items to fetch per page (default: 100)
   */
  perPage?: number;
}

export interface IBasePaginationExtended {
  /**
   * the page number to fetch (default: 1)
   */
  page?: number;
  /**
   * how many items to fetch per page (default: 100)
   */
  perPage?: number;
  /**
   * the total number of items
   */
  includeTotalCount?: boolean;
}

type IPaginationForceIncludeTotal = IBasePaginationExtended & { includeTotalCount: true };
export type IPaginationExtended = IBasePaginationExtended | IPaginationForceIncludeTotal;

export type ReturnPaginationType<
  T extends IPaginationExtended,
  Y,
  Z,
> = T extends IPaginationForceIncludeTotal ? Y : Z;

export abstract class BasePermitApi {
  protected openapiClientConfig: Configuration;
  private scopeApi: APIKeysApi;

  constructor(
    protected config: IPermitConfig,
    protected logger: Logger,
  ) {
    const version = process.env['npm_package_version'] ?? 'unknown';
    this.openapiClientConfig = new Configuration({
      basePath: `${this.config.apiUrl}`,
      accessToken: this.config.token,
      baseOptions: {
        headers: {
          'X-Permit-SDK-Version': `node:${version}`,
        },
      },
    });
    this.scopeApi = new APIKeysApi(this.openapiClientConfig, BASE_PATH, this.config.axiosInstance);
  }

  /**
   * Sets the API context and permitted access level based on the API key scope.
   */
  private async setContextFromApiKey(): Promise<void> {
    return initializeApiContext(this.config.apiContext, async () => {
      try {
        this.logger.debug('Fetching api key scope');
        const response = await this.scopeApi.getApiKeyScope();
        return response.data;
      } catch (error) {
        const cause = redactAxiosError(error);
        throw new PermitContextError(
          'Could not fetch the API key scope; retry after checking connectivity and API key access.',
          { cause },
        );
      }
    });
  }

  /**
   * Ensure that the API Key has the necessary permissions to successfully call the API endpoint.
   * Note that this check is not foolproof, and the API may still throw 401.
   * @param requiredAccessLevel The required API Key Access level for the endpoint.
   * @throws PermitContextError If the currently set API key access level does not match the required access level.
   */
  public async ensureAccessLevel(requiredAccessLevel: ApiKeyLevel): Promise<void> {
    // should only happen once in the lifetime of the SDK
    if (
      this.config.apiContext.contextLevel === ApiContextLevel.WAIT_FOR_INIT ||
      this.config.apiContext.permittedAccessLevel === ApiKeyLevel.WAIT_FOR_INIT
    ) {
      await this.setContextFromApiKey();
    }

    if (requiredAccessLevel !== this.config.apiContext.permittedAccessLevel) {
      if (
        API_ACCESS_LEVELS.indexOf(requiredAccessLevel) <
        API_ACCESS_LEVELS.indexOf(this.config.apiContext.permittedAccessLevel)
      ) {
        throw new PermitContextError(
          `You're trying to use an SDK method that requires an API Key with access level: ${requiredAccessLevel}, ` +
            `however the SDK is running with an API key with level ${this.config.apiContext.permittedAccessLevel}.`,
        );
      }
    }
  }

  /**
   * Ensure that the API context matches the required endpoint context.
   * @param requiredContext The required API context level for the endpoint.
   * @throws PermitContextError If the currently set API context level does not match the required context level.
   */
  public async ensureContext(requiredContext: ApiContextLevel): Promise<void> {
    // should only happen once in the lifetime of the SDK
    if (
      this.config.apiContext.contextLevel === ApiContextLevel.WAIT_FOR_INIT ||
      this.config.apiContext.permittedAccessLevel === ApiKeyLevel.WAIT_FOR_INIT
    ) {
      await this.setContextFromApiKey();
    }

    if (
      this.config.apiContext.contextLevel < requiredContext ||
      this.config.apiContext.contextLevel === ApiContextLevel.WAIT_FOR_INIT
    ) {
      throw new PermitContextError(
        `You're trying to use an SDK method that requires an API context of ${ApiContextLevel[requiredContext]}, ` +
          `however the SDK is running in a less specific context level: ${
            ApiContextLevel[this.config.apiContext.contextLevel]
          }.`,
      );
    }
  }

  protected handleApiError(err: unknown): never {
    if (axios.isAxiosError(err)) {
      // this is an http response with an error status code
      const logMessage = `Got error status code: ${err.response?.status}, err: ${JSON.stringify(
        err?.response?.data,
      )}`;
      const apiMessage = err.response?.data.message;
      // log this to the SDK logger
      this.logger.error(logMessage);
      // and throw a permit error exception
      throw new PermitApiError(apiMessage, err);
    } else {
      // unexpected error, just throw
      throw err;
    }
  }
}

export interface IWaitForSync {
  /**
   * Wait for the facts to be synchronized with the PDP. Available only when `proxyFactsViaPdp` is set to `true`.
   * @param timeout - The maximum number of seconds to wait for the synchronization to complete.
   * Set to null to wait indefinitely.
   * @param policy - Controls what happens when the timeout is reached during synchronization.
   * - 'ignore': Respond immediately when data update did not apply within the timeout period
   * - 'fail': Respond with 424 status code when data update did not apply within the timeout period
   */
  waitForSync(timeout: number | null, policy?: FactsSyncTimeoutPolicy): this;
}

export abstract class BaseFactsPermitAPI extends BasePermitApi implements IWaitForSync {
  constructor(
    protected override config: IPermitConfig,
    protected override logger: Logger,
  ) {
    super(config, logger);
    if (config.proxyFactsViaPdp) {
      this.openapiClientConfig = new Configuration({
        basePath: `${this.config.pdp}`,
        accessToken: this.config.token,
        baseOptions: {
          headers: {
            ...this.openapiClientConfig.baseOptions.headers,
            ...(this.config.factsSyncTimeout !== null && {
              'X-Wait-Timeout': this.config.factsSyncTimeout.toString(),
            }),
            ...(this.config.factsSyncTimeoutPolicy && {
              'X-Timeout-Policy': this.config.factsSyncTimeoutPolicy,
            }),
          },
        },
      });
    }
  }

  protected clone(): this {
    return new (this.constructor as any)(this.config, this.logger);
  }

  public waitForSync(timeout: number | null, policy?: FactsSyncTimeoutPolicy): this {
    if (this.config.proxyFactsViaPdp) {
      const clone = this.clone();
      clone.openapiClientConfig.baseOptions.headers['X-Wait-Timeout'] =
        timeout === null ? '' : timeout.toString();

      const timeoutPolicy = policy || this.config.factsSyncTimeoutPolicy;
      if (timeoutPolicy) {
        clone.openapiClientConfig.baseOptions.headers['X-Timeout-Policy'] = timeoutPolicy;
      }

      return clone;
    } else {
      this.logger.warn(
        "Attempted to wait for sync, but 'proxyFactsViaPdp' is not enabled. Ignoring.",
      );
      return this;
    }
  }
}
