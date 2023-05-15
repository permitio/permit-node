import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  ResourceActionGroupsApi as AutogenResourceActionGroupsApi,
  ResourceActionGroupCreate,
  ResourceActionGroupRead,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiKeyLevel } from './context';

export interface IListActionGroups extends IPagination {
  resourceKey: string;
}

export interface IResourceActionGroupsApi {
  list(params: IListActionGroups): Promise<ResourceActionGroupRead[]>;
  get(resourceKey: string, groupKey: string): Promise<ResourceActionGroupRead>;
  getByKey(resourceKey: string, groupKey: string): Promise<ResourceActionGroupRead>;
  getById(resourceId: string, groupId: string): Promise<ResourceActionGroupRead>;
  create(
    resourceKey: string,
    groupData: ResourceActionGroupCreate,
  ): Promise<ResourceActionGroupRead>;
  delete(resourceKey: string, groupKey: string): Promise<void>;
}

export class ResourceActionGroupsApi extends BasePermitApi implements IResourceActionGroupsApi {
  private groupsApi: AutogenResourceActionGroupsApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.groupsApi = new AutogenResourceActionGroupsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  public async list(params: IListActionGroups): Promise<ResourceActionGroupRead[]> {
    const { resourceKey, page = 1, perPage = 100 } = params;
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async get(resourceKey: string, groupKey: string): Promise<ResourceActionGroupRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async getByKey(resourceKey: string, groupKey: string): Promise<ResourceActionGroupRead> {
    return await this.get(resourceKey, groupKey);
  }

  public async getById(resourceId: string, groupId: string): Promise<ResourceActionGroupRead> {
    return await this.get(resourceId, groupId);
  }

  public async create(
    resourceKey: string,
    groupData: ResourceActionGroupCreate,
  ): Promise<ResourceActionGroupRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async delete(resourceKey: string, groupKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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
