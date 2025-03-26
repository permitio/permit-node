import axios, { AxiosError, AxiosResponse } from 'axios';
import { Logger } from 'pino';

import { IPermitConfig, FactsSyncTimeoutPolicy } from '../config';
import { APIKeysApi, Configuration } from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { API_ACCESS_LEVELS, ApiContextLevel, ApiKeyLevel, PermitContextError } from './context';

interface FormattedAxiosError<T> {
  code?: string;
  message: string;
  error?: T;
  status?: number;
}
export class PermitApiError<T> extends Error {
  constructor(message: string, public originalError: AxiosError<T>) {
    super(message);
  }

  public get formattedAxiosError(): FormattedAxiosError<T> {
    return {
      code: this.originalError.code,
      message: this.message,
      error: this.originalError.response?.data,
      status: this.originalError.status,
    };
  }

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

  constructor(protected config: IPermitConfig, protected logger: Logger) {
    const version = process.env.npm_package_version ?? 'unknown';
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
    try {
      this.logger.debug('Fetching api key scope');
      const response = await this.scopeApi.getApiKeyScope();

      if (response.data.organization_id !== undefined && response.data.organization_id !== null) {
        this.config.apiContext._saveApiKeyAccessibleScope(
          response.data.organization_id,
          response.data.project_id,
          response.data.environment_id,
        );

        if (response.data.project_id !== undefined && response.data.project_id !== null) {
          if (response.data.environment_id !== undefined && response.data.environment_id !== null) {
            // set environment level context
            this.logger.debug(`setting: environment-level api context`);
            this.config.apiContext.setEnvironmentLevelContext(
              response.data.organization_id,
              response.data.project_id,
              response.data.environment_id,
            );
            return;
          }

          // set project level context
          this.logger.debug(`setting: project-level api context`);
          this.config.apiContext.setProjectLevelContext(
            response.data.organization_id,
            response.data.project_id,
          );
          return;
        }

        // set org level context
        this.logger.debug(`setting: organization-level api context`);
        this.config.apiContext.setOrganizationLevelContext(response.data.organization_id);
        return;
      }

      throw new PermitContextError('could not set api context level');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.getApiKeyScope(), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw new PermitContextError(
        'could not fetch the api key scope in order to set the api context level',
      );
    }
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
  /**
   * Ignore the bulk cache and fetch facts directly from the PDP. Available only when `proxyFactsViaPdp` is set to `true`.
   * @param ignoreCache - Set to `true` to ignore the bulk cache and fetch facts directly from the PDP.
   */
  ignoreBulkCache(ignoreCache: boolean): this;
}

export abstract class BaseFactsPermitAPI extends BasePermitApi implements IWaitForSync {
  constructor(protected config: IPermitConfig, protected logger: Logger) {
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

      if (policy) {
        clone.openapiClientConfig.baseOptions.headers['X-Timeout-Policy'] = policy;
      } else if (this.config.factsSyncTimeoutPolicy) {
        clone.openapiClientConfig.baseOptions.headers['X-Timeout-Policy'] =
          this.config.factsSyncTimeoutPolicy;
      }

      return clone;
    } else {
      this.logger.warn(
        "Attempted to wait for sync, but 'proxyFactsViaPdp' is not enabled. Ignoring.",
      );
      return this;
    }
  }

  public ignoreBulkCache(ignoreCache: boolean): this {
    const clone = this.clone();
    clone.openapiClientConfig.baseOptions.headers['X-Ignore-Bulk-Cache'] = ignoreCache
      ? 'true'
      : 'false';
    return clone;
  }
}
