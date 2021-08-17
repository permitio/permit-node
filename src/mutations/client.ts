import axios, { AxiosInstance } from 'axios'; // eslint-disable-line
import { Logger } from 'winston';

import { IAuthorizonConfig } from '../config';
import { Dict } from '../utils/dict';
import { IUser } from '../enforcement/interfaces';

export interface ITenant {
  key: string;
  name: string;
  description?: string;
}

/**
 * This interface contains *read actions* that goes outside
 * of your local network and queries authorizon cloud api.
 * You should be aware that these actions incur some cross-cloud latency.
 */
export interface IAuthorizonCloudReads {
  getUser(userKey: string): Promise<Dict>;
  getRole(roleKey: string): Promise<Dict>;
  getTenant(tenantKey: string): Promise<Dict>;
  getAssignedRoles(userKey: string, tenantKey?: string): Promise<Dict | Error>; // either in one tenant or in all tenants
}

/**
 * This interface contains *write actions* (or mutations) that manipulate remote
 * state by calling the authorizon api. These api calls goes *outside* your local network.
 * You should be aware that these actions incur some cross-cloud latency.
 */
export interface IAuthorizonCloudMutations {
  // user mutations
  syncUser(user: IUser): Promise<Dict | Error>; // create or update
  deleteUser(userKey: string): Promise<number | Error>;

  // tenant mutations
  createTenant(tenant: ITenant): Promise<Dict | Error>;
  updateTenant(tenant: ITenant): Promise<Dict | Error>;
  deleteTenant(tenantKey: string): Promise<number | Error>;

  // role mutations
  assignRole(userKey: string, roleKey: string, tenantKey: string): Promise<Dict | Error>;
  unassignRole(userKey: string, roleKey: string, tenantKey: string): Promise<Dict | Error>;
}

export interface CloudReadCallback<T = void> {
  (api: IAuthorizonCloudReads): Promise<T>;
}

export interface CloudWriteCallback<T = void> {
  (api: IAuthorizonCloudMutations): Promise<T>;
}

export interface IMutationsClient {
  read<T = void>(callback: CloudReadCallback<T>): Promise<T>;
  save<T = void>(callback: CloudWriteCallback<T>): Promise<T>;
}

export class MutationsClient implements IAuthorizonCloudReads, IAuthorizonCloudMutations, IMutationsClient {
  private client: AxiosInstance = axios.create();

  constructor(private config: IAuthorizonConfig, private logger: Logger) {
    this.client = axios.create({
      baseURL: `${this.config.sidecarUrl}/`,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
      },
    });
  }

  // read api -----------------------------------------------------------------
  public async getUser(userKey: string): Promise<Dict> {
    if (this.config.debugMode) {
      this.logger.info(`authorizon.api.getUser(${userKey})`);
    }
    return this.client.get(`cloud/users/${userKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `tried to get user with key: ${userKey}, got error: ${error}`
        );
      });
  }

  public async getRole(roleKey: string): Promise<Dict> {
    if (this.config.debugMode) {
      this.logger.info(`authorizon.api.getRole(${roleKey})`);
    }
    return this.client.get(`cloud/roles/${roleKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `tried to get role with id: ${roleKey}, got error: ${error}`
        );
      });
  }

  public async getTenant(tenantKey: string): Promise<Dict> {
    if (this.config.debugMode) {
      this.logger.info(`authorizon.api.getTenant(${tenantKey})`);
    }
    return this.client.get(`cloud/tenants/${tenantKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `tried to get tenant with id: ${tenantKey}, got error: ${error}`
        );
      });
  }

  // either in one tenant or in all tenants
  // TODO: fix schema
  public async getAssignedRoles(userKey: string, tenantKey?: string): Promise<Dict | Error> {
    if (this.config.debugMode) {
      this.logger.info(`authorizon.api.getAssignedRoles(user=${userKey}, tenant=${tenantKey})`);
    }
    let url = `cloud/role_assignments?user=${userKey}`;
    if (tenantKey !== undefined) {
      url += `&tenant=${tenantKey}`;
    }
    return await this.client
      .get<Dict>(url)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `could not get user roles for user ${userKey}, got error: ${error}`
        );
        return error;
      });
  }

  // write api ----------------------------------------------------------------
  // user mutations
  public async syncUser(user: IUser): Promise<Dict | Error> {
    if (this.config.debugMode) {
      this.logger.info(`authorizon.api.syncUser(${JSON.stringify(user)})`);
    }
    return await this.client
      .put<Dict>('cloud/users', user)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `tried to sync user with key: ${user.key}, got error: ${error}`
        );
        return error;
      });
  }

  public async deleteUser(userKey: string): Promise<number | Error> {
    if (this.config.debugMode) {
      this.logger.info(`authorizon.api.deleteUser(${userKey})`);
    }
    return await this.client.delete(`cloud/users/${userKey}`)
      .then((response) => {
        return response.status;
      })
      .catch((error: Error) => {
        this.logger.error(
          `tried to delete user with key: ${userKey}, got error: ${error}`
        );
        return error;
      });
  }

  // tenant mutations
  public async createTenant(tenant: ITenant): Promise<Dict | Error> {
    if (this.config.debugMode) {
      this.logger.info(`authorizon.api.createTenant(${JSON.stringify(tenant)})`);
    }
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
        this.logger.error(
          `tried to create tenant with key: ${tenant.key}, got error: ${error}`
        );
        return error;
      });
  }

  public async updateTenant(tenant: ITenant): Promise<Dict | Error> {
    if (this.config.debugMode) {
      this.logger.info(`authorizon.api.updateTenant(${JSON.stringify(tenant)})`);
    }
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
        this.logger.error(
          `tried to update tenant with key: ${tenant.key}, got error: ${error}`
        );
        return error;
      });
  }

  public async deleteTenant(tenantKey: string): Promise<number | Error> {
    if (this.config.debugMode) {
      this.logger.info(`authorizon.api.deleteTenant(${tenantKey})`);
    }
    return await this.client
      .delete(`cloud/tenants/${tenantKey}`)
      .then((response) => {
        return response.status;
      })
      .catch((error: Error) => {
        this.logger.error(
          `tried to delete tenant with key: ${tenantKey}, got error: ${error}`
        );
        return error;
      });
  }

  // role mutations
  public async assignRole(
    userKey: string,
    roleKey: string,
    tenantKey: string
  ): Promise<Dict | Error> {
    const data = {
      role: roleKey,
      user: userKey,
      scope: tenantKey,
    };

    if (this.config.debugMode) {
      this.logger.info(`authorizon.api.assignRole(${JSON.stringify(data)})`);
    }

    return await this.client
      .post<Dict>('cloud/role_assignments', data)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `could not assign role ${roleKey} to ${userKey} in tenant ${tenantKey}, got error: ${error}`
        );
        return error;
      });
  }

  public async unassignRole(
    userKey: string,
    roleKey: string,
    tenantKey: string
  ): Promise<Dict | Error> {
    if (this.config.debugMode) {
      const data = {
        role: roleKey,
        user: userKey,
        scope: tenantKey,
      };
      this.logger.info(`authorizon.api.assignRole(${JSON.stringify(data)})`);
    }

    return await this.client
      .delete<Dict>(`cloud/role_assignments?role=${roleKey}&user=${userKey}&scope=${tenantKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        this.logger.error(
          `could not unassign role ${roleKey} of ${userKey} in tenant ${tenantKey}, got error: ${error}`
        );
        return error;
      });
  }

  // cloud api proxy ----------------------------------------------------------
  public async read<T = void>(callback: CloudReadCallback<T>): Promise<T> {
    const readProxy: IAuthorizonCloudReads = {
      getUser: this.getUser.bind(this),
      getRole: this.getRole.bind(this),
      getTenant: this.getTenant.bind(this),
      getAssignedRoles: this.getAssignedRoles.bind(this),
    };
    return await callback(readProxy);
  }

  public async save<T = void>(callback: CloudWriteCallback<T>): Promise<T> {
    const writeProxy: IAuthorizonCloudMutations = {
      syncUser: this.syncUser.bind(this),
      deleteUser: this.deleteUser.bind(this),
      createTenant: this.createTenant.bind(this),
      updateTenant: this.updateTenant.bind(this),
      deleteTenant: this.deleteTenant.bind(this),
      assignRole: this.assignRole.bind(this),
      unassignRole: this.unassignRole.bind(this),
    };
    return await callback(writeProxy);
  }

  public getMethods(): IMutationsClient {
    return {
      read: this.read.bind(this),
      save: this.save.bind(this),
    }
  }
}
