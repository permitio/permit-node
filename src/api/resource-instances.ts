import { type Logger } from 'pino';

import { type IPermitConfig } from '#src/config';
import {
  ResourceInstancesApi as AutogenResourceInstancesApi,
  Configuration,
  type ResourceInstanceCreate,
  type ResourceInstanceRead as GeneratedResourceInstanceRead,
  type PaginatedResultResourceInstanceDetailedRead as GeneratedDetailedPage,
  type ResourceInstanceDetailedRead as GeneratedResourceInstanceDetailedRead,
  type ResourceInstanceUpdate,
} from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';

import { BaseFactsPermitAPI, type IPagination, type IWaitForSync } from '#src/api/base';
import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';

export { type ResourceInstanceCreate, type ResourceInstanceUpdate } from '#src/openapi/index';

/** An instance response with an optional caller-declared attribute shape; no runtime validation. */
export interface ResourceInstanceRead<
  Attributes extends object = object,
> extends GeneratedResourceInstanceRead {
  /** Attribute values retain the caller's declared shape when present. */
  attributes?: Attributes;
}

/** A detailed instance retains its required relationships and caller-declared attributes. */
export interface ResourceInstanceDetailedRead<
  Attributes extends object = object,
> extends GeneratedResourceInstanceDetailedRead {
  /** Attribute values retain the caller's declared shape when present. */
  attributes?: Attributes;
}

/** The full detailed page with the same attribute shape on each returned instance. */
export interface PaginatedResultResourceInstanceDetailedRead<
  Attributes extends object = object,
> extends GeneratedDetailedPage {
  data: ResourceInstanceDetailedRead<Attributes>[];
}

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
  list<Attributes extends object = object>(
    params?: IListResourceInstanceParams,
  ): Promise<ResourceInstanceRead<Attributes>[]>;

  /**
   * Lists resource instances with nested details through the dedicated endpoint.
   * Uses the control plane even when facts proxying or waitForSync is enabled.
   * @param params - Filters and pagination. Pages start at 1; perPage defaults to 100.
   * @returns The complete detailed envelope, including data, total_count, and optional page_count.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the environment context or API key is insufficient.
   */
  listDetailed<Attributes extends object = object>(
    params?: IListResourceInstanceDetailedParams,
  ): Promise<PaginatedResultResourceInstanceDetailedRead<Attributes>>;

  /**
   * Retrieves a instance by its key.
   *
   * @param instanceKey The key of the resource instance.
   * @returns A promise that resolves to the resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get<Attributes extends object = object>(
    instanceKey: string,
  ): Promise<ResourceInstanceRead<Attributes>>;

  /**
   * Retrieves a instance by its key.
   * Alias for the {@link get} method.
   *
   * @param instanceKey The key of the resource instance.
   * @returns A promise that resolves to the resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey<Attributes extends object = object>(
    instanceKey: string,
  ): Promise<ResourceInstanceRead<Attributes>>;

  /**
   * Retrieves a resource instance by its ID.
   * Alias for the {@link get} method.
   *
   * @param instanceId The ID of the resource instance.
   * @returns A promise that resolves to the resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById<Attributes extends object = object>(
    instanceId: string,
  ): Promise<ResourceInstanceRead<Attributes>>;

  /**
   * Creates a new instance.
   *
   * @param instanceData The data for the new resource instance.
   * @returns A promise that resolves to the created resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create<Attributes extends object = object>(
    instanceData: ResourceInstanceCreate,
  ): Promise<ResourceInstanceRead<Attributes>>;

  /**
   * Updates a instance.
   *
   * @param instanceKey The key of the resource instance.
   * @param instanceData The updated data for the resource instance.
   * @returns A promise that resolves to the updated resource instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update<Attributes extends object = object>(
    instanceKey: string,
    instanceData: ResourceInstanceUpdate,
  ): Promise<ResourceInstanceRead<Attributes>>;

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
  public async listDetailed<Attributes extends object = object>(
    params: IListResourceInstanceDetailedParams = {},
  ): Promise<PaginatedResultResourceInstanceDetailedRead<Attributes>> {
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
      ).data as PaginatedResultResourceInstanceDetailedRead<Attributes>;
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
  public async list<Attributes extends object = object>(
    params?: IListResourceInstanceParams,
  ): Promise<ResourceInstanceRead<Attributes>[]> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      const response = (
        await this.instances.listResourceInstances({
          ...params,
          ...this.config.apiContext.environmentContext,
        })
      ).data;
      return (
        Array.isArray(response) ? response : response.data
      ) as ResourceInstanceRead<Attributes>[];
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
  public async get<Attributes extends object = object>(
    instanceKey: string,
  ): Promise<ResourceInstanceRead<Attributes>> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.instances.getResourceInstance({
          ...this.config.apiContext.environmentContext,
          instanceId: instanceKey,
        })
      ).data as ResourceInstanceRead<Attributes>;
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
  public async getByKey<Attributes extends object = object>(
    instanceKey: string,
  ): Promise<ResourceInstanceRead<Attributes>> {
    return await this.get<Attributes>(instanceKey);
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
  public async getById<Attributes extends object = object>(
    instanceId: string,
  ): Promise<ResourceInstanceRead<Attributes>> {
    return await this.get<Attributes>(instanceId);
  }

  /**
   * Creates a new instance.
   *
   * @param instanceData The data for the new instance.
   * @returns A promise that resolves to the created instance.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create<Attributes extends object = object>(
    instanceData: ResourceInstanceCreate,
  ): Promise<ResourceInstanceRead<Attributes>> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.instances.createResourceInstance({
          ...this.config.apiContext.environmentContext,
          resourceInstanceCreate: instanceData,
        })
      ).data as ResourceInstanceRead<Attributes>;
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
  public async update<Attributes extends object = object>(
    instanceKey: string,
    instanceData: ResourceInstanceUpdate,
  ): Promise<ResourceInstanceRead<Attributes>> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.instances.updateResourceInstance({
          ...this.config.apiContext.environmentContext,
          instanceId: instanceKey,
          resourceInstanceUpdate: instanceData,
        })
      ).data as ResourceInstanceRead<Attributes>;
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
