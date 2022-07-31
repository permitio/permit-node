import axios, { AxiosInstance } from 'axios';
import { Logger } from 'winston';

import { IPermitConfig } from '../config';
// import { Environment } from '../types/environment';
import { DeleteResponse } from '../types/generic';
// import { Organization } from '../types/organization';
// import { Project } from '../types/project';
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

export interface ITenant {
  key: string;
  name: string;
  description?: string;
}

export interface IPermitApi {
  isUser(userId: string): Promise<boolean>;
  getUser(userId: string): Promise<User | null>;
  getUsers(): Promise<User[]>;
  // getUserTenants(userId: string): Promise<Tenant[] | null>;
  getTenant(tenantKey: string): Promise<Tenant | null>;
  getTenants(): Promise<Tenant[]>;
  getRole(roleKey: string): Promise<Role | null>;
  getRoles(): Promise<Role[]>;
  getResources(): Promise<Resource[]>;
  getResource(resourceKey: string): Promise<Resource | null>;
  getResourceActions(resourceKey: string): Promise<ResourceAction[]>;
  getResourceAction(resourceKey: string, actionKey: string): Promise<ResourceAction | null>;

  // getCurrentOrganization(): Promise<Organization | null>;
  // getCurrentProject(): Promise<Project | null>;
  // getCurrentEnvironment(): Promise<Environment | null>;
  // getAssignedRoles(userId: string): Promise<Role[]>;

  createUser(user: UserCreate): Promise<User>;
  updateUser(user: UserUpdate): Promise<User>;
  deleteUser(userKey: string): Promise<DeleteResponse>;
  createTenant(tenant: TenantCreate): Promise<Tenant>;
  updateTenant(tenant: TenantUpdate): Promise<Tenant>;
  deleteTenant(tenantKey: string): Promise<DeleteResponse>;
  createResource(resource: ResourceCreate): Promise<Resource>;
  updateResource(resource: ResourceUpdate): Promise<Resource>;
  deleteResource(resourceKey: string): Promise<DeleteResponse>;
  createResourceAction(resourceKey: string, action: ResourceActionCreate): Promise<ResourceAction>;
  updateResourceAction(resourceKey: string, action: ResourceActionUpdate): Promise<ResourceAction>;
  deleteResourceAction(resourceKey: string, actionKey: string): Promise<DeleteResponse>;
  createRole(role: RoleCreate): Promise<Role>;
  updateRole(role: RoleUpdate): Promise<Role>;
  deleteRole(roleKey: string): Promise<DeleteResponse>;
  assignRole(roleAssignment: RoleAssignmentCreate): Promise<RoleAssignment>;
  unassignRole(roleAssignment: RoleAssignmentRemove): Promise<DeleteResponse>;
  // unassignRole(roleAssignmentId: string): Promise<DeleteResponse>;
}

export interface IApiClient {
  api: IPermitApi;
}

export class ApiClient implements IApiClient {
  private client: AxiosInstance = axios.create();
  public userUrl: string;
  public resourceUrl: string;
  public roleUrl: string;
  public tenantUrl: string;
  public roleAssignementsUrl: string;

  constructor(private config: IPermitConfig, private logger: Logger) {
    this.userUrl = `/facts/${this.config.project}/${this.config.environment}/users`;
    this.resourceUrl = `/schema/${this.config.project}/${this.config.environment}/resources`;
    this.roleUrl = `/schema/${this.config.project}/${this.config.environment}/roles`;
    this.tenantUrl = `/facts/${this.config.project}/${this.config.environment}/tenants`;
    this.roleAssignementsUrl = `/facts/${this.config.project}/${this.config.environment}/role_assignments`;

    this.client = axios.create({
      baseURL: `${this.config.permitUrl}/v2`,
      headers: {
        Cookie: 'permit_session',
      },
    });
    // to debug axios requests
    // this.client.interceptors.request.use(request => {
    //   console.log('Starting Request', JSON.stringify(request, null, 2))
    //   return request
    // })
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
      .get(this.userUrl)
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
      .get(`${this.roleUrl}/${roleKey}`)
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
      .get(this.roleUrl)
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
      .get(`${this.tenantUrl}/${tenantKey}`)
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
      .get(`${this.tenantUrl}`)
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
      .get(`${this.resourceUrl}`)
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
      .get(`${this.resourceUrl}/${resourceKey}`)
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
      .get(`${this.resourceUrl}/${resourceKey}/actions`)
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
      .get(`${this.resourceUrl}/${resourceKey}/actions/${actionKey}`)
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
  public async createUser(user: UserCreate): Promise<User> {
    this.logger.info(`permit.api.createUser(${JSON.stringify(user)})`);
    return await this.client
      .post<User>(this.userUrl, user)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to create user with key: ${user.key}, got error: ${error}`);
        throw error;
      });
  }

  public async updateUser(user: UserUpdate): Promise<User> {
    this.logger.info(`permit.api.updateUser(${JSON.stringify(user)})`);
    return await this.client
      .put<User>(this.userUrl, user)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to update user with name: ${user.firstName}, got error: ${error}`);
        throw error;
      });
  }

  public async deleteUser(userKey: string): Promise<DeleteResponse> {
    this.logger.info(`permit.api.deleteUser(${JSON.stringify(userKey)})`);
    return await this.client
      .put<DeleteResponse>(`${this.config.project}/${this.config.environment}/users/${userKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to delete user with key: ${userKey}, got error: ${error}`);
        throw error;
      });
  }
  public async createTenant(tenant: TenantCreate): Promise<Tenant> {
    this.logger.info(`permit.api.createTenant(${JSON.stringify(tenant)})`);
    return await this.client
      .post<Tenant>(`${this.tenantUrl}`, tenant)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to create tenant with key: ${tenant.key}, got error: ${error}`);
        throw error;
      });
  }

  public async updateTenant(tenant: TenantUpdate): Promise<Tenant> {
    this.logger.info(`permit.api.updateTenant(${JSON.stringify(tenant)})`);
    return await this.client
      .put<Tenant>(`${this.tenantUrl}`, tenant)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to update tenant with name: ${tenant.name}, got error: ${error}`);
        throw error;
      });
  }
  public async deleteTenant(tenantKey: string): Promise<DeleteResponse> {
    this.logger.info(`permit.api.deleteTenant(${JSON.stringify(tenantKey)})`);
    return await this.client
      .put<DeleteResponse>(`${this.tenantUrl}/${tenantKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to delete tenant with key: ${tenantKey}, got error: ${error}`);
        throw error;
      });
  }

  public async createResource(resource: ResourceCreate): Promise<Resource> {
    this.logger.info(`permit.api.createResource(${JSON.stringify(resource)})`);
    return await this.client
      .post<Resource>(`${this.resourceUrl}`, resource)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `tried to create resource with key: ${resource.key}, got error: ${error}`,
        );
        throw error;
      });
  }

  public async updateResource(resource: ResourceUpdate): Promise<Resource> {
    this.logger.info(`permit.api.updateResource(${JSON.stringify(resource)})`);
    return await this.client
      .put<Resource>(`${this.resourceUrl}`, resource)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `tried to update resource with name: ${resource.name}, got error: ${error}`,
        );
        throw error;
      });
  }

  public async deleteResource(resourceKey: string): Promise<DeleteResponse> {
    this.logger.info(`permit.api.deleteResource(${JSON.stringify(resourceKey)})`);
    return await this.client
      .put<DeleteResponse>(`${this.resourceUrl}/${resourceKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to delete resource with key: ${resourceKey}, got error: ${error}`);
        throw error;
      });
  }

  public async createRole(role: RoleCreate): Promise<Role> {
    this.logger.info(`permit.api.createRole(${JSON.stringify(role)})`);
    return await this.client
      .post<Role>(this.roleUrl, role)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to create role with key: ${role.key}, got error: ${error}`);
        throw error;
      });
  }

  public async updateRole(role: RoleUpdate): Promise<Role> {
    this.logger.info(`permit.api.updateRole(${JSON.stringify(role)})`);
    return await this.client
      .put<Role>(this.roleUrl, role)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to update role with name: ${role.name}, got error: ${error}`);
        throw error;
      });
  }

  public async deleteRole(roleKey: string): Promise<DeleteResponse> {
    this.logger.info(`permit.api.deleteRole(${JSON.stringify(roleKey)})`);
    return await this.client
      .put<DeleteResponse>(`${this.roleUrl}/${roleKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(`tried to delete role with key: ${roleKey}, got error: ${error}`);
        throw error;
      });
  }

  public async createResourceAction(
    resourceKey: string,
    resourceAction: ResourceActionCreate,
  ): Promise<ResourceAction> {
    this.logger.info(`permit.api.createResourceAction(${JSON.stringify(resourceAction)})`);
    return await this.client
      .post<ResourceAction>(`${this.resourceUrl}/${resourceKey}/actions`, resourceAction)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `tried to create resourceAction with key: ${resourceAction.key}, got error: ${error}`,
        );
        throw error;
      });
  }

  public async updateResourceAction(
    resourceKey: string,
    resourceAction: ResourceActionUpdate,
  ): Promise<ResourceAction> {
    this.logger.info(`permit.api.updateResourceAction(${JSON.stringify(resourceAction)})`);
    return await this.client
      .put<ResourceAction>(`${this.resourceUrl}/${resourceKey}/actions`, resourceAction)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `tried to update resourceAction with name: ${resourceAction.name}, got error: ${error}`,
        );
        throw error;
      });
  }

  public async deleteResourceAction(
    resourceKey: string,
    resourceActionKey: string,
  ): Promise<DeleteResponse> {
    this.logger.info(`permit.api.deleteResourceAction(${JSON.stringify(resourceActionKey)})`);
    return await this.client
      .put<DeleteResponse>(`${this.resourceUrl}/${resourceKey}/actions/${resourceActionKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `tried to delete resourceAction with key: ${resourceActionKey}, got error: ${error}`,
        );
        throw error;
      });
  }

  // role mutations
  public async assignRole(roleAssignment: RoleAssignmentCreate): Promise<RoleAssignment> {
    const data: RoleAssignmentCreate = {
      role: roleAssignment.role,
      user: roleAssignment.user,
      tenant: roleAssignment.tenant,
    };

    this.logger.info(`permit.api.assignRole(${JSON.stringify(data)})`);

    return await this.client
      .post<RoleAssignment>(this.roleAssignementsUrl, data)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `could not assign role ${roleAssignment.role} to ${roleAssignment.user} in tenant ${roleAssignment.tenant}, got error: ${error}`,
        );
        throw error;
      });
  }

  public async unassignRole(roleAssignment: RoleAssignmentRemove): Promise<DeleteResponse> {
    const data: RoleAssignmentRemove = {
      role: roleAssignment.role,
      user: roleAssignment.user,
      tenant: roleAssignment.tenant,
    };
    this.logger.info(`permit.api.assignRole(${JSON.stringify(data)})`);

    return await this.client
      .delete<DeleteResponse>(this.roleAssignementsUrl, { data })
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `could not unassign role ${roleAssignment.role} of ${roleAssignment.user} in tenant ${roleAssignment.tenant}, got error: ${error}`,
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
      // todo
      // getAssignedRoles: this.getAssignedRoles.bind(this),
      // getCurrentOrganization: this.getCurrentOrganization.bind(this),
      // getCurrentProject: this.getCurrentProject.bind(this),
      // getCurrentEnvironment: this.getCurrentEnvironment.bind(this),

      // think about
      // getLastUpdateFromServer: this.getLastUpdateFromServer.bind(this),
      // getUptime: this.getUptime.bind(this),

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
      createResourceAction: this.createResourceAction.bind(this),
      updateResourceAction: this.updateResourceAction.bind(this),
      deleteResourceAction: this.deleteResourceAction.bind(this),
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
