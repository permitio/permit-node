import axios, { type AxiosError, type AxiosResponse } from 'axios';
import { type Logger } from 'pino';

import { type FactsSyncTimeoutPolicy, type IPermitConfig } from '#src/config';
import { APIKeysApi, Configuration } from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';

import {
  diagnosticAxiosError,
  diagnosticCause,
  diagnosticErrorSecrets,
  diagnosticMessage,
  diagnosticMetadata,
  diagnosticRequestSecrets,
  diagnosticText,
} from '#src/utils/diagnostics';

import {
  API_ACCESS_LEVELS,
  ApiContextLevel,
  ApiKeyLevel,
  initializeApiContext,
  PermitContextError,
} from '#src/api/context';

interface FormattedAxiosError {
  code?: string | undefined;
  message: string;
  error?: unknown;
  status?: number | undefined;
}
export class PermitApiError extends Error {
  public readonly originalError: AxiosError<unknown>;
  public readonly status: number | undefined;
  public readonly code: string | undefined;

  /**
   * Creates a named REST failure from a detached, bounded request-error snapshot.
   *
   * @param message - Description of the failure, sanitized against request credentials and data.
   * @param originalError - Failed Axios request. Its raw response body is not retained after redaction.
   */
  constructor(message: string, originalError: AxiosError<unknown>) {
    const snapshot = diagnosticAxiosError(originalError);
    super(diagnosticText(message || snapshot.message, diagnosticRequestSecrets(originalError)), {
      cause: diagnosticCause(snapshot),
    });
    this.name = 'PermitApiError';
    this.originalError = snapshot;
    this.status = snapshot.status;
    this.code = snapshot.code;
  }

  public get formattedAxiosError(): FormattedAxiosError {
    return {
      code: this.code,
      message: this.message,
      error: this.originalError.response?.data,
      status: this.status,
    };
  }

  /** Underlying socket/request objects are never retained on public errors. */
  public get request(): undefined {
    return undefined;
  }

  /** Bounded response diagnostics; private fields are omitted and the resulting body is unknown. */
  public get response(): AxiosResponse<unknown> | undefined {
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
        const cause = axios.isAxiosError<unknown>(error)
          ? diagnosticAxiosError(error, [this.config.token])
          : diagnosticCause(error, [this.config.token]);
        const failure = new PermitContextError(
          `Could not fetch the API key scope: ${cause.message} Check connectivity and API key access.`,
          { cause },
        );
        this.logger.error(
          { err: failure, operation: 'getApiKeyScope' },
          'permit.api.getApiKeyScope() failed',
        );
        throw failure;
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
    const privacy = diagnosticErrorSecrets(err, [this.config.token]);
    const metadata = diagnosticMetadata(err, privacy);
    const snapshot = axios.isAxiosError<unknown>(err)
      ? diagnosticAxiosError(err, [this.config.token])
      : new axios.AxiosError(diagnosticMessage(err, privacy), metadata.code);
    if (metadata.status !== undefined) snapshot.status = metadata.status;
    const failure = new PermitApiError(snapshot.message, snapshot);
    this.logger.error({ err: failure, operation: 'REST' }, 'Permit REST API request failed');
    throw failure;
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
