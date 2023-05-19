import axios, { AxiosResponse } from 'axios';
import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  ConditionSetCreate,
  ConditionSetRead,
  ConditionSetRuleCreate,
  ConditionSetRuleRead,
  ConditionSetRuleRemove,
  ConditionSetRulesApi,
  ConditionSetsApi,
  ConditionSetType,
  ConditionSetUpdate,
  ResourceCreate,
  ResourceRead,
  ResourcesApi,
  ResourceUpdate,
  RoleAssignmentCreate,
  RoleAssignmentRead,
  RoleAssignmentRemove,
  RoleAssignmentsApi,
  RoleCreate,
  RoleRead,
  RolesApi,
  RoleUpdate,
  TenantCreate,
  TenantRead,
  TenantsApi,
  TenantUpdate,
  UserCreate,
  UserRead,
  UsersApi,
  UserUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, PermitApiError } from './base'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ApiContext, ApiKeyLevel, PermitContextError } from './context'; // eslint-disable-line @typescript-eslint/no-unused-vars

/**
 * This interface contains *read actions* that goes outside
 * of your local network and queries permit.io cloud api.
 * You should be aware that these actions incur some cross-cloud latency.
 * @see {@link DeprecatedApiClient} for implementation and docs.
 */
export interface IDeprecatedReadApis {
  listUsers(): Promise<UserRead[]>;
  listRoles(): Promise<RoleRead[]>;
  getUser(userId: string): Promise<UserRead>;
  getTenant(tenantId: string): Promise<TenantRead>;
  getRole(roleId: string): Promise<RoleRead>;
  getAssignedRoles(user: string, tenant?: string): Promise<RoleAssignmentRead[]>;
  listConditionSets(type: string, page: number, per_page: number): Promise<ConditionSetRead[]>;
  listConditionSetsRules(page: number, per_page: number): Promise<ConditionSetRuleRead[]>;
}

/**
 * This interface contains *write actions* (or mutations) that manipulate remote
 * state by calling the permit.io api. These api calls goes *outside* your local network.
 * You should be aware that these actions incur some cross-cloud latency.
 * @see {@link DeprecatedApiClient} for implementation and docs.
 */
export interface IDeprecatedWriteApis {
  createUser(user: UserCreate): Promise<UserRead>;
  updateUser(userId: string, user: UserUpdate): Promise<UserRead>;
  syncUser(user: UserCreate): Promise<UserRead>;
  deleteUser(userId: string): Promise<AxiosResponse<void>>;
  createTenant(tenant: TenantCreate): Promise<TenantRead>;
  updateTenant(tenantId: string, tenant: TenantUpdate): Promise<TenantRead>;
  deleteTenant(tenantId: string): Promise<AxiosResponse<void>>;
  listTenants(page?: number): Promise<TenantRead[]>;
  createRole(role: RoleCreate): Promise<RoleRead>;
  updateRole(roleId: string, role: RoleUpdate): Promise<RoleRead>;
  deleteRole(roleId: string): Promise<AxiosResponse<void>>;
  assignRole(assignedRole: RoleAssignmentCreate): Promise<RoleAssignmentRead>;
  unassignRole(removedRole: RoleAssignmentRemove): Promise<AxiosResponse<void>>;
  createResource(resource: ResourceCreate): Promise<ResourceRead>;
  updateResource(resourceId: string, resource: ResourceUpdate): Promise<ResourceRead>;
  deleteResource(resourceId: string): Promise<AxiosResponse<void>>;
  createConditionSet(conditionSet: ConditionSetCreate): Promise<ConditionSetRead>;
  updateConditionSet(
    conditionSetId: string,
    conditionSet: ConditionSetUpdate,
  ): Promise<ConditionSetRead>;
  deleteConditionSet(conditionSetId: string): Promise<AxiosResponse<void>>;
  assignConditionSetRule(conditionSetRule: ConditionSetRuleCreate): Promise<ConditionSetRuleRead[]>;
  unassignConditionSetRule(conditionSetRule: ConditionSetRuleRemove): Promise<AxiosResponse<void>>;
}

export interface IDeprecatedPermitApi extends IDeprecatedReadApis, IDeprecatedWriteApis {}

/**
 * Contains all the deprecated `permit.api.` methods in one place.
 * The SDK now replaced all `permit.api.createRole()` with `permit.api.roles.create()`
 * due to the large number of API endpoints, trying to allow more user-friendly code
 * autocomplete behavior.
 */
export class DeprecatedApiClient extends BasePermitApi implements IDeprecatedPermitApi {
  private _users: UsersApi;
  private _tenants: TenantsApi;
  private _roles: RolesApi;
  private _conditionSets: ConditionSetsApi;
  private _conditionSetRules: ConditionSetRulesApi;
  private _roleAssignments: RoleAssignmentsApi;
  private _resources: ResourcesApi;

  /**
   * Creates an instance of DeprecatedApiClient.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger object for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this._users = new UsersApi(this.openapiClientConfig, BASE_PATH, this.config.axiosInstance);
    this._tenants = new TenantsApi(this.openapiClientConfig, BASE_PATH, this.config.axiosInstance);
    this._roles = new RolesApi(this.openapiClientConfig, BASE_PATH, this.config.axiosInstance);
    this._conditionSets = new ConditionSetsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
    this._conditionSetRules = new ConditionSetRulesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
    this._roleAssignments = new RoleAssignmentsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
    this._resources = new ResourcesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of users.
   * @returns A promise that resolves to an array of UserRead objects representing the users.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.users.list()
   */
  public async listUsers(): Promise<UserRead[]> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);

    try {
      const response = await this._users.listUsers({
        ...this.config.apiContext.environmentContext,
      });

      this.logger.debug(`[${response.status}] permit.api.listUsers()`);
      return response.data.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.getUser(), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Retrieves a list of roles.
   * @returns A promise that resolves to an array of RoleRead objects representing the roles.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.roles.list()
   */
  public async listRoles(): Promise<RoleRead[]> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);

    try {
      const response = await this._roles.listRoles({
        ...this.config.apiContext.environmentContext,
      });

      this.logger.debug(`[${response.status}] permit.api.listRoles()`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.listRoles(), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Retrieves a list of condition sets.
   * @param type - The type of the condition set, either `userset` or `resourceset`.
   * @param page - The page number.
   * @param perPage - The number of items per page.
   * @returns A promise that resolves to an array of ConditionSetRead objects representing the condition sets.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.conditionSets.list()
   */
  public async listConditionSets(
    type: ConditionSetType,
    page: number,
    perPage: number,
  ): Promise<ConditionSetRead[]> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);

    try {
      const response = await this._conditionSets.listConditionSets({
        ...this.config.apiContext.environmentContext,
        type: type,
        page: page,
        perPage: perPage,
      });

      this.logger.debug(`[${response.status}] permit.api.listRoles()`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.listRoles(), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Retrieves a list of condition set rules.
   * @param page - The page number.
   * @param perPage - The number of items per page.
   * @returns A promise that resolves to an array of ConditionSetRuleRead objects representing the condition set rules.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.conditionSetRules.list()
   */
  public async listConditionSetsRules(
    page: number,
    perPage: number,
  ): Promise<ConditionSetRuleRead[]> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);

    try {
      const response = await this._conditionSetRules.listSetPermissions({
        ...this.config.apiContext.environmentContext,
        page: page,
        perPage: perPage,
      });

      this.logger.debug(`[${response.status}] permit.api.listRoles()`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.listRoles(), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Retrieves a user by ID or key
   * @param userId - The ID or the key of the user.
   * @returns A promise that resolves to a UserRead object representing the user.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.users.get()
   */
  public async getUser(userId: string): Promise<UserRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._users.getUser({
        ...this.config.apiContext.environmentContext,
        userId: userId,
      });
      this.logger.debug(`[${response.status}] permit.api.getUser(${userId})`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.getUser(${userId}), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Retrieves a tenant by ID or key.
   * @param tenantId - The ID or the key of the tenant.
   * @returns A promise that resolves to a TenantRead object representing the tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.tenants.get()
   */
  public async getTenant(tenantId: string): Promise<TenantRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._tenants.getTenant({
        ...this.config.apiContext.environmentContext,
        tenantId: tenantId,
      });
      this.logger.debug(`[${response.status}] permit.api.getTenant(${tenantId})`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.getTenant(${tenantId}), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Retrieves a list of tenants.
   * @param page - The page number.
   * @returns A promise that resolves to an array of TenantRead objects representing the tenants.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.tenants.list()
   */
  public async listTenants(page?: number): Promise<TenantRead[]> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._tenants.listTenants({
        ...this.config.apiContext.environmentContext,
        page: page,
      });
      this.logger.debug(`[${response.status}] permit.api.listTenants(${page ?? ''})`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.listTenants(${page ?? ''}), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Retrieves a role by ID or key.
   * @param roleId - The ID or the key of the role.
   * @returns A promise that resolves to a RoleRead object representing the role.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.roles.get()
   */
  public async getRole(roleId: string): Promise<RoleRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._roles.getRole({
        ...this.config.apiContext.environmentContext,
        roleId: roleId,
      });
      this.logger.debug(`[${response.status}] permit.api.getRole(${roleId})`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.getRole(${roleId}), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Retrieves the assigned roles for a user (either in a single tenant or in all tenants).
   * @param user - The ID or key of the user.
   * @param tenant - The ID or key of the tenant, optional. If provided, only roles assigned within this tenant will be returned.
   * @returns A promise that resolves to an array of RoleAssignmentRead objects representing the assigned roles.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.users.getAssignedRoles()
   */
  public async getAssignedRoles(user: string, tenant?: string): Promise<RoleAssignmentRead[]> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._roleAssignments.listRoleAssignments({
        ...this.config.apiContext.environmentContext,
        user: user,
        tenant: tenant,
      });
      this.logger.debug(
        `[${response.status}] permit.api.getAssignedRoles(${user}, ${tenant ?? 'all tenants'})`,
      );
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.getAssignedRoles(${user}, ${
            tenant ?? 'all tenants'
          }), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Creates a new resource.
   * @param resource - The resource to create.
   * @returns A promise that resolves to a ResourceRead object representing the created resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.resources.create()
   */
  public async createResource(resource: ResourceCreate): Promise<ResourceRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._resources.createResource({
        ...this.config.apiContext.environmentContext,
        resourceCreate: resource,
      });
      this.logger.debug(
        `[${response.status}] permit.api.createResource(${JSON.stringify(resource)})`,
      );
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.createResource(${JSON.stringify(
            resource,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Updates an existing resource.
   * @param resourceId - The ID or key of the resource to update.
   * @param resource - The updated resource data.
   * @returns A promise that resolves to a ResourceRead object representing the updated resource.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.resources.update()
   */
  public async updateResource(resourceId: string, resource: ResourceUpdate): Promise<ResourceRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._resources.updateResource({
        ...this.config.apiContext.environmentContext,
        resourceId: resourceId,
        resourceUpdate: resource,
      });
      this.logger.debug(
        `[${response.status}] permit.api.updateResource(${resourceId}, ${JSON.stringify(
          resource,
        )})`,
      );
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.updateResource(${resourceId}, ${JSON.stringify(
            resource,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Deletes a resource.
   * @param resourceId - The ID or key of the resource to delete.
   * @returns A promise that resolves when the resource is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.resources.delete()
   */
  public async deleteResource(resourceId: string): Promise<AxiosResponse<void>> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._resources.deleteResource({
        ...this.config.apiContext.environmentContext,
        resourceId: resourceId,
      });
      this.logger.debug(`[${response.status}] permit.api.deleteResource(${resourceId})`);
      return response;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${
            err?.response?.status
          }] permit.api.deleteResource(${resourceId}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Creates a new user.
   * @param user - The user to create.
   * @returns A promise that resolves to a UserRead object representing the created user.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.users.create()
   */
  public async createUser(user: UserCreate): Promise<UserRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._users.createUser({
        ...this.config.apiContext.environmentContext,
        userCreate: user,
      });
      this.logger.debug(`[${response.status}] permit.api.createUser(${JSON.stringify(user)})`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.createUser(${JSON.stringify(
            user,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Creates or Updates in place a user.
   * @param user - The user to create or update.
   * @returns A promise that resolves to a UserRead object representing the synced user.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.users.sync()
   */
  public async syncUser(user: UserCreate): Promise<UserRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._users.replaceUser({
        ...this.config.apiContext.environmentContext,
        userId: user.key,
        userCreate: user,
      });
      this.logger.debug(`[${response.status}] permit.api.syncUser(${JSON.stringify(user)})`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.syncUser(${JSON.stringify(
            user,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Updates an existing user.
   * @param userId - The ID or key of the user to update.
   * @param user - The updated user data.
   * @returns A promise that resolves to a UserRead object representing the updated user.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.users.update()
   */
  public async updateUser(userId: string, user: UserUpdate): Promise<UserRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._users.updateUser({
        ...this.config.apiContext.environmentContext,
        userId,
        userUpdate: user,
      });
      this.logger.debug(`[${response.status}] permit.api.updateUser(${JSON.stringify(user)})`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.updateUser(${JSON.stringify(
            user,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Deletes a user.
   * @param userId - The ID or key of the user to delete.
   * @returns A promise that resolves when the user is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.users.delete()
   */
  public async deleteUser(userId: string): Promise<AxiosResponse<void>> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._users.deleteUser({
        ...this.config.apiContext.environmentContext,
        userId: userId, // user id or key
      });
      this.logger.debug(`[${response.status}] permit.api.deleteUser(${userId})`);
      return response;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.deleteUser(${userId}), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Creates a new tenant.
   * @param tenant - The tenant to create.
   * @returns A promise that resolves to a TenantRead object representing the created tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.tenants.create()
   */
  public async createTenant(tenant: TenantCreate): Promise<TenantRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._tenants.createTenant({
        ...this.config.apiContext.environmentContext,
        tenantCreate: tenant,
      });
      this.logger.debug(`[${response.status}] permit.api.createTenant(${JSON.stringify(tenant)})`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.createTenant(${JSON.stringify(
            tenant,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Updates an existing tenant.
   * @param tenantId - The ID or key of the tenant to update.
   * @param tenant - The updated tenant data.
   * @returns A promise that resolves to a TenantRead object representing the updated tenant.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.tenants.update()
   */
  public async updateTenant(tenantId: string, tenant: TenantUpdate): Promise<TenantRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._tenants.updateTenant({
        ...this.config.apiContext.environmentContext,
        tenantId: tenantId,
        tenantUpdate: tenant,
      });
      this.logger.debug(
        `[${response.status}] permit.api.updateTenant(${tenantId}, ${JSON.stringify(tenant)})`,
      );
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.updateTenant(${tenantId}, ${JSON.stringify(
            tenant,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Deletes a tenant.
   * @param tenantId - The ID or key of the tenant to delete.
   * @returns A promise that resolves when the tenant is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.tenants.delete()
   */
  public async deleteTenant(tenantId: string): Promise<AxiosResponse<void>> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._tenants.deleteTenant({
        ...this.config.apiContext.environmentContext,
        tenantId: tenantId,
      });
      this.logger.debug(`[${response.status}] permit.api.deleteTenant(${tenantId})`);
      return response;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.deleteTenant(${tenantId}), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Creates a new role.
   * @param role - The role to create.
   * @returns A promise that resolves to a RoleRead object representing the created role.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.roles.create()
   */
  public async createRole(role: RoleCreate): Promise<RoleRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._roles.createRole({
        ...this.config.apiContext.environmentContext,
        roleCreate: role,
      });
      this.logger.debug(`[${response.status}] permit.api.createRole(${JSON.stringify(role)})`);
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.createRole(${JSON.stringify(
            role,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Updates an existing role.
   * @param roleId - The ID or key of the role to update.
   * @param role - The updated role data.
   * @returns A promise that resolves to a RoleRead object representing the updated role.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.roles.update()
   */
  public async updateRole(roleId: string, role: RoleUpdate): Promise<RoleRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._roles.updateRole({
        ...this.config.apiContext.environmentContext,
        roleId: roleId,
        roleUpdate: role,
      });
      this.logger.debug(
        `[${response.status}] permit.api.updateRole(${roleId}, ${JSON.stringify(role)})`,
      );
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.updateRole(${roleId}, ${JSON.stringify(
            role,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Deletes a role.
   * @param roleId - The ID or key of the role to delete.
   * @returns A promise that resolves when the role is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.roles.delete()
   */
  public async deleteRole(roleId: string): Promise<AxiosResponse<void>> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._roles.deleteRole({
        ...this.config.apiContext.environmentContext,
        roleId: roleId,
      });
      this.logger.debug(`[${response.status}] permit.api.deleteRole(${roleId})`);
      return response;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.deleteRole(${roleId}), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Assigns a role to a user.
   * @param assignedRole - The role assignment data.
   * @returns A promise that resolves to a RoleAssignmentRead object representing the assigned role.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.users.assignRole()
   */
  public async assignRole(assignedRole: RoleAssignmentCreate): Promise<RoleAssignmentRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._roleAssignments.assignRole({
        ...this.config.apiContext.environmentContext,
        roleAssignmentCreate: assignedRole,
      });
      this.logger.debug(
        `[${response.status}] permit.api.assignRole(${JSON.stringify(assignedRole)})`,
      );
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.assignRole(${JSON.stringify(
            assignedRole,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Unassigns a role from a user.
   * @param removedRole - The role unassignment data.
   * @returns A promise that resolves when the role is unassigned.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.users.unassignRole()
   */
  public async unassignRole(removedRole: RoleAssignmentRemove): Promise<AxiosResponse<void>> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._roleAssignments.unassignRole({
        ...this.config.apiContext.environmentContext,
        roleAssignmentRemove: removedRole,
      });
      this.logger.debug(
        `[${response.status}] permit.api.unassignRole(${JSON.stringify(removedRole)})`,
      );
      return response;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.unassignRole(${JSON.stringify(
            removedRole,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Creates a new condition set.
   * @param conditionSet - The condition set to create.
   * @returns A promise that resolves to a ConditionSetRead object representing the created condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.conditionSets.create()
   */
  public async createConditionSet(conditionSet: ConditionSetCreate): Promise<ConditionSetRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._conditionSets.createConditionSet({
        ...this.config.apiContext.environmentContext,
        conditionSetCreate: conditionSet,
      });
      this.logger.debug(
        `[${response.status}] permit.api.createConditionSet(${JSON.stringify(conditionSet)})`,
      );
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.createConditionSet(${JSON.stringify(
            conditionSet,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Updates an existing condition set.
   * @param conditionSetId - The ID or key of the condition set to update.
   * @param conditionSet - The updated condition set data.
   * @returns A promise that resolves to a ConditionSetRead object representing the updated condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.conditionSets.update()
   */
  public async updateConditionSet(
    conditionSetId: string,
    conditionSet: ConditionSetUpdate,
  ): Promise<ConditionSetRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._conditionSets.updateConditionSet({
        ...this.config.apiContext.environmentContext,
        conditionSetId: conditionSetId,
        conditionSetUpdate: conditionSet,
      });
      this.logger.debug(
        `[${response.status}] permit.api.updateConditionSet(${conditionSetId}, ${JSON.stringify(
          conditionSet,
        )})`,
      );
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${
            err?.response?.status
          }] permit.api.updateConditionSet(${conditionSetId}, ${JSON.stringify(
            conditionSet,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Deletes a condition set.
   * @param conditionSetId - The ID or key of the condition set to delete.
   * @returns A promise that resolves when the condition set is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.conditionSets.delete()
   */
  public async deleteConditionSet(conditionSetId: string): Promise<AxiosResponse<void>> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._conditionSets.deleteConditionSet({
        ...this.config.apiContext.environmentContext,
        conditionSetId: conditionSetId,
      });
      this.logger.debug(`[${response.status}] permit.api.deleteConditionSet(${conditionSetId})`);
      return response;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${
            err?.response?.status
          }] permit.api.deleteConditionSet(${conditionSetId}), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  /**
   * Creates a condition set rule (i.e: grants permission to a userset to act on a resourceset).
   * @param conditionSetRule - The condition set rule data.
   * @returns A promise that resolves to a ConditionSetRuleRead object representing the assigned condition set rule.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.conditionSetRules.create()
   */
  public async assignConditionSetRule(
    conditionSetRule: ConditionSetRuleCreate,
  ): Promise<ConditionSetRuleRead[]> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._conditionSetRules.assignSetPermissions({
        ...this.config.apiContext.environmentContext,
        conditionSetRuleCreate: conditionSetRule,
      });
      this.logger.debug(
        `[${response.status}] permit.api.createConditionSetRule(${JSON.stringify(
          conditionSetRule,
        )})`,
      );
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.createConditionSetRule(${JSON.stringify(
            conditionSetRule,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  /**
   * Removes a condition set rule (i.e: unassigns permission from a userset to act on a resourceset).
   * @param conditionSetRuleId - The ID or key of the condition set rule to remove.
   * @returns A promise that resolves when the condition set rule is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @deprecated replaced with permit.api.conditionSetRules.delete()
   */
  public async unassignConditionSetRule(
    conditionSetRule: ConditionSetRuleRemove,
  ): Promise<AxiosResponse<void>> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      const response = await this._conditionSetRules.unassignSetPermissions({
        ...this.config.apiContext.environmentContext,
        conditionSetRuleRemove: conditionSetRule,
      });
      this.logger.debug(
        `[${response.status}] permit.api.deleteConditionSetRule(${JSON.stringify(
          conditionSetRule,
        )})`,
      );
      return response;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.deleteConditionSetRule(${JSON.stringify(
            conditionSetRule,
          )}), err: ${JSON.stringify(err?.response?.data)}`,
        );
      }
      throw err;
    }
  }

  public getMethods(): IDeprecatedPermitApi {
    return {
      listUsers: this.listUsers.bind(this),
      listRoles: this.listRoles.bind(this),
      listConditionSets: this.listConditionSets.bind(this),
      listConditionSetsRules: this.listConditionSetsRules.bind(this),
      updateUser: this.updateUser.bind(this),
      getUser: this.getUser.bind(this),
      getTenant: this.getTenant.bind(this),
      getRole: this.getRole.bind(this),
      getAssignedRoles: this.getAssignedRoles.bind(this),
      createResource: this.createResource.bind(this),
      updateResource: this.updateResource.bind(this),
      deleteResource: this.deleteResource.bind(this),
      createUser: this.createUser.bind(this),
      syncUser: this.syncUser.bind(this),
      deleteUser: this.deleteUser.bind(this),
      createTenant: this.createTenant.bind(this),
      updateTenant: this.updateTenant.bind(this),
      deleteTenant: this.deleteTenant.bind(this),
      listTenants: this.listTenants.bind(this),
      createRole: this.createRole.bind(this),
      updateRole: this.updateRole.bind(this),
      deleteRole: this.deleteRole.bind(this),
      assignRole: this.assignRole.bind(this),
      unassignRole: this.unassignRole.bind(this),
      createConditionSet: this.createConditionSet.bind(this),
      updateConditionSet: this.updateConditionSet.bind(this),
      deleteConditionSet: this.deleteConditionSet.bind(this),
      assignConditionSetRule: this.assignConditionSetRule.bind(this),
      unassignConditionSetRule: this.unassignConditionSetRule.bind(this),
    };
  }
}
