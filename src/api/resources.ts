import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  ResourcesApi as AutogenResourcesApi,
  ResourceCreate,
  ResourceRead,
  ResourceReplace,
  ResourceUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiKeyLevel } from './context';

export interface IListResourceUsers extends IPagination {
  resourceKey: string;
}

export interface IResourcesApi {
  /**
   * Retrieves a list of resources.
   *
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to an array of resources.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(pagination?: IPagination): Promise<ResourceRead[]>;

  /**
   * Retrieves a resource by its key.
   *
   * @param resourceKey The key of the resource.
   * @returns A promise that resolves to the resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(resourceKey: string): Promise<ResourceRead>;

  /**
   * Retrieves a resource by its key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey The key of the resource.
   * @returns A promise that resolves to the resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(resourceKey: string): Promise<ResourceRead>;

  /**
   * Retrieves a resource by its ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId The ID of the resource.
   * @returns A promise that resolves to the resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(resourceId: string): Promise<ResourceRead>;

  /**
   * Creates a new resource.
   *
   * @param resourceData The data for the new resource.
   * @returns A promise that resolves to the created resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(resourceData: ResourceCreate): Promise<ResourceRead>;

  /**
   * Creates a resource if such a resource does not exists, otherwise completely replaces the resource configuration.
   *
   * @param resourceKey The key of the resource.
   * @param resourceData The updated data for the resource.
   * @returns A promise that resolves to the updated resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  replace(resourceKey: string, resourceData: ResourceReplace): Promise<ResourceRead>;

  /**
   * Updates a resource.
   *
   * @param resourceKey The key of the resource.
   * @param resourceData The updated data for the resource.
   * @returns A promise that resolves to the updated resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(resourceKey: string, resourceData: ResourceUpdate): Promise<ResourceRead>;

  /**
   * Deletes a resource.
   *
   * @param resourceKey The key of the resource to delete.
   * @returns A promise that resolves when the resource is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(resourceKey: string): Promise<void>;
}

/**
 * The ResourcesApi class provides methods for interacting with Permit Resources.
 */
export class ResourcesApi extends BasePermitApi implements IResourcesApi {
  private resources: AutogenResourcesApi;

  /**
   * Creates an instance of the ResourcesApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.resources = new AutogenResourcesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of resources.
   *
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to an array of resources.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(pagination?: IPagination): Promise<ResourceRead[]> {
    const { page = 1, perPage = 100 } = pagination ?? {};
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.resources.listResources({
          ...this.config.apiContext.environmentContext,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a resource by its key.
   *
   * @param resourceKey The key of the resource.
   * @returns A promise that resolves to the resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async get(resourceKey: string): Promise<ResourceRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.resources.getResource({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a resource by its key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey The key of the resource.
   * @returns A promise that resolves to the resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(resourceKey: string): Promise<ResourceRead> {
    return await this.get(resourceKey);
  }

  /**
   * Retrieves a resource by its ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId The ID of the resource.
   * @returns A promise that resolves to the resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(resourceId: string): Promise<ResourceRead> {
    return await this.get(resourceId);
  }

  /**
   * Creates a new resource.
   *
   * @param resourceData The data for the new resource.
   * @returns A promise that resolves to the created resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(resourceData: ResourceCreate): Promise<ResourceRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.resources.createResource({
          ...this.config.apiContext.environmentContext,
          resourceCreate: resourceData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Creates a resource if such a resource does not exists, otherwise completely replaces the resource configuration.
   *
   * @param resourceKey The key of the resource.
   * @param resourceData The updated data for the resource.
   * @returns A promise that resolves to the updated resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async replace(resourceKey: string, resourceData: ResourceReplace): Promise<ResourceRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.resources.replaceResource({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          resourceReplace: resourceData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Updates a resource.
   *
   * @param resourceKey The key of the resource.
   * @param resourceData The updated data for the resource.
   * @returns A promise that resolves to the updated resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async update(resourceKey: string, resourceData: ResourceUpdate): Promise<ResourceRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.resources.updateResource({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          resourceUpdate: resourceData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Deletes a resource.
   *
   * @param resourceKey The key of the resource to delete.
   * @returns A promise that resolves when the resource is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(resourceKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      await this.resources.deleteResource({
        ...this.config.apiContext.environmentContext,
        resourceId: resourceKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
