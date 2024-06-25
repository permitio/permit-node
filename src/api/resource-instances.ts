import { Logger } from 'pino';

import { IPermitConfig } from '../config';
import {
  ResourceInstancesApi as AutogenResourceInstancesApi,
  ResourceInstanceCreate,
  ResourceInstanceRead,
  ResourceInstanceUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BaseFactsPermitAPI, IPagination, IWaitForSync } from './base';
import { ApiContextLevel, ApiKeyLevel } from './context';

export { ResourceInstanceCreate, ResourceInstanceRead, ResourceInstanceUpdate } from '../openapi';

export interface IListResourceInstanceUsers extends IPagination {
  instanceKey: string;
}

export interface IListResourceInstanceParams extends IPagination {
  tenant?: string;
  resource?: string;
}

export interface IResourceInstancesApi extends IWaitForSync {
  /**
   * Retrieves a list of resource instances.
   *
   * @param params Filtering and pagination options, @see {@link IListResourceInstanceParams}
   * @returns A promise that resolves to an array of resource instances.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(params?: IListResourceInstanceParams): Promise<ResourceInstanceRead[]>;

  /**
   * Retrieves a instance by its key.
   *
   * @param instanceKey The key of the resource instance.
   * @returns A promise that resolves to the resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(instanceKey: string): Promise<ResourceInstanceRead>;

  /**
   * Retrieves a instance by its key.
   * Alias for the {@link get} method.
   *
   * @param instanceKey The key of the resource instance.
   * @returns A promise that resolves to the resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(instanceKey: string): Promise<ResourceInstanceRead>;

  /**
   * Retrieves a resource instance by its ID.
   * Alias for the {@link get} method.
   *
   * @param instanceId The ID of the resource instance.
   * @returns A promise that resolves to the resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(instanceId: string): Promise<ResourceInstanceRead>;

  /**
   * Creates a new instance.
   *
   * @param instanceData The data for the new resource instance.
   * @returns A promise that resolves to the created resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(instanceData: ResourceInstanceCreate): Promise<ResourceInstanceRead>;

  /**
   * Updates a instance.
   *
   * @param instanceKey The key of the resource instance.
   * @param instanceData The updated data for the resource instance.
   * @returns A promise that resolves to the updated resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(instanceKey: string, instanceData: ResourceInstanceUpdate): Promise<ResourceInstanceRead>;

  /**
   * Deletes a instance.
   *
   * @param instanceKey The key of the resource instance to delete.
   * @returns A promise that resolves when the resource instance is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(instanceKey: string): Promise<void>;
}

/**
 * The ResourceInstancesApi class provides methods for interacting with Permit ResourceInstances.
 */
export class ResourceInstancesApi extends BaseFactsPermitAPI implements IResourceInstancesApi {
  private instances: AutogenResourceInstancesApi;

  /**
   * Creates an instance of the ResourceInstancesApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.instances = new AutogenResourceInstancesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of resource instances.
   *
   * @param params Filtering and pagination options, @see {@link IListResourceInstanceParams}
   * @returns A promise that resolves to an array of resource instances.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(params?: IListResourceInstanceParams): Promise<ResourceInstanceRead[]> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.instances.listResourceInstances({
          ...params,
          ...this.config.apiContext.environmentContext,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a instance by its key.
   *
   * @param instanceKey The key of the resource instance.
   * @returns A promise that resolves to the resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async get(instanceKey: string): Promise<ResourceInstanceRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.instances.getResourceInstance({
          ...this.config.apiContext.environmentContext,
          instanceId: instanceKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a instance by its key.
   * Alias for the {@link get} method.
   *
   * @param instanceKey The key of the resource instance.
   * @returns A promise that resolves to the resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(instanceKey: string): Promise<ResourceInstanceRead> {
    return await this.get(instanceKey);
  }

  /**
   * Retrieves a instance by its ID.
   * Alias for the {@link get} method.
   *
   * @param instanceId The ID of the resource instance.
   * @returns A promise that resolves to the resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(instanceId: string): Promise<ResourceInstanceRead> {
    return await this.get(instanceId);
  }

  /**
   * Creates a new instance.
   *
   * @param instanceData The data for the new instance.
   * @returns A promise that resolves to the created instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(instanceData: ResourceInstanceCreate): Promise<ResourceInstanceRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.instances.createResourceInstance({
          ...this.config.apiContext.environmentContext,
          resourceInstanceCreate: instanceData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Updates a instance.
   *
   * @param instanceKey The key of the resource instance.
   * @param instanceData The updated data for the resource instance.
   * @returns A promise that resolves to the updated instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async update(
    instanceKey: string,
    instanceData: ResourceInstanceUpdate,
  ): Promise<ResourceInstanceRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.instances.updateResourceInstance({
          ...this.config.apiContext.environmentContext,
          instanceId: instanceKey,
          resourceInstanceUpdate: instanceData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Deletes a instance.
   *
   * @param instanceKey The key of the resource instance to delete.
   * @returns A promise that resolves when the resource instance is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(instanceKey: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.instances.deleteResourceInstance({
        ...this.config.apiContext.environmentContext,
        instanceId: instanceKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
