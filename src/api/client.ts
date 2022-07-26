import axios, { AxiosInstance } from 'axios';
import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import { IUser } from '../enforcement/interfaces';
import { Environment } from '../types/environment';
import { DeleteResponse } from '../types/generic';
import { Organization } from '../types/organization';
import { Project } from '../types/project';
import { Resource, ResourceCreate, ResourceUpdate } from '../types/resource';
import {
  ResourceAction,
  ResourceActionCreate,
  ResourceActionUpdate,
} from '../types/resource-action';
import { Role, RoleCreate, RoleUpdate } from '../types/role';
import {
  RoleAssignment,
  RoleAssignmentCreate,
  RoleAssignmentRemove,
} from '../types/role-assignment';
import { Tenant, TenantCreate, TenantUpdate } from '../types/tenant';
import { User, UserCreate, UserUpdate } from '../types/user';
import { Dict } from '../utils/dict';

export interface ITenant {
  key: string;
  name: string;
  description?: string;
}

export interface IPermitApi {
  isUser(userId: string): Promise<boolean>;
  getUser(userId: string): Promise<User | null>;
  getUsers(): Promise<User[]>;
  getUserTenants(userId: string): Promise<Tenant[] | null>;
  getTenant(tenantKey: string): Promise<Tenant | null>;
  getTenants(): Promise<Tenant[]>;
  getResources(): Promise<Resource[]>;
  getResource(resourceKey: string): Promise<Resource | null>;
  getResourceActions(resourceKey: string): Promise<ResourceAction[]>;
  getResourceAction(resourceKey: string, actionKey: string): Promise<ResourceAction | null>;
  getCurrentOrganization(): Promise<Organization | null>;
  getCurrentProject(): Promise<Project | null>;
  getCurrentEnvironment(): Promise<Environment | null>;
  getAssignedRoles(userId: string): Promise<Role[]>;

  createUser(user: UserCreate): Promise<User>;
  updateUser(user: UserUpdate): Promise<User>;
  deleteUser(userKey: string): Promise<DeleteResponse>;
  createTenant(tenant: TenantCreate): Promise<Tenant>;
  updateTenant(tenant: TenantUpdate): Promise<Tenant>;
  deleteTenant(tenantKey: string): Promise<DeleteResponse>;
  createResource(resource: ResourceCreate): Promise<Resource>;
  updateResource(resource: ResourceUpdate): Promise<Resource>;
  deleteResource(resourceKey: string): Promise<DeleteResponse>;
  createAction(action: ResourceActionCreate): Promise<ResourceAction>;
  updateAction(action: ResourceActionUpdate): Promise<ResourceAction>;
  deleteAction(actionKey: string): Promise<DeleteResponse>;
  createRole(role: RoleCreate): Promise<Role>;
  updateRole(role: RoleUpdate): Promise<Role>;
  deleteRole(roleKey: string): Promise<DeleteResponse>;
  assignRole(roleAssignment: RoleAssignmentCreate): Promise<RoleAssignment>;
  unassignRole(roleAssignment: RoleAssignmentRemove): Promise<DeleteResponse>;
  unassignRole(roleAssignmentId: string): Promise<DeleteResponse>;
}

export interface IApiClient {
  api: IPermitApi;
}

export class ApiClient implements IApiClient {
  private client: AxiosInstance = axios.create();

  constructor(private config: IPermitConfig, private logger: Logger) {
    this.client = axios.create({
      baseURL: `${this.config.pdp}/`,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // read api -----------------------------------------------------------------
  public isUser(userId: string): Promise<boolean> {
    this.logger.info(`permit.api.isUser(${userId})`);
    return this.getUser(userId)
      .then((user) => {
        return !!user.id;
      })
      .catch((error: Error) => {
        this.logger.error(`permit.api.isUser(${userId}) failed: ${error.message}`);
        throw error;
      });
  }

  public getUser(userKey: string): Promise<User> {
    this.logger.info(`permit.api.getUser(${userKey})`);
    return this.client
      .get(`${this.config.project}/${this.config.environment}/users/${userKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to get user with key: ${userKey}, got error: ${error}`);
        throw error;
      });
  }
  public getUsers(): Promise<User[]> {
    this.logger.info(`permit.api.getUsers()`);
    return this.client
      .get(`${this.config.project}/${this.config.environment}/users`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to get users, got error: ${error}`);
        throw error;
      });
  }

  public getRole(roleKey: string): Promise<Role> {
    this.logger.info(`permit.api.getRole(${roleKey})`);
    return this.client
      .get(`${this.config.project}/${this.config.environment}/roles/${roleKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to get role with id: ${roleKey}, got error: ${error}`);
        throw error;
      });
  }

  public getRoles(): Promise<Role[]> {
    this.logger.info(`permit.api.getRoles()`);
    return this.client
      .get(`${this.config.project}/${this.config.environment}/roles`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to get roles, got error: ${error}`);
        throw error;
      });
  }

  public getTenant(tenantKey: string): Promise<Tenant> {
    this.logger.info(`permit.api.getTenant(${tenantKey})`);
    return this.client
      .get(`${this.config.project}/${this.config.environment}/tenants/${tenantKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to get tenant with id: ${tenantKey}, got error: ${error}`);
        throw error;
      });
  }

  public getTenants(): Promise<Tenant[]> {
    this.logger.info(`permit.api.getTenants()`);
    return this.client
      .get(`${this.config.project}/${this.config.environment}/tenants`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to get tenants, got error: ${error}`);
        throw error;
      });
  }

  public getResources(): Promise<Resource[]> {
    this.logger.info(`permit.api.getResources()`);
    return this.client
      .get(`${this.config.project}/${this.config.environment}/resources`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to get resources, got error: ${error}`);
        throw error;
      });
  }

  public getResource(resourceKey: string): Promise<Resource> {
    this.logger.info(`permit.api.getResource(${resourceKey})`);
    return this.client
      .get(`${this.config.project}/${this.config.environment}/resources/${resourceKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to get resource, got error: ${error}`);
        throw error;
      });
  }

  public getResourceActions(resourceKey: string): Promise<ResourceAction[]> {
    this.logger.info(`permit.api.getResourceActions()`);
    return this.client
      .get(`${this.config.project}/${this.config.environment}/resources/${resourceKey}/actions`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to get resourceAction, got error: ${error}`);
        throw error;
      });
  }

  public getResourceAction(resourceKey: string, actionKey: string): Promise<ResourceAction> {
    this.logger.info(`permit.api.getResource(${resourceKey})`);
    return this.client
      .get(
        `${this.config.project}/${this.config.environment}/resources/${resourceKey}/actions/${actionKey}`,
      )
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to get resrouceAction, got error: ${error}`);
        throw error;
      });
  }

  // either in one tenant or in all tenants
  // TODO: fix schema
  public async getAssignedRoles(userKey: string, tenantKey?: string): Promise<RoleAssignment> {
    this.logger.info(`permit.api.getAssignedRoles(user=${userKey}, tenant=${tenantKey})`);
    let url = `cloud/role_assignments?user=${userKey}`;
    if (tenantKey !== undefined) {
      url += `&tenant=${tenantKey}`;
    }
    return await this.client
      .get<RoleAssignment>(url)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`could not get user roles for user ${userKey}, got error: ${error}`);
        throw error;
      });
  }

  // write api ----------------------------------------------------------------
  // user mutations
  public async syncUser(user: IUser): Promise<Dict> {
    this.logger.info(`permit.api.syncUser(${JSON.stringify(user)})`);
    return await this.client
      .put<Dict>('cloud/users', user)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to sync user with key: ${user.key}, got error: ${error}`);
        throw error;
      });
  }

  public async deleteUser(userKey: string): Promise<Dict> {
    this.logger.info(`permit.api.deleteUser(${userKey})`);
    return await this.client
      .delete(`cloud/users/${userKey}`)
      .then((response) => {
        return { status: response.status };
      })
      .catch((error: Error) => {
        this.logger.error(`tried to delete user with key: ${userKey}, got error: ${error}`);
        throw error;
      });
  }

  // tenant mutations
  public async createTenant(tenant: ITenant): Promise<Dict> {
    this.logger.info(`permit.api.createTenant(${JSON.stringify(tenant)})`);
    const data: Dict = {};
    data.externalId = tenant.key;
    data.name = tenant.name;
    if (tenant.description) {
      data.description = tenant.description;
    }

    return await this.client
      .put<Dict>('cloud/tenants', data)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to create tenant with key: ${tenant.key}, got error: ${error}`);
        throw error;
      });
  }

  public async updateTenant(tenant: ITenant): Promise<Dict> {
    this.logger.info(`permit.api.updateTenant(${JSON.stringify(tenant)})`);
    const data: Dict = {};
    data.name = tenant.name;

    if (tenant.description) {
      data.description = tenant.description;
    }

    return await this.client
      .patch<Dict>(`cloud/tenants/${tenant.key}`, data)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to update tenant with key: ${tenant.key}, got error: ${error}`);
        throw error;
      });
  }

  public async deleteTenant(tenantKey: string): Promise<Dict> {
    this.logger.info(`permit.api.deleteTenant(${tenantKey})`);
    return await this.client
      .delete(`cloud/tenants/${tenantKey}`)
      .then((response) => {
        return { status: response.status };
      })
      .catch((error: Error) => {
        this.logger.error(`tried to delete tenant with key: ${tenantKey}, got error: ${error}`);
        throw error;
      });
  }

  // role mutations
  public async assignRole(userKey: string, roleKey: string, tenantKey: string): Promise<Dict> {
    const data = {
      role: roleKey,
      user: userKey,
      scope: tenantKey,
    };

    this.logger.info(`permit.api.assignRole(${JSON.stringify(data)})`);

    return await this.client
      .post<Dict>('cloud/role_assignments', data)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `could not assign role ${roleKey} to ${userKey} in tenant ${tenantKey}, got error: ${error}`,
        );
        throw error;
      });
  }

  public async unassignRole(userKey: string, roleKey: string, tenantKey: string): Promise<Dict> {
    const data = {
      role: roleKey,
      user: userKey,
      scope: tenantKey,
    };
    this.logger.info(`permit.api.assignRole(${JSON.stringify(data)})`);

    return await this.client
      .delete<Dict>(`cloud/role_assignments?role=${roleKey}&user=${userKey}&scope=${tenantKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `could not unassign role ${roleKey} of ${userKey} in tenant ${tenantKey}, got error: ${error}`,
        );
        throw error;
      });
  }

  public get api(): IPermitApi {
    return {
      // read methods
      isUser: this.isUser.bind(this),
      getUser: this.getUser.bind(this),
      getUsers: this.getUsers.bind(this),
      getRole: this.getRole.bind(this),
      getRoles: this.getRoles.bind(this),
      getTenant: this.getTenant.bind(this),
      getTenants: this.getTenants.bind(this),
      // getUserTenants: this.getUserTenants.bind(this), TODO how to do this?
      getResources: this.getResources.bind(this),
      getResource: this.getResource.bind(this),
      getResourceActions: this.getResourceActions.bind(this),
      getResourceAction: this.getResourceAction.bind(this),
      getCurrentOrganization: this.getCurrentOrganization.bind(this),
      getCurrentProject: this.getCurrentProject.bind(this),
      getCurrentEnvironment: this.getCurrentEnvironment.bind(this),
      // getLastUpdateFromServer: this.getLastUpdateFromServer.bind(this),
      // getUptime: this.getUptime.bind(this),
      getAssignedRoles: this.getAssignedRoles.bind(this),

      // write methods
      createUser: this.createUser.bind(this),
      updateUser: this.updateUser.bind(this),
      deleteUser: this.deleteUser.bind(this),
      createTenant: this.createTenant.bind(this),
      updateTenant: this.updateTenant.bind(this),
      deleteTenant: this.deleteTenant.bind(this),
      createResource: this.createResource.bind(this),
      updateResource: this.updateResource.bind(this),
      deleteResource: this.deleteResource.bind(this),
      createAction: this.createAction.bind(this),
      updateAction: this.updateAction.bind(this),
      deleteAction: this.deleteAction.bind(this),
      createRole: this.createRole.bind(this),
      updateRole: this.updateRole.bind(this),
      deleteRole: this.deleteRole.bind(this),
      assignRole: this.assignRole.bind(this),
      unassignRole: this.unassignRole.bind(this),
    };
  }

  public getMethods(): IApiClient {
    return {
      // read: this.read.bind(this),
      // write: this.write.bind(this),
      api: this.api,
    };
  }
}
