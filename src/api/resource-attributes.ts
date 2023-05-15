import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  ResourceAttributesApi as AutogenResourceAttributesApi,
  ResourceAttributeCreate,
  ResourceAttributeRead,
  ResourceAttributeUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiKeyLevel } from './context';

export interface IListAttributes extends IPagination {
  resourceKey: string;
}

export interface IResourceAttributesApi {
  list(params: IListAttributes): Promise<ResourceAttributeRead[]>;
  get(resourceKey: string, attributeKey: string): Promise<ResourceAttributeRead>;
  getByKey(resourceKey: string, attributeKey: string): Promise<ResourceAttributeRead>;
  getById(resourceId: string, attributeId: string): Promise<ResourceAttributeRead>;
  create(
    resourceKey: string,
    attributeData: ResourceAttributeCreate,
  ): Promise<ResourceAttributeRead>;
  update(
    resourceKey: string,
    attributeKey: string,
    attributeData: ResourceAttributeUpdate,
  ): Promise<ResourceAttributeRead>;
  delete(resourceKey: string, attributeKey: string): Promise<void>;
}

export class ResourceAttributesApi extends BasePermitApi implements IResourceAttributesApi {
  private attributesApi: AutogenResourceAttributesApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.attributesApi = new AutogenResourceAttributesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  public async list(params: IListAttributes): Promise<ResourceAttributeRead[]> {
    const { resourceKey, page = 1, perPage = 100 } = params;
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async get(resourceKey: string, attributeKey: string): Promise<ResourceAttributeRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async getByKey(resourceKey: string, attributeKey: string): Promise<ResourceAttributeRead> {
    return await this.get(resourceKey, attributeKey);
  }

  public async getById(resourceId: string, attributeId: string): Promise<ResourceAttributeRead> {
    return await this.get(resourceId, attributeId);
  }

  public async create(
    resourceKey: string,
    attributeData: ResourceAttributeCreate,
  ): Promise<ResourceAttributeRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async update(
    resourceKey: string,
    attributeKey: string,
    attributeData: ResourceAttributeUpdate,
  ): Promise<ResourceAttributeRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async delete(resourceKey: string, attributeKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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
