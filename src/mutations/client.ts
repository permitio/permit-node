import axios, { AxiosInstance } from 'axios'; // eslint-disable-line

import { logger } from '../logger';

import { IAuthorizonConfig } from '../config';
import { Dict } from '../utils/dict';
import { IUser } from '../enforcement/interfaces';

export interface ITenant {
  key: string;
  name: string;
  description?: string;
}

export interface IAuthorizonReadTransaction {
  getUser(userKey: string): Promise<Dict>;
  getRole(roleKey: string): Promise<Dict>;
  getTenant(tenantKey: string): Promise<Dict>;
  getAssignedRoles(userKey: string, tenantKey?: string): Promise<Dict | Error>; // either in one tenant or in all tenants
}

export interface IAuthorizonWriteTransaction {
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

export interface IAuthorizonTransaction extends IAuthorizonReadTransaction, IAuthorizonWriteTransaction { }

export class MutationsClient implements IAuthorizonTransaction {
  private client: AxiosInstance = axios.create();

  constructor(private config: IAuthorizonConfig) {
    this.client = axios.create({
      baseURL: `${this.config.sidecarUrl}/`,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
      },
    });
  }

  // read api -----------------------------------------------------------------
  public async getUser(userKey: string): Promise<Dict> {
    return this.client.get(`cloud/users/${userKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `tried to get user with key: ${userKey}, got error: ${error}`
        );
      });
  }

  public async getRole(roleKey: string): Promise<Dict> {
    return this.client.get(`cloud/roles/${roleKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `tried to get role with id: ${roleKey}, got error: ${error}`
        );
      });
  }

  public async getTenant(tenantKey: string): Promise<Dict> {
    return this.client.get(`cloud/tenants/${tenantKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `tried to get org with id: ${tenantKey}, got error: ${error}`
        );
      });
  }

  // either in one tenant or in all tenants
  // TODO: fix schema
  public async getAssignedRoles(userKey: string, tenantKey?: string): Promise<Dict | Error> {
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
        logger.error(
          `could not get user roles for user ${userKey}, got error: ${error}`
        );
        return error;
      });
  }

  // write api ----------------------------------------------------------------
  // user mutations
  public async syncUser(user: IUser): Promise<Dict | Error> {
    return await this.client
      .put<Dict>('cloud/users', user)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `tried to sync user with key: ${user.key}, got error: ${error}`
        );
        return error;
      });
  }

  public async deleteUser(userKey: string): Promise<number | Error> {
    return await this.client.delete(`cloud/users/${userKey}`)
      .then((response) => {
        return response.status;
      })
      .catch((error: Error) => {
        logger.error(
          `tried to delete user with key: ${userKey}, got error: ${error}`
        );
        return error;
      });
  }

  // tenant mutations
  public async createTenant(tenant: ITenant): Promise<Dict | Error> {
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
        logger.error(
          `tried to create tenant with key: ${tenant.key}, got error: ${error}`
        );
        return error;
      });
  }

  public async updateTenant(tenant: ITenant): Promise<Dict | Error> {
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
        logger.error(
          `tried to update tenant with key: ${tenant.key}, got error: ${error}`
        );
        return error;
      });
  }

  public async deleteTenant(tenantKey: string): Promise<number | Error> {
    return await this.client
      .delete(`cloud/tenants/${tenantKey}`)
      .then((response) => {
        return response.status;
      })
      .catch((error: Error) => {
        logger.error(
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

    return await this.client
      .post<Dict>('cloud/role_assignments', data)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
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

    return await this.client
      .delete<Dict>(`cloud/role_assignments?role=${roleKey}&user=${userKey}&scope=${tenantKey}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `could not unassign role ${roleKey} of ${userKey} in tenant ${tenantKey}, got error: ${error}`
        );
        return error;
      });
  }

  // transaction api ----------------------------------------------------------
  // public async save(...mutations: IMutation[]): Promise<any[]> {
  //   const callbacks = mutations.map(m => m.callback);
  //   return Promise.all(callbacks.map(c => c()));
  // }
}
