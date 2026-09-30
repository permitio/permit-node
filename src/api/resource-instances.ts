import { type Logger } from 'pino';

import { type IPermitConfig } from '#src/config';
import {
  ResourceInstancesApi as AutogenResourceInstancesApi,
  Configuration,
  type ResourceInstanceCreate,
  type ResourceInstanceRead,
  type PaginatedResultResourceInstanceDetailedRead,
  type ResourceInstanceUpdate,
} from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';

import { BaseFactsPermitAPI, type IPagination, type IWaitForSync } from '#src/api/base';
import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';

export {
  type ResourceInstanceCreate,
  type ResourceInstanceRead,
  type ResourceInstanceDetailedRead,
  type PaginatedResultResourceInstanceDetailedRead,
  type ResourceInstanceUpdate,
} from '#src/openapi/index';

export interface IListResourceInstanceUsers extends IPagination {
  instanceKey: string;
}

export interface IListResourceInstanceParams extends IPagination {
  tenant?: string;
  resource?: string;
}

/** Filters for the dedicated resource-instance detailed list. */
export interface IListResourceInstanceDetailedParams extends IListResourceInstanceParams {
  /** Search terms to match against the instance key. */
  search?: string[];
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
   * Lists resource instances with nested details through the dedicated endpoint.
   * Uses the control plane even when facts proxying or waitForSync is enabled.
   * @param params - Filters and pagination. Pages start at 1; perPage defaults to 100.
   * @returns The complete detailed envelope, including data, total_count, and optional page_count.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the environment context or API key is insufficient.
   */
  listDetailed(
    params?: IListResourceInstanceDetailedParams,
  ): Promise<PaginatedResultResourceInstanceDetailedRead>;

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
  private detailedInstances: AutogenResourceInstancesApi;

  /**
   * Creates an instance of the ResourceInstancesApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.detailedInstances = new AutogenResourceInstancesApi(
      new Configuration({
        basePath: this.config.apiUrl,
        accessToken: this.config.token,
        baseOptions: {
          headers: {
            'X-Permit-SDK-Version':
              this.openapiClientConfig.baseOptions.headers['X-Permit-SDK-Version'],
          },
        },
      }),
      BASE_PATH,
      this.config.axiosInstance,
    );
    this.instances = new AutogenResourceInstancesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Lists resource instances with nested details through the dedicated endpoint.
   * Uses the control plane even when facts proxying or waitForSync is enabled.
   * @param params - Filters and pagination. Pages start at 1; perPage defaults to 100.
   * @returns The complete detailed envelope, including data, total_count, and optional page_count.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the environment context or API key is insufficient.
   */
  public async listDetailed(
    params: IListResourceInstanceDetailedParams = {},
  ): Promise<PaginatedResultResourceInstanceDetailedRead> {
    const { page = 1, perPage = 100, ...filters } = params;
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.detailedInstances.listResourceInstancesDetailed({
          ...filters,
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
      const response = (
        await this.instances.listResourceInstances({
          ...params,
          ...this.config.apiContext.environmentContext,
        })
      ).data;
      return Array.isArray(response) ? response : response.data;
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
