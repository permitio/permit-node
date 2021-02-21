import axios, { AxiosError, AxiosInstance } from 'axios'; // eslint-disable-line

import { logger } from './logger';
import {
  resourceRegistry,
  ResourceDefinition,
  ActionDefinition,
  ResourceRegistry,
} from './registry';

import { ActionConfig, AuthorizonConfig, SyncedRole, SyncedUser } from './interface';


export interface SyncObjectResponse {
  id: string;
}

export interface OrgDefinition {
  id: string;
  name: string;
}

type Dict = Record<string, any>;

interface SyncUserRequest {
  id: string,
  data: Dict,
  initial_orgs?: { external_id: string, name: string }[],
  initial_roles?: string[]
}

const HTTP_404_NOT_FOUND: number = 404;

export class ResourceStub {
  constructor(public readonly resourceName: string) { }

  public action(config: ActionConfig): void {
    const action = new ActionDefinition(
      config.name,
      config.title,
      config.description,
      config.path,
      config.attributes || {}
    );
    authorizationClient.addActionToResource(this.resourceName, action);
  }
}

export class AuthorizationClient {
  private initialized: boolean = false;
  private registry: ResourceRegistry;
  private config: AuthorizonConfig = { token: '' };
  private client: AxiosInstance = axios.create();

  constructor() {
    this.registry = resourceRegistry;
  }

  public initialize(configOptions: AuthorizonConfig): void {
    this.initialized = true;
    this.config = configOptions;
    this.client = axios.create({
      baseURL: `${this.config.sidecarUrl}/`,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
      },
    });
    this.syncResources();
  }

  public get token(): string {
    this.throwIfNotInitialized();
    return this.config.token;
  }

  public addResource(resource: ResourceDefinition): ResourceStub {
    this.registry.addResource(resource);
    this.maybeSyncResource(resource);
    return new ResourceStub(resource.name);
  }

  public addActionToResource(
    resourceName: string,
    actionDef: ActionDefinition
  ): void {
    const action = this.registry.addActionToResource(resourceName, actionDef);
    if (action) {
      this.maybeSyncAction(action);
    }
  }

  private maybeSyncResource(resource: ResourceDefinition): void {
    if (this.initialized && !this.registry.isSynced(resource)) {
      logger.info(`syncing resource: ${resource.repr()}`);
      this.client
        .put<SyncObjectResponse>('cloud/resources', resource.dict())
        .then((response) => {
          this.registry.markAsSynced(resource, response.data.id);
        })
        .catch((error) => {
          logger.error(
            `tried to sync resource ${resource.name}, got error: ${error}`
          );
        });
    }
  }

  private maybeSyncAction(action: ActionDefinition): void {
    if (!action.resourceId) {
      return;
    }
    const resourceId: string = action.resourceId;

    if (this.initialized && !this.registry.isSynced(action)) {
      logger.info(`syncing action: ${action.repr()}`);
      this.client
        .put<SyncObjectResponse>(
          `cloud/resources/${resourceId}/actions`,
          action.dict()
        )
        .then((response) => {
          this.registry.markAsSynced(action, response.data.id);
        })
        .catch((error) => {
          logger.error(
            `tried to sync action ${action.name}, got error: ${error}`
          );
        });
    }
  }

  private syncResources(): void {
    // will also sync actions
    for (let resource of this.registry.resourceList) {
      this.maybeSyncResource(resource);
    }
  }

  public updatePolicy(): void {
    this.throwIfNotInitialized();
    this.client
      .post('update_policy')
      .catch((error) =>
        logger.error(`tried to trigger policy update, got error: ${error}`)
      );
  }

  public updatePolicyData(): void {
    this.throwIfNotInitialized();
    this.client
      .post('update_policy_data')
      .catch((error) =>
        logger.error(`tried to trigger policy update, got error: ${error}`)
      );
  }

  private throwIfNotInitialized() {
    if (!this.initialized) {
      throw new Error('You must call authorizon.init() first!');
    }
  }

  public async syncUser(userId: string, userData: Dict, initialOrgs?: OrgDefinition[], initialRoles?: string[]): Promise<Dict | Error> {
    this.throwIfNotInitialized();

    if (initialRoles && !initialOrgs) {
      throw new Error("You cannot assign initial roles for user without also assigning initial orgs!");
    }

    const data: SyncUserRequest = {
      id: userId,
      data: userData,
    };

    if (initialOrgs) {
      const orgs = initialOrgs.map(def => {
        return { external_id: def.id, name: def.name };
      });
      data['initial_orgs'] = orgs;
    }

    if (initialRoles) {
      data['initial_roles'] = initialRoles;
    }

    return await this.client
      .put<Dict>('cloud/users', data)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `tried to sync user with id: ${userId}, got error: ${error}`
        );
        return error;
      });
  }

  public async deleteUser(userId: string): Promise<void> {
    this.throwIfNotInitialized();

    this.client.delete(`cloud/users/${userId}`).catch((error: Error) => {
      logger.error(
        `tried to delete user with id: ${userId}, got error: ${error}`
      );
    });
  }

  public async syncOrg(
    orgId: string,
    orgName: string
    // orgMetadata: Dict = {}
  ): Promise<Dict | Error> {
    this.throwIfNotInitialized();
    const data = {
      external_id: orgId,
      name: orgName,
    };

    return await this.client
      .put<Dict>('cloud/organizations', data)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `tried to sync org with id: ${orgId}, got error: ${error}`
        );
        return error;
      });
  }

  public async deleteOrg(orgId: string): Promise<void> {
    this.throwIfNotInitialized();

    this.client.delete(`cloud/organizations/${orgId}`).catch((error: Error) => {
      logger.error(
        `tried to delete org with id: ${orgId}, got error: ${error}`
      );
    });
  }

  public async addUserToOrg(
    userId: string,
    orgId: string
  ): Promise<Dict | Error> {
    this.throwIfNotInitialized();
    const data = {
      "organizations": [orgId]
    };

    return await this.client
      .post<Dict>(`cloud/users/${userId}/organizations`, data)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `tried to assign user ${userId} to org ${orgId}, got error: ${error}`
        );
        return error;
      });
  }

  public async removeUserFromOrg(
    userId: string,
    orgId: string
  ): Promise<Dict | Error> {
    this.throwIfNotInitialized();
    const data = {
      "organizations": [orgId]
    };

    return await this.client
      .post<Dict>(`cloud/users/${userId}/organizations`, data)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `tried to remove user ${userId} from org ${orgId}, got error: ${error}`
        );
        return error;
      });
  }

  public async getOrgsForUser(userId: string): Promise<Dict | Error> {
    this.throwIfNotInitialized();
    return await this.client
      .get<Dict>(`cloud/users/${userId}/organizations`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `could not get user orgs for user: ${userId}, got error: ${error}`
        );
        return error;
      });
  }

  public async assignRole(
    role: string,
    userId: string,
    orgId: string
  ): Promise<Dict | Error> {
    this.throwIfNotInitialized();
    const data = {
      role: role,
      user: userId,
      scope: orgId,
    };

    return await this.client
      .post<Dict>('cloud/role_assignments', data)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `could not assign role ${role} to ${userId} in org ${orgId}, got error: ${error}`
        );
        return error;
      });
  }

  public async unassignRole(
    role: string,
    userId: string,
    orgId: string
  ): Promise<Dict | Error> {
    this.throwIfNotInitialized();

    return await this.client
      .delete<Dict>(`cloud/role_assignments?role=${role}&user=${userId}&scope=${orgId}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `could not unassign role ${role} of ${userId} in org ${orgId}, got error: ${error}`
        );
        return error;
      });
  }

  public async getUserRoles(userId: string, orgId: string): Promise<Dict | Error> {
    this.throwIfNotInitialized();
    return await this.client
      .get<Dict>(`cloud/users/${userId}/roles?organization=${orgId}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: Error) => {
        logger.error(
          `could not get user roles for user ${userId} in org ${orgId}, got error: ${error}`
        );
        return error;
      });
  }

  public async isUserSynced(userId: string): Promise<boolean> {
    const user = await this.getLocallyCachedUser(userId);
    if (user === null) {
      return false;
    }
    return (user.id === userId);
  }

  public async getLocallyCachedUser(userId: string): Promise<SyncedUser | null> {
    this.throwIfNotInitialized();
    return await this.client
      .get<SyncedUser>(`local/users/${userId}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            logger.error(
              `unexpected error when calling authorizon.getLocallyCachedUser(${userId}): ${error}`
            );
          }
        }
        return null;
      });
  }

  public async getLocallyCachedUserList(): Promise<SyncedUser[]> {
    this.throwIfNotInitialized();
    return await this.client
      .get<SyncedUser[]>(`local/users`)
      .then((response) => {
        return response.data;
      }).catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            logger.error(
              `unexpected error when calling authorizon.getLocallyCachedUserList(): ${error}`
            );
          }
        }
        return [];
      });
  }

  public async getLocallyCachedUserRoles(userId: string): Promise<SyncedRole[] | null> {
    this.throwIfNotInitialized();
    return await this.client
      .get<SyncedRole[]>(`local/users/${userId}/roles`)
      .then((response) => {
        return response.data;
      }).catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            logger.error(
              `unexpected error when calling authorizon.getLocallyCachedUserRoles(${userId}): ${error}`
            );
          }
        }
        return null; // indicate user is not synced
      });
  }

  public async getLocallyCachedRoleList(): Promise<SyncedRole[]> {
    this.throwIfNotInitialized();
    return await this.client
      .get<SyncedRole[]>(`local/roles`)
      .then((response) => {
        return response.data;
      }).catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            logger.error(
              `unexpected error when calling authorizon.getLocallyCachedRoleList(): ${error}`
            );
          }
        }
        return [];
      });
  }

  public async getLocallyCachedRoleById(roleId: string): Promise<SyncedRole | null> {
    this.throwIfNotInitialized();
    return await this.client
      .get<SyncedRole>(`local/roles/${roleId}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            logger.error(
              `unexpected error when calling authorizon.getLocallyCachedRoleById(${roleId}): ${error}`
            );
          }
        }
        return null;
      });
  }

  public async getLocallyCachedRoleByName(roleName: string): Promise<SyncedRole | null> {
    this.throwIfNotInitialized();
    return await this.client
      .get<SyncedRole>(`local/roles/by-name/${roleName}`)
      .then((response) => {
        return response.data;
      })
      .catch((error: AxiosError) => {
        if (error.response) {
          if (error.response.status !== HTTP_404_NOT_FOUND) {
            logger.error(
              `unexpected error when calling authorizon.getLocallyCachedRoleByName(${roleName}): ${error}`
            );
          }
        }
        return null;
      });
  }


}

export const authorizationClient = new AuthorizationClient();
