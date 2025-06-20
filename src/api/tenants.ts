import { Logger } from 'pino';

import { IPermitConfig } from '../config';
import { BASE_PATH } from '../openapi/base.js';
import {
  TenantsApi as AutogenTenantsApi,
  PaginatedResultUserRead,
  TenantCreate,
  TenantRead,
  TenantUpdate,
} from '../openapi/index.js';

import { BaseFactsPermitAPI, IPagination, IWaitForSync } from './base.js';
import { ApiContextLevel, ApiKeyLevel } from './context.js';

export {
  PaginatedResultUserRead,
  TenantCreate,
  TenantRead,
  TenantUpdate,
} from '../openapi/index.js';

export interface IListTenantUsers extends IPagination {
  tenantKey: string;
  search?: string;
  role?: string;
}

export interface IListTenantsParams extends IPagination {
  search?: string;
}

export interface ITenantsApi extends IWaitForSync {
  /**
   * Retrieves a list of tenants.
   *
   * @param params Filtering and pagination options, @see {@link IListTenantsParams}
   * @returns A promise that resolves to an array of tenants.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(params?: IListTenantsParams): Promise<TenantRead[]>;

  /**
   * Retrieves a list of users for a given tenant.
   *
   * @param params - pagination and filtering params.
   * @returns A promise that resolves to a PaginatedResultUserRead object containing the list of tenant users.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  listTenantUsers(params: IListTenantUsers): Promise<PaginatedResultUserRead>;

  /**
   * Retrieves a tenant by its key.
   *
   * @param tenantKey The key of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(tenantKey: string): Promise<TenantRead>;

  /**
   * Retrieves a tenant by its key.
   * Alias for the {@link get} method.
   *
   * @param tenantKey The key of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(tenantKey: string): Promise<TenantRead>;

  /**
   * Retrieves a tenant by its ID.
   * Alias for the {@link get} method.
   *
   * @param tenantId The ID of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(tenantId: string): Promise<TenantRead>;

  /**
   * Creates a new tenant.
   *
   * @param tenantData The data for the new tenant.
   * @returns A promise that resolves to the created tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(tenantData: TenantCreate): Promise<TenantRead>;

  /**
   * Updates a tenant.
   *
   * @param tenantKey The key of the tenant.
   * @param tenantData The updated data for the tenant.
   * @returns A promise that resolves to the updated tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(tenantKey: string, tenantData: TenantUpdate): Promise<TenantRead>;

  /**
   * Deletes a tenant.
   *
   * @param tenantKey The key of the tenant to delete.
   * @returns A promise that resolves when the tenant is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(tenantKey: string): Promise<void>;

  /**
   * Deletes a user from a given tenant (also removes all roles granted to the user in that tenant).
   *
   * @param tenantKey - The key of the tenant from which the user will be deleted.
   * @param userKey - The key of the user to be deleted.
   * @returns A promise that resolves when the user is successfully deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  deleteTenantUser(tenantKey: string, userKey: string): Promise<void>;
}

/**
 * The TenantsApi class provides methods for interacting with Permit Tenants.
 */
export class TenantsApi extends BaseFactsPermitAPI implements ITenantsApi {
  private tenants: AutogenTenantsApi;

  /**
   * Creates an instance of the TenantsApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.tenants = new AutogenTenantsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of tenants.
   *
   * @param params Filtering and pagination options, @see {@link IListTenantsParams}
   * @returns A promise that resolves to an array of tenants.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(params?: IListTenantsParams): Promise<TenantRead[]> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.tenants.listTenants({
          ...params,
          ...this.config.apiContext.environmentContext,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a list of users for a given tenant.
   *
   * @param tenantKey - The key of the tenant for which to list users.
   * @param params - pagination and filtering params.
   * @returns A promise that resolves to a PaginatedResultUserRead object containing the list of tenant users.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async listTenantUsers({
    tenantKey,
    ...params
  }: IListTenantUsers): Promise<PaginatedResultUserRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.tenants.listTenantUsers({
          ...params,
          ...this.config.apiContext.environmentContext,
          tenantId: tenantKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a tenant by its key.
   *
   * @param tenantKey The key of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async get(tenantKey: string): Promise<TenantRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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

  /**
   * Retrieves a tenant by its key.
   * Alias for the {@link get} method.
   *
   * @param tenantKey The key of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(tenantKey: string): Promise<TenantRead> {
    return await this.get(tenantKey);
  }

  /**
   * Retrieves a tenant by its ID.
   * Alias for the {@link get} method.
   *
   * @param tenantId The ID of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(tenantId: string): Promise<TenantRead> {
    return await this.get(tenantId);
  }

  /**
   * Creates a new tenant.
   *
   * @param tenantData The data for the new tenant.
   * @returns A promise that resolves to the created tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(tenantData: TenantCreate): Promise<TenantRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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

  /**
   * Updates a tenant.
   *
   * @param tenantKey The key of the tenant.
   * @param tenantData The updated data for the tenant.
   * @returns A promise that resolves to the updated tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async update(tenantKey: string, tenantData: TenantUpdate): Promise<TenantRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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

  /**
   * Deletes a tenant.
   *
   * @param tenantKey The key of the tenant to delete.
   * @returns A promise that resolves when the tenant is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(tenantKey: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.tenants.deleteTenant({
        ...this.config.apiContext.environmentContext,
        tenantId: tenantKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Deletes a user from a given tenant (also removes all roles granted to the user in that tenant).
   *
   * @param tenantKey - The key of the tenant from which the user will be deleted.
   * @param userKey - The key of the user to be deleted.
   * @returns A promise that resolves when the user is successfully deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async deleteTenantUser(tenantKey: string, userKey: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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
