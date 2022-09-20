import axios, { AxiosResponse } from 'axios';
import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  APIKeysApi,
  Configuration,
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
} from '../openapi';

/**
 * This interface contains *read actions* that goes outside
 * of your local network and queries permit.io cloud api.
 * You should be aware that these actions incur some cross-cloud latency.
 */
export interface IReadApis {
  listUsers(): Promise<UserRead[]>;

  getUser(userId: string): Promise<UserRead>;

  getTenant(tenantId: string): Promise<TenantRead>;

  getRole(roleId: string): Promise<RoleRead>;

  getAssignedRoles(user: string, tenant?: string): Promise<RoleAssignmentRead[]>;
}

/**
 * This interface contains *write actions* (or mutations) that manipulate remote
 * state by calling the permit.io api. These api calls goes *outside* your local network.
 * You should be aware that these actions incur some cross-cloud latency.
 */
export interface IWriteApis {
  // user mutations
  createUser(user: UserCreate): Promise<[UserRead, boolean]>;
  syncUser(user: UserCreate): Promise<UserRead>;
  deleteUser(userId: string): Promise<AxiosResponse<void>>;

  // tenant mutations
  createTenant(tenant: TenantCreate): Promise<TenantRead>;

  updateTenant(tenantId: string, tenant: TenantUpdate): Promise<TenantRead>;

  deleteTenant(tenantId: string): Promise<AxiosResponse<void>>;

  listTenants(page?: number): Promise<TenantRead[]>;

  // role mutations
  createRole(role: RoleCreate): Promise<RoleRead>;

  updateRole(roleId: string, role: RoleUpdate): Promise<RoleRead>;

  deleteRole(roleId: string): Promise<AxiosResponse<void>>;

  // role mutations
  assignRole(assignedRole: RoleAssignmentCreate): Promise<RoleAssignmentRead>;

  unassignRole(removedRole: RoleAssignmentRemove): Promise<AxiosResponse<void>>;

  // resource mutations
  createResource(resource: ResourceCreate): Promise<[ResourceRead, boolean]>;

  updateResource(resourceId: string, resource: ResourceUpdate): Promise<ResourceRead>;

  deleteResource(resourceId: string): Promise<AxiosResponse<void>>;
}

export interface IPermitApi extends IReadApis, IWriteApis {}

export interface IApiClient {
  api: IPermitApi;
}

export class ApiClient implements IReadApis, IWriteApis, IApiClient {
  #gotScope = false;
  private project: string;
  private environment: string;
  private scope: APIKeysApi;
  private users: UsersApi;
  private tenants: TenantsApi;
  private roles: RolesApi;
  private roleAssignments: RoleAssignmentsApi;
  private resources: ResourcesApi;

  constructor(private config: IPermitConfig, private logger: Logger) {
    this.project = 'default';
    this.environment = 'prod';
    const axiosClientConfig = new Configuration({
      basePath: `${this.config.apiUrl}`,
      accessToken: this.config.token,
    });
    this.scope = new APIKeysApi(axiosClientConfig);
    this.users = new UsersApi(axiosClientConfig);
    this.tenants = new TenantsApi(axiosClientConfig);
    this.roles = new RolesApi(axiosClientConfig);
    this.roleAssignments = new RoleAssignmentsApi(axiosClientConfig);
    this.resources = new ResourcesApi(axiosClientConfig);
  }

  private async getScope() {
    if (this.#gotScope) {
      return;
    }
    try {
      const response = await this.scope.getApiKeyScope();
      this.#gotScope = true;
      if (response.data.project_id != undefined && response.data.environment_id != undefined) {
        this.project = response.data.project_id;
        this.environment = response.data.environment_id;
      } else {
        throw Error(`Invalid response from /scope: ${response.data}`);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.getApiKeyScope(), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  public async listUsers(): Promise<UserRead[]> {
    await this.getScope();

    try {
      const response = await this.users.listUsers({
        projId: this.project,
        envId: this.environment,
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

  public async getUser(userId: string): Promise<UserRead> {
    await this.getScope();
    try {
      const response = await this.users.getUser({
        projId: this.project,
        envId: this.environment,
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

  public async getTenant(tenantId: string): Promise<TenantRead> {
    await this.getScope();
    try {
      const response = await this.tenants.getTenant({
        projId: this.project,
        envId: this.environment,
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

  public async listTenants(page?: number): Promise<TenantRead[]> {
    await this.getScope();
    try {
      const response = await this.tenants.listTenants({
        projId: this.project,
        envId: this.environment,
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

  public async getRole(roleId: string): Promise<RoleRead> {
    await this.getScope();
    try {
      const response = await this.roles.getRole({
        projId: this.project,
        envId: this.environment,
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

  public async getAssignedRoles(user: string, tenant?: string): Promise<RoleAssignmentRead[]> {
    await this.getScope();
    try {
      const response = await this.roleAssignments.listRoleAssignments({
        projId: this.project,
        envId: this.environment,
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

  public async createResource(resource: ResourceCreate): Promise<[ResourceRead, boolean]> {
    await this.getScope();
    try {
      const response = await this.resources.createResource({
        projId: this.project,
        envId: this.environment,
        resourceCreate: resource,
      });
      this.logger.debug(
        `[${response.status}] permit.api.createResource(${JSON.stringify(resource)})`,
      );
      return [response.data, response.status === 201];
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

  public async updateResource(resourceId: string, resource: ResourceUpdate): Promise<ResourceRead> {
    await this.getScope();
    try {
      const response = await this.resources.updateResource({
        projId: this.project,
        envId: this.environment,
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

  public async deleteResource(resourceId: string): Promise<AxiosResponse<void>> {
    await this.getScope();
    try {
      const response = await this.resources.deleteResource({
        projId: this.project,
        envId: this.environment,
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

  public async createUser(user: UserCreate): Promise<[UserRead, boolean]> {
    await this.getScope();
    try {
      const response = await this.users.createUser({
        projId: this.project,
        envId: this.environment,
        userCreate: user,
      });
      this.logger.debug(`[${response.status}] permit.api.createUser(${JSON.stringify(user)})`);
      return [response.data, response.status === 201];
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

  public async syncUser(user: UserCreate): Promise<UserRead> {
    await this.getScope();
    try {
      const response = await this.users.replaceUser({
        projId: this.project,
        envId: this.environment,
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

  public async deleteUser(userId: string): Promise<AxiosResponse<void>> {
    await this.getScope();
    try {
      const response = await this.users.deleteUser({
        projId: this.project,
        envId: this.environment,
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

  public async createTenant(tenant: TenantCreate): Promise<TenantRead> {
    await this.getScope();
    try {
      const response = await this.tenants.createTenant({
        projId: this.project,
        envId: this.environment,
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

  public async updateTenant(tenantId: string, tenant: TenantUpdate): Promise<TenantRead> {
    await this.getScope();
    try {
      const response = await this.tenants.updateTenant({
        projId: this.project,
        envId: this.environment,
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

  public async deleteTenant(tenantId: string): Promise<AxiosResponse<void>> {
    await this.getScope();
    try {
      const response = await this.tenants.deleteTenant({
        projId: this.project,
        envId: this.environment,
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

  public async createRole(role: RoleCreate): Promise<RoleRead> {
    await this.getScope();
    try {
      const response = await this.roles.createRole({
        projId: this.project,
        envId: this.environment,
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

  public async updateRole(roleId: string, role: RoleUpdate): Promise<RoleRead> {
    await this.getScope();
    try {
      const response = await this.roles.updateRole({
        projId: this.project,
        envId: this.environment,
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

  public async deleteRole(roleId: string): Promise<AxiosResponse<void>> {
    await this.getScope();
    try {
      const response = await this.roles.deleteRole({
        projId: this.project,
        envId: this.environment,
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

  public async assignRole(assignedRole: RoleAssignmentCreate): Promise<RoleAssignmentRead> {
    await this.getScope();
    try {
      const response = await this.roleAssignments.assignRole({
        projId: this.project,
        envId: this.environment,
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

  public async unassignRole(removedRole: RoleAssignmentRemove): Promise<AxiosResponse<void>> {
    await this.getScope();
    try {
      const response = await this.roleAssignments.unassignRole({
        projId: this.project,
        envId: this.environment,
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

  public get api(): IPermitApi {
    return {
      listUsers: this.listUsers.bind(this),
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
    };
  }

  public getMethods(): IApiClient {
    return {
      api: this.api,
    };
  }
}
