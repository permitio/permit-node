import { type Logger } from 'pino';

import { type IPermitConfig } from '#src/config';
import {
  TenantsApi as AutogenTenantsApi,
  Configuration,
  type UserCreate,
  type TenantCreate,
  type TenantRead as GeneratedTenantRead,
  type PaginatedResultTenantRead as GeneratedPaginatedResultTenantRead,
  type TenantUpdate,
} from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';
import type { UserRead, PaginatedResultUserRead } from '#src/api/users';

import { BaseFactsPermitAPI, type IPagination, type IWaitForSync } from '#src/api/base';
import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';

export { type TenantCreate, type TenantUpdate } from '#src/openapi/index';

export type { PaginatedResultUserRead } from '#src/api/users';

/** A tenant response with an optional caller-declared attribute shape; no runtime validation. */
export interface TenantRead<Attributes extends object = object> extends GeneratedTenantRead {
  /** Attribute values retain the caller's declared shape when present. */
  attributes?: Attributes;
}

/** The full tenant page with the selected attribute shape on every returned tenant. */
export interface PaginatedResultTenantRead<
  Attributes extends object = object,
> extends GeneratedPaginatedResultTenantRead {
  data: TenantRead<Attributes>[];
}

export interface IListTenantUsers extends IPagination {
  tenantKey: string;
  search?: string;
  role?: string;
}

export interface IListTenantsParams extends IPagination {
  search?: string;
  /**
   * Returns the full page with total_count when true; otherwise returns tenant rows.
   * Omission preserves the API's false default and the SDK's array result.
   */
  includeTotalCount?: boolean;
}

export interface ITenantsApi extends IWaitForSync {
  /**
   * Retrieves a list of tenants.
   *
   * @param params Filtering and pagination options, @see {@link IListTenantsParams}
   * @returns Tenant rows by default, or the complete page when includeTotalCount is true.
   * Dynamic or optional boolean flags retain the union of both result shapes.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list<Attributes extends object = object>(
    params: IListTenantsParams & { includeTotalCount: true },
  ): Promise<PaginatedResultTenantRead<Attributes>>;
  list<Attributes extends object = object>(
    params?: IListTenantsParams & { includeTotalCount?: false },
  ): Promise<TenantRead<Attributes>[]>;
  list<Attributes extends object = object>(
    params?: IListTenantsParams,
  ): Promise<TenantRead<Attributes>[] | PaginatedResultTenantRead<Attributes>>;

  /**
   * Retrieves a list of users for a given tenant.
   *
   * @param params - pagination and filtering params.
   * @returns A promise that resolves to a PaginatedResultUserRead object containing the list of tenant users.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  listTenantUsers<Attributes extends object = object>(
    params: IListTenantUsers,
  ): Promise<PaginatedResultUserRead<Attributes>>;

  /**
   * Creates a new user and associates it with a tenant, without requiring a role assignment.
   * Uses the control-plane API even when facts proxying or waitForSync is enabled.
   * The acknowledgement does not guarantee that the PDP has synchronized the membership.
   * @param tenantKey - The existing tenant key or ID.
   * @param userData - New user data; role_assignments is optional.
   * @returns The created user, including its tenant membership.
   * @throws {@link PermitApiError} If the user already exists, the tenant is missing,
   * or the API rejects the request.
   * @throws {@link PermitContextError} If the environment context or API key is insufficient.
   */
  addUser<Attributes extends object = object>(
    tenantKey: string,
    userData: UserCreate,
  ): Promise<UserRead<Attributes>>;

  /**
   * Retrieves a tenant by its key.
   *
   * @param tenantKey The key of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get<Attributes extends object = object>(tenantKey: string): Promise<TenantRead<Attributes>>;

  /**
   * Retrieves a tenant by its key.
   * Alias for the {@link get} method.
   *
   * @param tenantKey The key of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey<Attributes extends object = object>(tenantKey: string): Promise<TenantRead<Attributes>>;

  /**
   * Retrieves a tenant by its ID.
   * Alias for the {@link get} method.
   *
   * @param tenantId The ID of the tenant.
   * @returns A promise that resolves to the tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById<Attributes extends object = object>(tenantId: string): Promise<TenantRead<Attributes>>;

  /**
   * Creates a new tenant.
   *
   * @param tenantData The data for the new tenant.
   * @returns A promise that resolves to the created tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create<Attributes extends object = object>(
    tenantData: TenantCreate,
  ): Promise<TenantRead<Attributes>>;

  /**
   * Updates a tenant.
   *
   * @param tenantKey The key of the tenant.
   * @param tenantData The updated data for the tenant.
   * @returns A promise that resolves to the updated tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update<Attributes extends object = object>(
    tenantKey: string,
    tenantData: TenantUpdate,
  ): Promise<TenantRead<Attributes>>;

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
  private membership: AutogenTenantsApi;

  /**
   * Creates an instance of the TenantsApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.membership = new AutogenTenantsApi(
      new Configuration({
        basePath: this.config.apiUrl,
        accessToken: this.config.token,
        baseOptions: {
          headers: {
            'X-Permit-SDK-Version':
              this.openapiClientConfig.baseOptions.headers['X-Permit-SDK-Version'],
          },
        },
      }),
      BASE_PATH,
      this.config.axiosInstance,
    );
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
   * @returns Tenant rows by default, or the complete page when includeTotalCount is true.
   * Dynamic or optional boolean flags retain the union of both result shapes.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public list<Attributes extends object = object>(
    params: IListTenantsParams & { includeTotalCount: true },
  ): Promise<PaginatedResultTenantRead<Attributes>>;
  public list<Attributes extends object = object>(
    params?: IListTenantsParams & { includeTotalCount?: false },
  ): Promise<TenantRead<Attributes>[]>;
  public list<Attributes extends object = object>(
    params?: IListTenantsParams,
  ): Promise<TenantRead<Attributes>[] | PaginatedResultTenantRead<Attributes>>;
  public async list<Attributes extends object = object>(
    params?: IListTenantsParams,
  ): Promise<TenantRead<Attributes>[] | PaginatedResultTenantRead<Attributes>> {
    const options = { ...params };
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      const response = (
        await this.tenants.listTenants({
          ...options,
          ...this.config.apiContext.environmentContext,
        })
      ).data;
      if (options.includeTotalCount === true) {
        return response as PaginatedResultTenantRead<Attributes>;
      }
      return (Array.isArray(response) ? response : response.data) as TenantRead<Attributes>[];
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Creates a new user and associates it with a tenant, without requiring a role assignment.
   * Uses the control-plane API even when facts proxying or waitForSync is enabled.
   * The acknowledgement does not guarantee that the PDP has synchronized the membership.
   * @param tenantKey - The existing tenant key or ID.
   * @param userData - New user data; role_assignments is optional.
   * @returns The created user, including its tenant membership.
   * @throws {@link PermitApiError} If the user already exists, the tenant is missing,
   * or the API rejects the request.
   * @throws {@link PermitContextError} If the environment context or API key is insufficient.
   */
  public async addUser<Attributes extends object = object>(
    tenantKey: string,
    userData: UserCreate,
  ): Promise<UserRead<Attributes>> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.membership.addUserToTenant({
          ...this.config.apiContext.environmentContext,
          tenantId: tenantKey,
          userCreate: userData,
        })
      ).data as UserRead<Attributes>;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a list of users for a given tenant.
   *
   * @param __namedParameters - Tenant key, pagination, and filtering options.
   * @returns A promise that resolves to a PaginatedResultUserRead object containing the list of tenant users.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async listTenantUsers<Attributes extends object = object>({
    tenantKey,
    ...params
  }: IListTenantUsers): Promise<PaginatedResultUserRead<Attributes>> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.tenants.listTenantUsers({
          ...params,
          ...this.config.apiContext.environmentContext,
          tenantId: tenantKey,
        })
      ).data as PaginatedResultUserRead<Attributes>;
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
  public async get<Attributes extends object = object>(
    tenantKey: string,
  ): Promise<TenantRead<Attributes>> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.tenants.getTenant({
          ...this.config.apiContext.environmentContext,
          tenantId: tenantKey,
        })
      ).data as TenantRead<Attributes>;
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
  public async getByKey<Attributes extends object = object>(
    tenantKey: string,
  ): Promise<TenantRead<Attributes>> {
    return await this.get<Attributes>(tenantKey);
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
  public async getById<Attributes extends object = object>(
    tenantId: string,
  ): Promise<TenantRead<Attributes>> {
    return await this.get<Attributes>(tenantId);
  }

  /**
   * Creates a new tenant.
   *
   * @param tenantData The data for the new tenant.
   * @returns A promise that resolves to the created tenant.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create<Attributes extends object = object>(
    tenantData: TenantCreate,
  ): Promise<TenantRead<Attributes>> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.tenants.createTenant({
          ...this.config.apiContext.environmentContext,
          tenantCreate: tenantData,
        })
      ).data as TenantRead<Attributes>;
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
  public async update<Attributes extends object = object>(
    tenantKey: string,
    tenantData: TenantUpdate,
  ): Promise<TenantRead<Attributes>> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.tenants.updateTenant({
          ...this.config.apiContext.environmentContext,
          tenantId: tenantKey,
          tenantUpdate: tenantData,
        })
      ).data as TenantRead<Attributes>;
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
