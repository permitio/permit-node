import { Logger } from 'pino';

import { IPermitConfig } from '../config';
import {
  ResourceAttributesApi as AutogenResourceAttributesApi,
  ResourceAttributeCreate,
  ResourceAttributeRead,
  ResourceAttributeUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination, PermitApiError } from './base'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ApiContext, ApiContextLevel, ApiKeyLevel, PermitContextError } from './context'; // eslint-disable-line @typescript-eslint/no-unused-vars

export {
  ResourceAttributeCreate,
  ResourceAttributeRead,
  ResourceAttributeUpdate,
} from '../openapi';

export interface IListAttributes extends IPagination {
  resourceKey: string;
}

/**
 * Interface representing the Resource Attributes API.
 */
export interface IResourceAttributesApi {
  /**
   * Retrieves a list of all attributes that are defined for a given resource.
   * @param params - pagination and filtering params, @see {@link IListAttributes}
   * @returns A promise that resolves to an array of ResourceAttributeRead objects representing the attributes.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(params: IListAttributes): Promise<ResourceAttributeRead[]>;

  /**
   * Retrieves an attribute based on the resource key and the attribute key.
   *
   * @param resourceKey - The resource key.
   * @param attributeKey - The attribute key.
   * @returns A promise that resolves to a ResourceAttributeRead object representing the attribute.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(resourceKey: string, attributeKey: string): Promise<ResourceAttributeRead>;

  /**
   * Retrieves an attribute based on the resource key and the attribute key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey - The resource key.
   * @param attributeKey - The attribute key.
   * @returns A promise that resolves to a ResourceAttributeRead object representing the attribute.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(resourceKey: string, attributeKey: string): Promise<ResourceAttributeRead>;

  /**
   * Retrieves an attribute based on the resource ID and the attribute ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId - The resource ID.
   * @param attributeId - The attribute ID.
   * @returns A promise that resolves to a ResourceAttributeRead object representing the attribute.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(resourceId: string, attributeId: string): Promise<ResourceAttributeRead>;

  /**
   * Creates a new attribute.
   *
   * @param resourceKey - The resource key.
   * @param attributeData - The attribute data.
   * @returns A promise that resolves to a ResourceAttributeRead object representing the created attribute.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(
    resourceKey: string,
    attributeData: ResourceAttributeCreate,
  ): Promise<ResourceAttributeRead>;

  /**
   * Updates an existing environment.
   *
   * @param resourceKey - The resource key.
   * @param attributeKey - The key of the attribute to modify.
   * @param attributeData - The data for updating the attribute.
   * @returns A promise that resolves to a ResourceAttributeRead object representing the updated attribute.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(
    resourceKey: string,
    attributeKey: string,
    attributeData: ResourceAttributeUpdate,
  ): Promise<ResourceAttributeRead>;

  /**
   * Deletes a attribute based on the resource key and attribute key.
   * @param resourceKey - The resource key.
   * @param attributeKey - The attribute key.
   * @returns A promise that resolves when the attribute is successfully deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(resourceKey: string, attributeKey: string): Promise<void>;
}

/**
 * API client for interacting with the Resource Attributes API.
 */
export class ResourceAttributesApi extends BasePermitApi implements IResourceAttributesApi {
  private attributesApi: AutogenResourceAttributesApi;

  /**
   * Creates an instance of the ResourceAttributesApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.attributesApi = new AutogenResourceAttributesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of all attributes that are defined for a given resource.
   * @param params - pagination and filtering params, @see {@link IListAttributes}
   * @returns A promise that resolves to an array of ResourceAttributeRead objects representing the attributes.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(params: IListAttributes): Promise<ResourceAttributeRead[]> {
    const { resourceKey, page = 1, perPage = 100 } = params;
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.attributesApi.listResourceAttributes({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves an attribute based on the resource key and the attribute key.
   *
   * @param resourceKey - The resource key.
   * @param attributeKey - The attribute key.
   * @returns A promise that resolves to a ResourceAttributeRead object representing the attribute.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async get(resourceKey: string, attributeKey: string): Promise<ResourceAttributeRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.attributesApi.getResourceAttribute({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          attributeId: attributeKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves an attribute based on the resource key and the attribute key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey - The resource key.
   * @param attributeKey - The attribute key.
   * @returns A promise that resolves to a ResourceAttributeRead object representing the attribute.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(resourceKey: string, attributeKey: string): Promise<ResourceAttributeRead> {
    return await this.get(resourceKey, attributeKey);
  }

  /**
   * Retrieves an attribute based on the resource ID and the attribute ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId - The resource ID.
   * @param attributeId - The attribute ID.
   * @returns A promise that resolves to a ResourceAttributeRead object representing the attribute.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(resourceId: string, attributeId: string): Promise<ResourceAttributeRead> {
    return await this.get(resourceId, attributeId);
  }

  /**
   * Creates a new attribute.
   *
   * @param resourceKey - The resource key.
   * @param attributeData - The attribute data.
   * @returns A promise that resolves to a ResourceAttributeRead object representing the created attribute.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(
    resourceKey: string,
    attributeData: ResourceAttributeCreate,
  ): Promise<ResourceAttributeRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.attributesApi.createResourceAttribute({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          resourceAttributeCreate: attributeData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Updates an existing attribute.
   *
   * @param resourceKey - The resource key.
   * @param attributeKey - The key of the attribute to modify.
   * @param attributeData - The data for updating the attribute.
   * @returns A promise that resolves to a ResourceAttributeRead object representing the updated attribute.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async update(
    resourceKey: string,
    attributeKey: string,
    attributeData: ResourceAttributeUpdate,
  ): Promise<ResourceAttributeRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.attributesApi.updateResourceAttribute({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          attributeId: attributeKey,
          resourceAttributeUpdate: attributeData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Deletes a attribute based on the resource key and attribute key.
   * @param resourceKey - The resource key.
   * @param attributeKey - The attribute key.
   * @returns A promise that resolves when the attribute is successfully deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(resourceKey: string, attributeKey: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.attributesApi.deleteResourceAttribute({
        ...this.config.apiContext.environmentContext,
        resourceId: resourceKey,
        attributeId: attributeKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
