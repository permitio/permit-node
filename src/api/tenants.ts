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
  /**
   * Retrieves a list of tenants.
   *
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to an array of tenants.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(pagination?: IPagination): Promise<TenantRead[]>;

  /**
   * Retrieves a list of users for a given tenant.
   *
   * @param params - pagination and filtering params.
   * @returns A promise that resolves to a PaginatedResultUserRead object containing the list of tenant users.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  listTenantUsers(params: IListTenantUsers): Promise<PaginatedResultUserRead>;

  /**
   * Retrieves a tenant by its key.
   *
   * @param tenantKey The key of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(tenantKey: string): Promise<TenantRead>;

  /**
   * Retrieves a tenant by its key.
   * Alias for the {@link get} method.
   *
   * @param tenantKey The key of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(tenantKey: string): Promise<TenantRead>;

  /**
   * Retrieves a tenant by its ID.
   * Alias for the {@link get} method.
   *
   * @param tenantId The ID of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(tenantId: string): Promise<TenantRead>;

  /**
   * Creates a new tenant.
   *
   * @param tenantData The data for the new tenant.
   * @returns A promise that resolves to the created tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(tenantData: TenantCreate): Promise<TenantRead>;

  /**
   * Updates a tenant.
   *
   * @param tenantKey The key of the tenant.
   * @param tenantData The updated data for the tenant.
   * @returns A promise that resolves to the updated tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(tenantKey: string, tenantData: TenantUpdate): Promise<TenantRead>;

  /**
   * Deletes a tenant.
   *
   * @param tenantKey The key of the tenant to delete.
   * @returns A promise that resolves when the tenant is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(tenantKey: string): Promise<void>;

  /**
   * Deletes a user from a given tenant (also removes all roles granted to the user in that tenant).
   *
   * @param tenantKey - The key of the tenant from which the user will be deleted.
   * @param userKey - The key of the user to be deleted.
   * @returns A promise that resolves when the user is successfully deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  deleteTenantUser(tenantKey: string, userKey: string): Promise<void>;
}

/**
 * The TenantsApi class provides methods for interacting with Permit Tenants.
 */
export class TenantsApi extends BasePermitApi implements ITenantsApi {
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
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to an array of tenants.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Retrieves a list of users for a given tenant.
   *
   * @param params - pagination and filtering params.
   * @returns A promise that resolves to a PaginatedResultUserRead object containing the list of tenant users.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Retrieves a tenant by its key.
   *
   * @param tenantKey The key of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Retrieves a tenant by its key.
   * Alias for the {@link get} method.
   *
   * @param tenantKey The key of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
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
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(tenantId: string): Promise<TenantRead> {
    return await this.get(tenantId);
  }

  /**
   * Creates a new tenant.
   *
   * @param tenantData The data for the new tenant.
   * @returns A promise that resolves to the created tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Updates a tenant.
   *
   * @param tenantKey The key of the tenant.
   * @param tenantData The updated data for the tenant.
   * @returns A promise that resolves to the updated tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Deletes a tenant.
   *
   * @param tenantKey The key of the tenant to delete.
   * @returns A promise that resolves when the tenant is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Deletes a user from a given tenant (also removes all roles granted to the user in that tenant).
   *
   * @param tenantKey - The key of the tenant from which the user will be deleted.
   * @param userKey - The key of the user to be deleted.
   * @returns A promise that resolves when the user is successfully deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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
