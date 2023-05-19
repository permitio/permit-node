import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  ResourceActionsApi as AutogenResourceActionsApi,
  ResourceActionCreate,
  ResourceActionRead,
  ResourceActionUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination, PermitApiError } from './base'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ApiContext, ApiKeyLevel, PermitContextError } from './context'; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface IListActions extends IPagination {
  resourceKey: string;
}

/**
 * Interface representing the Resource Actions API.
 */
export interface IResourceActionsApi {
  /**
   * Retrieves a list of all actions that are defined for a given resource.
   * @param params - pagination and filtering params, @see {@link IListActions}
   * @returns A promise that resolves to an array of ResourceActionRead objects representing the actions.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(params: IListActions): Promise<ResourceActionRead[]>;

  /**
   * Retrieves an action based on the resource key and the action key.
   *
   * @param resourceKey - The resource key.
   * @param actionKey - The action key.
   * @returns A promise that resolves to a ResourceActionRead object representing the action.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(resourceKey: string, actionKey: string): Promise<ResourceActionRead>;

  /**
   * Retrieves an action based on the resource key and the action key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey - The resource key.
   * @param actionKey - The action key.
   * @returns A promise that resolves to a ResourceActionRead object representing the action.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(resourceKey: string, actionKey: string): Promise<ResourceActionRead>;

  /**
   * Retrieves an action based on the resource ID and the action ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId - The resource ID.
   * @param actionId - The action ID.
   * @returns A promise that resolves to a ResourceActionRead object representing the action.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(resourceId: string, actionId: string): Promise<ResourceActionRead>;

  /**
   * Creates a new action.
   *
   * @param resourceKey - The resource key.
   * @param actionData - The action data.
   * @returns A promise that resolves to a ResourceActionRead object representing the created action.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(resourceKey: string, actionData: ResourceActionCreate): Promise<ResourceActionRead>;

  /**
   * Updates an existing environment.
   *
   * @param resourceKey - The resource key.
   * @param actionKey - The key of the action to modify.
   * @param actionData - The data for updating the action.
   * @returns A promise that resolves to a ResourceActionRead object representing the updated action.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(
    resourceKey: string,
    actionKey: string,
    actionData: ResourceActionUpdate,
  ): Promise<ResourceActionRead>;

  /**
   * Deletes a action based on the resource key and action key.
   * @param resourceKey - The resource key.
   * @param actionKey - The action key.
   * @returns A promise that resolves when the action is successfully deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(resourceKey: string, actionKey: string): Promise<void>;
}

/**
 * API client for interacting with the Resource Actions API.
 */
export class ResourceActionsApi extends BasePermitApi implements IResourceActionsApi {
  private actionsApi: AutogenResourceActionsApi;

  /**
   * Creates an instance of the ResourceActionsApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.actionsApi = new AutogenResourceActionsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of all actions that are defined for a given resource.
   * @param params - pagination and filtering params, @see {@link IListActions}
   * @returns A promise that resolves to an array of ResourceActionRead objects representing the actions.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(params: IListActions): Promise<ResourceActionRead[]> {
    const { resourceKey, page = 1, perPage = 100 } = params;
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.actionsApi.listResourceActions({
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
   * Retrieves an action based on the resource key and the action key.
   *
   * @param resourceKey - The resource key.
   * @param actionKey - The action key.
   * @returns A promise that resolves to a ResourceActionRead object representing the action.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async get(resourceKey: string, actionKey: string): Promise<ResourceActionRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.actionsApi.getResourceAction({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          actionId: actionKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves an action based on the resource key and the action key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey - The resource key.
   * @param actionKey - The action key.
   * @returns A promise that resolves to a ResourceActionRead object representing the action.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(resourceKey: string, actionKey: string): Promise<ResourceActionRead> {
    return await this.get(resourceKey, actionKey);
  }

  /**
   * Retrieves an action based on the resource ID and the action ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId - The resource ID.
   * @param actionId - The action ID.
   * @returns A promise that resolves to a ResourceActionRead object representing the action.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(resourceId: string, actionId: string): Promise<ResourceActionRead> {
    return await this.get(resourceId, actionId);
  }

  /**
   * Creates a new action.
   *
   * @param resourceKey - The resource key.
   * @param actionData - The action data.
   * @returns A promise that resolves to a ResourceActionRead object representing the created action.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(
    resourceKey: string,
    actionData: ResourceActionCreate,
  ): Promise<ResourceActionRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.actionsApi.createResourceAction({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          resourceActionCreate: actionData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Updates an existing environment.
   *
   * @param resourceKey - The resource key.
   * @param actionKey - The key of the action to modify.
   * @param actionData - The data for updating the action.
   * @returns A promise that resolves to a ResourceActionRead object representing the updated action.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async update(
    resourceKey: string,
    actionKey: string,
    actionData: ResourceActionUpdate,
  ): Promise<ResourceActionRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.actionsApi.updateResourceAction({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          actionId: actionKey,
          resourceActionUpdate: actionData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Deletes a action based on the resource key and action key.
   * @param resourceKey - The resource key.
   * @param actionKey - The action key.
   * @returns A promise that resolves when the action is successfully deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(resourceKey: string, actionKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      await this.actionsApi.deleteResourceAction({
        ...this.config.apiContext.environmentContext,
        resourceId: resourceKey,
        actionId: actionKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
