import { Logger } from 'pino';

import { IPermitConfig } from '../config';
import { BASE_PATH } from '../openapi/base.js';
import {
  ResourceActionGroupsApi as AutogenResourceActionGroupsApi,
  ResourceActionGroupCreate,
  ResourceActionGroupRead,
  ResourceActionGroupUpdate,
} from '../openapi/index.js';

import { BasePermitApi, IPagination, PermitApiError } from './base.js'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ApiContext, ApiContextLevel, ApiKeyLevel, PermitContextError } from './context.js'; // eslint-disable-line @typescript-eslint/no-unused-vars

export { ResourceActionGroupCreate, ResourceActionGroupRead } from '../openapi/index.js';

export interface IListActionGroups extends IPagination {
  resourceKey: string;
}

/**
 * Interface representing the Resource Action Groups API.
 */
export interface IResourceActionGroupsApi {
  /**
   * Retrieves a list of all action groups that are defined for a given resource.
   * @param params - pagination and filtering params, @see {@link IListActionGroups}
   * @returns A promise that resolves to an array of ResourceActionGroupRead objects representing the action groups.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(params: IListActionGroups): Promise<ResourceActionGroupRead[]>;

  /**
   * Retrieves an action group based on the resource key and the group key.
   *
   * @param resourceKey - The resource key.
   * @param groupKey - The group key.
   * @returns A promise that resolves to a ResourceActionGroupRead object representing the action group.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(resourceKey: string, groupKey: string): Promise<ResourceActionGroupRead>;

  /**
   * Retrieves an action group based on the resource key and the group key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey - The resource key.
   * @param groupKey - The group key.
   * @returns A promise that resolves to a ResourceActionGroupRead object representing the action group.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(resourceKey: string, groupKey: string): Promise<ResourceActionGroupRead>;

  /**
   * Retrieves an action group based on the resource ID and the group ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId - The resource ID.
   * @param groupId - The group ID.
   * @returns A promise that resolves to a ResourceActionGroupRead object representing the action group.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(resourceId: string, groupId: string): Promise<ResourceActionGroupRead>;

  /**
   * Creates a new action group.
   * @param resourceKey - The resource key.
   * @param groupData - The action group data.
   * @returns A promise that resolves to a ResourceActionGroupRead object representing the created action group.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(
    resourceKey: string,
    groupData: ResourceActionGroupCreate,
  ): Promise<ResourceActionGroupRead>;

  /**
   * Updates an action group.
   * @param resourceKey - The resource key.
   * @param groupKey - The group key.
   * @param groupData - The action group data.
   * @returns A promise that resolves to a ResourceActionGroupRead object representing the updated action group.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(
    resourceKey: string,
    groupKey: string,
    groupData: ResourceActionGroupUpdate,
  ): Promise<ResourceActionGroupRead>;

  /**
   * Deletes a action group based on the resource key and group key.
   * @param resourceKey - The resource key.
   * @param groupKey - The group key.
   * @returns A promise that resolves when the action group is successfully deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(resourceKey: string, groupKey: string): Promise<void>;
}

/**
 * API client for interacting with the Resource Action Groups API.
 */
export class ResourceActionGroupsApi extends BasePermitApi implements IResourceActionGroupsApi {
  private groupsApi: AutogenResourceActionGroupsApi;

  /**
   * Creates an instance of the ResourceActionGroupsApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.groupsApi = new AutogenResourceActionGroupsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of all action groups that are defined for a given resource.
   * @param params - pagination and filtering params, @see {@link IListActionGroups}
   * @returns A promise that resolves to an array of ResourceActionGroupRead objects representing the action groups.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(params: IListActionGroups): Promise<ResourceActionGroupRead[]> {
    const { resourceKey, page = 1, perPage = 100 } = params;
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.groupsApi.listResourceActionGroups({
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
   * Retrieves an action group based on the resource key and the group key.
   *
   * @param resourceKey - The resource key.
   * @param groupKey - The group key.
   * @returns A promise that resolves to a ResourceActionGroupRead object representing the action group.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async get(resourceKey: string, groupKey: string): Promise<ResourceActionGroupRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.groupsApi.getResourceActionGroup({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          actionGroupId: groupKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves an action group based on the resource key and the group key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey - The resource key.
   * @param groupKey - The group key.
   * @returns A promise that resolves to a ResourceActionGroupRead object representing the action group.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(resourceKey: string, groupKey: string): Promise<ResourceActionGroupRead> {
    return await this.get(resourceKey, groupKey);
  }

  /**
   * Retrieves an action group based on the resource ID and the group ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId - The resource ID.
   * @param groupId - The group ID.
   * @returns A promise that resolves to a ResourceActionGroupRead object representing the action group.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(resourceId: string, groupId: string): Promise<ResourceActionGroupRead> {
    return await this.get(resourceId, groupId);
  }

  /**
   * Creates a new action group.
   * @param resourceKey - The resource key.
   * @param groupData - The action group data.
   * @returns A promise that resolves to a ResourceActionGroupRead object representing the created action group.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(
    resourceKey: string,
    groupData: ResourceActionGroupCreate,
  ): Promise<ResourceActionGroupRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.groupsApi.createResourceActionGroup({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          resourceActionGroupCreate: groupData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Updates an action group.
   * @param resourceKey - The resource key.
   * @param groupKey - The group key.
   * @param groupData - The action group data.
   * @returns A promise that resolves to a ResourceActionGroupRead object representing the updated action group.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async update(
    resourceKey: string,
    groupKey: string,
    groupData: ResourceActionGroupUpdate,
  ): Promise<ResourceActionGroupRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.groupsApi.updateResourceActionGroup({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          actionGroupId: groupKey,
          resourceActionGroupUpdate: groupData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Deletes a action group based on the resource key and group key.
   * @param resourceKey - The resource key.
   * @param groupKey - The group key.
   * @returns A promise that resolves when the action group is successfully deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(resourceKey: string, groupKey: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.groupsApi.deleteResourceActionGroup({
        ...this.config.apiContext.environmentContext,
        resourceId: resourceKey,
        actionGroupId: groupKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
