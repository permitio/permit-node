import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  APIKeyRead,
  APIKeysApi as AutogenAPIKeysApi,
  EnvironmentsApi as AutogenEnvironmentsApi,
  EnvironmentCopy,
  EnvironmentCreate,
  EnvironmentRead,
  EnvironmentStats,
  EnvironmentUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination, PermitApiError } from './base'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ApiContext, ApiKeyLevel, PermitContextError } from './context'; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface IListEnvironments extends IPagination {
  /**
   * only environments under the project with this key will be listed.
   */
  projectKey: string;
}

export interface IEnvironmentsApi {
  /**
   * Retrieves a list of environments.
   *
   * @param params - the filters and pagination options, @see {@link IListEnvironments}
   * @returns A promise that resolves to an array of EnvironmentRead objects representing the listed environments.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(params: IListEnvironments): Promise<EnvironmentRead[]>;

  /**
   * Gets an environment by project key and environment key.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @returns A promise that resolves to an EnvironmentRead object representing the retrieved environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(projectKey: string, environmentKey: string): Promise<EnvironmentRead>;

  /**
   * Gets an environment by project key and environment key.
   * Alias for the {@link get} method.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @returns A promise that resolves to an EnvironmentRead object representing the retrieved environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(projectKey: string, environmentKey: string): Promise<EnvironmentRead>;

  /**
   * Gets an environment by project ID and environment ID.
   * Alias for the {@link get} method.
   *
   * @param projectId - The project ID.
   * @param environmentId - The environment ID.
   * @returns A promise that resolves to an EnvironmentRead object representing the retrieved environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(projectId: string, environmentId: string): Promise<EnvironmentRead>;

  /**
   * Retrieves statistics and metadata for an environment.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @returns A promise that resolves to an EnvironmentStats object representing the statistics data.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getStats(projectKey: string, environmentKey: string): Promise<EnvironmentStats>;

  /**
   * Retrieves the API key that grants access for an environment (and only the requested environment).
   * Must be requested with an organization-level api key.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @returns A promise that resolves to an APIKeyRead object containing the API key and its metadata.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getApiKey(projectKey: string, environmentKey: string): Promise<APIKeyRead>;

  /**
   * Creates a new environment.
   *
   * @param projectKey - The project key.
   * @param environmentData - The data for creating the environment.
   * @returns A promise that resolves to an EnvironmentRead object representing the created environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(projectKey: string, environmentData: EnvironmentCreate): Promise<EnvironmentRead>;

  /**
   * Updates an existing environment.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @param environmentData - The data for updating the environment.
   * @returns A promise that resolves to an EnvironmentRead object representing the updated environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(
    projectKey: string,
    environmentKey: string,
    environmentData: EnvironmentUpdate,
  ): Promise<EnvironmentRead>;

  /**
   * Clones data (creates a copy) from a source specified environment into a different target
   * environment in the same project. The target environment can be a new environment or an existing
   * environment. For existing environments, the user must specify a conflict strategy - meaning what
   * the system should do in case a copied object conflicts with an existing object (with the same key)
   * in the target environment. The system can overwrite all the conflicting objects, or fail (and
   * cancel the copy) when encountering the first conflict.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @param copyParams - The parameters for copying the environment.
   * @returns A promise that resolves to an EnvironmentRead object representing the copied environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  copy(
    projectKey: string,
    environmentKey: string,
    copyParams: EnvironmentCopy,
  ): Promise<EnvironmentRead>;

  /**
   * Deletes an environment.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @returns A promise that resolves when the environment is successfully deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(projectKey: string, environmentKey: string): Promise<void>;
}

/**
 * Represents the Environments API client.
 */
export class EnvironmentsApi extends BasePermitApi implements IEnvironmentsApi {
  private environments: AutogenEnvironmentsApi;
  private apiKeys: AutogenAPIKeysApi;

  /**
   * Creates an instance of the EnvironmentsApi.
   * @param config - The configuration object for the Permit API.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.environments = new AutogenEnvironmentsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
    this.apiKeys = new AutogenAPIKeysApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of environments.
   *
   * @param params - the filters and pagination options, @see {@link IListEnvironments}
   * @returns A promise that resolves to an array of EnvironmentRead objects representing the listed environments.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(params: IListEnvironments): Promise<EnvironmentRead[]> {
    const { projectKey, page = 1, perPage = 100 } = params;
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.environments.listEnvironments({
          projId: projectKey,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Gets an environment by project key and environment key.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @returns A promise that resolves to an EnvironmentRead object representing the retrieved environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async get(projectKey: string, environmentKey: string): Promise<EnvironmentRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.environments.getEnvironment({
          projId: projectKey,
          envId: environmentKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Gets an environment by project key and environment key.
   * Alias for the {@link get} method.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @returns A promise that resolves to an EnvironmentRead object representing the retrieved environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(projectKey: string, environmentKey: string): Promise<EnvironmentRead> {
    return await this.get(projectKey, environmentKey);
  }

  /**
   * Gets an environment by project ID and environment ID.
   * Alias for the {@link get} method.
   *
   * @param projectId - The project ID.
   * @param environmentId - The environment ID.
   * @returns A promise that resolves to an EnvironmentRead object representing the retrieved environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(projectId: string, environmentId: string): Promise<EnvironmentRead> {
    return await this.get(projectId, environmentId);
  }

  /**
   * Retrieves statistics and metadata for an environment.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @returns A promise that resolves to an EnvironmentStats object representing the statistics data.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getStats(projectKey: string, environmentKey: string): Promise<EnvironmentStats> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.environments.statsEnvironments({
          projId: projectKey,
          envId: environmentKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves the API key that grants access for an environment (and only the requested environment).
   * Must be requested with an organization-level api key.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @returns A promise that resolves to an APIKeyRead object containing the API key and its metadata.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getApiKey(projectKey: string, environmentKey: string): Promise<APIKeyRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.apiKeys.getEnvironmentApiKey({
          projId: projectKey,
          envId: environmentKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Creates a new environment.
   *
   * @param projectKey - The project key.
   * @param environmentData - The data for creating the environment.
   * @returns A promise that resolves to an EnvironmentRead object representing the created environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(
    projectKey: string,
    environmentData: EnvironmentCreate,
  ): Promise<EnvironmentRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.environments.createEnvironment({
          projId: projectKey,
          environmentCreate: environmentData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Updates an existing environment.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @param environmentData - The data for updating the environment.
   * @returns A promise that resolves to an EnvironmentRead object representing the updated environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async update(
    projectKey: string,
    environmentKey: string,
    environmentData: EnvironmentUpdate,
  ): Promise<EnvironmentRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.environments.updateEnvironment({
          projId: projectKey,
          envId: environmentKey,
          environmentUpdate: environmentData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Clones data (creates a copy) from a source specified environment into a different target
   * environment in the same project. The target environment can be a new environment or an existing
   * environment. For existing environments, the user must specify a conflict strategy - meaning what
   * the system should do in case a copied object conflicts with an existing object (with the same key)
   * in the target environment. The system can overwrite all the conflicting objects, or fail (and
   * cancel the copy) when encountering the first conflict.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @param copyParams - The parameters for copying the environment.
   * @returns A promise that resolves to an EnvironmentRead object representing the copied environment.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async copy(
    projectKey: string,
    environmentKey: string,
    copyParams: EnvironmentCopy,
  ): Promise<EnvironmentRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.environments.copyEnvironment({
          projId: projectKey,
          envId: environmentKey,
          environmentCopy: copyParams,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Deletes an environment.
   *
   * @param projectKey - The project key.
   * @param environmentKey - The environment key.
   * @returns A promise that resolves when the environment is successfully deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(projectKey: string, environmentKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      await this.environments.deleteEnvironment({
        projId: projectKey,
        envId: environmentKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
