import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  ResourceActionsApi as AutogenResourceActionsApi,
  ResourceActionCreate,
  ResourceActionRead,
  ResourceActionUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiKeyLevel } from './context';

export interface IListActions extends IPagination {
  resourceKey: string;
}

export interface IResourceActionsApi {
  list(params: IListActions): Promise<ResourceActionRead[]>;
  get(resourceKey: string, actionKey: string): Promise<ResourceActionRead>;
  getByKey(resourceKey: string, actionKey: string): Promise<ResourceActionRead>;
  getById(resourceId: string, actionId: string): Promise<ResourceActionRead>;
  create(resourceKey: string, actionData: ResourceActionCreate): Promise<ResourceActionRead>;
  update(
    resourceKey: string,
    actionKey: string,
    actionData: ResourceActionUpdate,
  ): Promise<ResourceActionRead>;
  delete(resourceKey: string, actionKey: string): Promise<void>;
}

export class ResourceActionsApi extends BasePermitApi implements IResourceActionsApi {
  private actionsApi: AutogenResourceActionsApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.actionsApi = new AutogenResourceActionsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

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

  public async getByKey(resourceKey: string, actionKey: string): Promise<ResourceActionRead> {
    return await this.get(resourceKey, actionKey);
  }

  public async getById(resourceId: string, actionId: string): Promise<ResourceActionRead> {
    return await this.get(resourceId, actionId);
  }

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
