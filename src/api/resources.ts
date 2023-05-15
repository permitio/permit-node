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
  list(pagination?: IPagination): Promise<ResourceRead[]>;
  get(resourceKey: string): Promise<ResourceRead>;
  getByKey(resourceKey: string): Promise<ResourceRead>;
  getById(resourceId: string): Promise<ResourceRead>;
  create(resourceData: ResourceCreate): Promise<ResourceRead>;
  replace(resourceKey: string, resourceData: ResourceReplace): Promise<ResourceRead>;
  update(resourceKey: string, resourceData: ResourceUpdate): Promise<ResourceRead>;
  delete(resourceKey: string): Promise<void>;
}

export class ResourcesApi extends BasePermitApi implements IResourcesApi {
  private resources: AutogenResourcesApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.resources = new AutogenResourcesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

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

  public async getByKey(resourceKey: string): Promise<ResourceRead> {
    return await this.get(resourceKey);
  }

  public async getById(resourceId: string): Promise<ResourceRead> {
    return await this.get(resourceId);
  }

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
