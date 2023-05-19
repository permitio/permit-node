import axios, { AxiosError, AxiosResponse } from 'axios';
import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import { APIKeysApi, Configuration } from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { ApiKeyLevel, PermitContextError } from './context';

export class PermitApiError<T> extends Error {
  constructor(message: string, public originalError: AxiosError<T>) {
    super(message);
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

export abstract class BasePermitApi {
  protected openapiClientConfig: Configuration;
  private scopeApi: APIKeysApi;

  constructor(protected config: IPermitConfig, protected logger: Logger) {
    this.openapiClientConfig = new Configuration({
      basePath: `${this.config.apiUrl}`,
      accessToken: this.config.token,
    });
    this.scopeApi = new APIKeysApi(this.openapiClientConfig, BASE_PATH, this.config.axiosInstance);
  }

  private async setContextFromApiKey(): Promise<void> {
    try {
      const response = await this.scopeApi.getApiKeyScope();

      if (response.data.organization_id !== undefined) {
        if (response.data.project_id !== undefined) {
          if (response.data.environment_id !== undefined) {
            // set environment level context
            this.config.apiContext.setEnvironmentLevelContext(
              response.data.organization_id,
              response.data.project_id,
              response.data.environment_id,
            );
            return;
          }

          // set project level context
          this.config.apiContext.setProjectLevelContext(
            response.data.organization_id,
            response.data.project_id,
          );
          return;
        }

        // set org level context
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

  protected async ensureContext(callLevel: ApiKeyLevel): Promise<void> {
    if (this.config.apiContext.level === ApiKeyLevel.WAIT_FOR_INIT) {
      await this.setContextFromApiKey();
    }

    if (callLevel !== this.config.apiContext.level) {
      throw new PermitContextError(
        `You're trying to use an SDK method that's requires an API Key with level: ${callLevel}, ` +
          `however the SDK is running with an API key with level ${this.config.apiContext.level}. `,
      );
    }

    // verify context matches requested call level
    if (
      callLevel === ApiKeyLevel.PROJECT_LEVEL_API_KEY &&
      this.config.apiContext.project === null
    ) {
      throw new PermitContextError(
        "You're trying to use an SDK method that's specific to a project," +
          "but you haven't set the current project in your client's context yet," +
          'or you are using an organization level API key.' +
          'Please set the context to a specific' +
          'project using `permit.set_context()` method.',
      );
    }

    if (
      callLevel == ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY &&
      this.config.apiContext.environment === null
    ) {
      throw new PermitContextError(
        "You're trying to use an SDK method that's specific to an environment," +
          "but you haven't set the current environment in your client's context yet," +
          'or you are using an organization/project level API key.' +
          'Please set the context to a specific' +
          'environment using `permit.set_context()` method.',
      );
    }
  }

  protected handleApiError(err: unknown): never {
    if (axios.isAxiosError(err)) {
      // this is an http response with an error status code
      const message = `Got error status code: ${err.response?.status}`;
      // log this to the SDK logger
      this.logger.error(`${message}, err: ${JSON.stringify(err?.response?.data)}`);
      // and throw a permit error exception
      throw new PermitApiError(message, err);
    } else {
      // unexpected error, just throw
      throw err;
    }
  }
}
