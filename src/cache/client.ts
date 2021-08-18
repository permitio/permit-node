import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios'; // eslint-disable-line
import { Logger } from 'winston';

import { IAuthorizonConfig } from '../config';

const HTTP_404_NOT_FOUND: number = 404;

export interface ISyncedRole {
  id: string;
  name: string;
  tenant_id?: string;
  metadata?: Record<string, any>;
  permissions?: string[];
}

export interface ISyncedUser {
  id: string;
  name?: string;
  email?: string;
  metadata?: Record<string, any>;
  roles: ISyncedRole[];
}

export interface IAuthorizonCache {
  isUser(userId: string): Promise<boolean>;
  getUser(userId: string): Promise<ISyncedUser | null>;
  getUsers(): Promise<ISyncedUser[]>;
  getUserTenants(userId: string): Promise<string[] | null>;
  getAssignedRoles(userId: string): Promise<ISyncedRole[] | null>;
  getRoles(): Promise<ISyncedRole[]>;
  getRoleById(roleId: string): Promise<ISyncedRole | null>;
  getRoleByName(roleName: string): Promise<ISyncedRole | null>;
  refresh(): Promise<boolean>;
}

/**
 * The LocalCacheClient is able to fetch the latest cached (i.e: synced)
 * state from the policy agent (i.e: OPA). This client is very performant
 * and DOES NOT go outside the local network (i.e: VPC), in other words,
 * queries made by this client are complete private, and do not reach
 * the authorizon control plane in the cloud.
 */
export class LocalCacheClient implements IAuthorizonCache {
  private client: AxiosInstance;

  constructor(private config: IAuthorizonConfig, private logger: Logger) {
    this.client = axios.create({
      baseURL: `${this.config.sidecarUrl}/`,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
      },
    });
  }

  public async isUser(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (user === null) {
      return false;
    }
    return (user.id === userId);
  }

  // cached object api
  public async getUser(userId: string): Promise<ISyncedUser | null> {
    return await this.client
      .get<ISyncedUser>(`local/users/${userId}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            this.logger.error(
              `unexpected error when calling authorizon.cache.getUser(${userId}): ${error}`
            );
          }
        }
        return null;
      });
  }

  public async getUsers(): Promise<ISyncedUser[]> {
    return await this.client
      .get<ISyncedUser[]>(`local/users`)
      .then((response) => {
        return response.data;
      }).catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            this.logger.error(
              `unexpected error when calling authorizon.cache.getUsers(): ${error}`
            );
          }
        }
        return [];
      });
  }

  public async getUserTenants(userId: string): Promise<string[] | null> {
    return await this.client
      .get<string[]>(`local/users/${userId}/tenants`)
      .then((response) => {
        return response.data;
      }).catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            this.logger.error(
              `unexpected error when calling authorizon.cache.getUserTenants(${userId}): ${error}`
            );
          }
        }
        return null; // indicate user is not synced
      });
  }

  public async getAssignedRoles(userId: string): Promise<ISyncedRole[] | null> {
    return await this.client
      .get<ISyncedRole[]>(`local/users/${userId}/roles`)
      .then((response) => {
        return response.data;
      }).catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            this.logger.error(
              `unexpected error when calling authorizon.cache.getAssignedRoles(${userId}): ${error}`
            );
          }
        }
        return null; // indicate user is not synced
      });
  }

  public async getRoles(): Promise<ISyncedRole[]> {
    return await this.client
      .get<ISyncedRole[]>(`local/roles`)
      .then((response) => {
        return response.data;
      }).catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            this.logger.error(
              `unexpected error when calling authorizon.cache.getRoles(): ${error}`
            );
          }
        }
        return [];
      });
  }

  public async getRoleById(roleId: string): Promise<ISyncedRole | null> {
    return await this.client
      .get<ISyncedRole>(`local/roles/${roleId}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            this.logger.error(
              `unexpected error when calling authorizon.cache.getRoleById(${roleId}): ${error}`
            );
          }
        }
        return null;
      });
  }

  public async getRoleByName(roleName: string): Promise<ISyncedRole | null> {
    return await this.client
      .get<ISyncedRole>(`local/roles/by-name/${roleName}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            this.logger.error(
              `unexpected error when calling authorizon.cache.getRoleByName(${roleName}): ${error}`
            );
          }
        }
        return null;
      });
  }

  private async updatePolicy(): Promise<boolean> {
    return this.client
      .post('policy-updater/trigger')
      .then((response: AxiosResponse) => {
        return (response.status == 200);
      })
      .catch((error) => {
        this.logger.error(`tried to trigger policy update, got error: ${error}`);
        return false;
      });
  }

  private async updatePolicyData(): Promise<boolean> {
    return this.client
      .post('data-updater/trigger')
      .then((response: AxiosResponse) => {
        return (response.status == 200);
      })
      .catch((error) => {
        this.logger.error(`tried to trigger policy update, got error: ${error}`)
        return false;
      });
  }

  public async refresh(): Promise<boolean> {
    return this.updatePolicy().then((triggered) => {
      if (!triggered) return false;

      return this.updatePolicyData().then((triggered) => {
        return triggered;
      });
    });
  }

  public getMethods(): IAuthorizonCache {
    return {
      isUser: this.isUser.bind(this),
      getUser: this.getUser.bind(this),
      getUsers: this.getUsers.bind(this),
      getUserTenants: this.getUserTenants.bind(this),
      getAssignedRoles: this.getAssignedRoles.bind(this),
      getRoles: this.getRoles.bind(this),
      getRoleById: this.getRoleById.bind(this),
      getRoleByName: this.getRoleByName.bind(this),
      refresh: this.refresh.bind(this),
    }
  }
}
