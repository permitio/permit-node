import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  TenantsApi as AutogenTenantsApi,
  PaginatedResultUserRead,
  TenantCreate,
  TenantRead,
  TenantUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiKeyLevel } from './context';

export interface IListTenantUsers extends IPagination {
  tenantKey: string;
}

export interface ITenantsApi {
  list(pagination?: IPagination): Promise<TenantRead[]>;
  listTenantUsers(params: IListTenantUsers): Promise<PaginatedResultUserRead>;
  get(tenantKey: string): Promise<TenantRead>;
  getByKey(tenantKey: string): Promise<TenantRead>;
  getById(tenantId: string): Promise<TenantRead>;
  create(tenantData: TenantCreate): Promise<TenantRead>;
  update(tenantKey: string, tenantData: TenantUpdate): Promise<TenantRead>;
  delete(tenantKey: string): Promise<void>;
}

export class TenantsApi extends BasePermitApi implements ITenantsApi {
  private tenants: AutogenTenantsApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.tenants = new AutogenTenantsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  public async list(pagination?: IPagination): Promise<TenantRead[]> {
    const { page = 1, perPage = 100 } = pagination ?? {};
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.tenants.listTenants({
          ...this.config.apiContext.environmentContext,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async listTenantUsers({
    tenantKey,
    page = 1,
    perPage = 100,
  }: IListTenantUsers): Promise<PaginatedResultUserRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.tenants.listTenantUsers({
          ...this.config.apiContext.environmentContext,
          tenantId: tenantKey,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async get(tenantKey: string): Promise<TenantRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.tenants.getTenant({
          ...this.config.apiContext.environmentContext,
          tenantId: tenantKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async getByKey(tenantKey: string): Promise<TenantRead> {
    return await this.get(tenantKey);
  }

  public async getById(tenantId: string): Promise<TenantRead> {
    return await this.get(tenantId);
  }

  public async create(tenantData: TenantCreate): Promise<TenantRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.tenants.createTenant({
          ...this.config.apiContext.environmentContext,
          tenantCreate: tenantData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async update(tenantKey: string, tenantData: TenantUpdate): Promise<TenantRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.tenants.updateTenant({
          ...this.config.apiContext.environmentContext,
          tenantId: tenantKey,
          tenantUpdate: tenantData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async delete(tenantKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      await this.tenants.deleteTenant({
        ...this.config.apiContext.environmentContext,
        tenantId: tenantKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async deleteTenantUser(tenantKey: string, userKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      await this.tenants.deleteTenantUser({
        ...this.config.apiContext.environmentContext,
        tenantId: tenantKey,
        userId: userKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
