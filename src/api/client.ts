import axios, { AxiosInstance, AxiosPromise } from 'axios';
import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import { IUser } from '../enforcement/interfaces';
import { Configuration, UserCreate, UserRead, UsersApi } from '../openapi';
import { Dict } from '../utils/dict';

/**
 * This interface contains *read actions* that goes outside
 * of your local network and queries permit.io cloud api.
 * You should be aware that these actions incur some cross-cloud latency.
 */
export interface IReadApis {
  // getUser(userKey: string): ReadOperation<Dict>;
  // getRole(roleKey: string): ReadOperation<Dict>;
  // getTenant(tenantKey: string): ReadOperation<Dict>;
  // getAssignedRoles(userKey: string, tenantKey?: string): ReadOperation<Dict>; // either in one tenant or in all tenants
}

/**
 * This interface contains *write actions* (or mutations) that manipulate remote
 * state by calling the permit.io api. These api calls goes *outside* your local network.
 * You should be aware that these actions incur some cross-cloud latency.
 */
export interface IWriteApis {
  createUser(user: UserCreate): Promise<[UserRead, boolean]>; // create or update

  // // user mutations
  // syncUser(user: IUser): WriteOperation<Dict>; // create or update
  // deleteUser(userKey: string): WriteOperation<Dict>;
  // // tenant mutations
  // createTenant(tenant: ITenant): WriteOperation<Dict>;
  // updateTenant(tenant: ITenant): WriteOperation<Dict>;
  // deleteTenant(tenantKey: string): WriteOperation<Dict>;
  // // role mutations
  // assignRole(userKey: string, roleKey: string, tenantKey: string): WriteOperation<Dict>;
  // unassignRole(userKey: string, roleKey: string, tenantKey: string): WriteOperation<Dict>;
}

export interface IPermitApi extends IReadApis, IWriteApis {}

export interface IApiClient {
  api: IPermitApi;
}

export class ApiClient implements IReadApis, IWriteApis, IApiClient {
  private project: string;
  private environment: string;
  private users: UsersApi;

  constructor(private config: IPermitConfig, private logger: Logger) {
    this.project = 'default';
    this.environment = 'prod';
    this.users = new UsersApi(
      new Configuration({
        basePath: `${this.config.apiUrl}/`,
        accessToken: this.config.token,
      }),
    );
  }

  public async createUser(user: UserCreate): Promise<[UserRead, boolean]> {
    const response = await this.users.createUser({
      projId: this.project,
      envId: this.environment,
      userCreate: user,
    });
    // TODO: add Promise.race() on optional timeout (config to allow the user to add a timeout on the api call)
    return [response.data, response.status === 201];
  }

  // // read api -----------------------------------------------------------------
  // public getUser(userKey: string): ReadOperation<Dict> {
  //   return new ReadOperation(async () => {
  //     this.logger.info(`permit.api.getUser(${userKey})`);
  //     return this.client
  //       .get(`cloud/users/${userKey}`)
  //       .then((response) => {
  //         return response.data;
  //       })
  //       .catch((error: Error) => {
  //         this.logger.error(`tried to get user with key: ${userKey}, got error: ${error}`);
  //         throw error;
  //       });
  //   });
  // }

  // public getRole(roleKey: string): ReadOperation<Dict> {
  //   return new ReadOperation(async () => {
  //     this.logger.info(`permit.api.getRole(${roleKey})`);
  //     return this.client
  //       .get(`cloud/roles/${roleKey}`)
  //       .then((response) => {
  //         return response.data;
  //       })
  //       .catch((error: Error) => {
  //         this.logger.error(`tried to get role with id: ${roleKey}, got error: ${error}`);
  //         throw error;
  //       });
  //   });
  // }

  // public getTenant(tenantKey: string): ReadOperation<Dict> {
  //   return new ReadOperation(async () => {
  //     this.logger.info(`permit.api.getTenant(${tenantKey})`);
  //     return this.client
  //       .get(`cloud/tenants/${tenantKey}`)
  //       .then((response) => {
  //         return response.data;
  //       })
  //       .catch((error: Error) => {
  //         this.logger.error(`tried to get tenant with id: ${tenantKey}, got error: ${error}`);
  //         throw error;
  //       });
  //   });
  // }

  // // either in one tenant or in all tenants
  // // TODO: fix schema
  // public getAssignedRoles(userKey: string, tenantKey?: string): ReadOperation<Dict> {
  //   return new ReadOperation(async () => {
  //     this.logger.info(`permit.api.getAssignedRoles(user=${userKey}, tenant=${tenantKey})`);
  //     let url = `cloud/role_assignments?user=${userKey}`;
  //     if (tenantKey !== undefined) {
  //       url += `&tenant=${tenantKey}`;
  //     }
  //     return await this.client
  //       .get<Dict>(url)
  //       .then((response) => {
  //         return response.data;
  //       })
  //       .catch((error: Error) => {
  //         this.logger.error(`could not get user roles for user ${userKey}, got error: ${error}`);
  //         throw error;
  //       });
  //   });
  // }

  // // write api ----------------------------------------------------------------
  // // user mutations
  // public syncUser(user: IUser): WriteOperation<Dict> {
  //   return new WriteOperation(async () => {
  //     this.logger.info(`permit.api.syncUser(${JSON.stringify(user)})`);
  //     return await this.client
  //       .put<Dict>('cloud/users', user)
  //       .then((response) => {
  //         return response.data;
  //       })
  //       .catch((error: Error) => {
  //         this.logger.error(`tried to sync user with key: ${user.key}, got error: ${error}`);
  //         throw error;
  //       });
  //   });
  // }

  // public deleteUser(userKey: string): WriteOperation<Dict> {
  //   return new WriteOperation(async () => {
  //     this.logger.info(`permit.api.deleteUser(${userKey})`);
  //     return await this.client
  //       .delete(`cloud/users/${userKey}`)
  //       .then((response) => {
  //         return { status: response.status };
  //       })
  //       .catch((error: Error) => {
  //         this.logger.error(`tried to delete user with key: ${userKey}, got error: ${error}`);
  //         throw error;
  //       });
  //   });
  // }

  // // tenant mutations
  // public createTenant(tenant: ITenant): WriteOperation<Dict> {
  //   return new WriteOperation(async () => {
  //     this.logger.info(`permit.api.createTenant(${JSON.stringify(tenant)})`);
  //     const data: Dict = {};
  //     data.externalId = tenant.key;
  //     data.name = tenant.name;
  //     if (tenant.description) {
  //       data.description = tenant.description;
  //     }

  //     return await this.client
  //       .put<Dict>('cloud/tenants', data)
  //       .then((response) => {
  //         return response.data;
  //       })
  //       .catch((error: Error) => {
  //         this.logger.error(`tried to create tenant with key: ${tenant.key}, got error: ${error}`);
  //         throw error;
  //       });
  //   });
  // }

  // public updateTenant(tenant: ITenant): WriteOperation<Dict> {
  //   return new WriteOperation(async () => {
  //     this.logger.info(`permit.api.updateTenant(${JSON.stringify(tenant)})`);
  //     const data: Dict = {};
  //     data.name = tenant.name;

  //     if (tenant.description) {
  //       data.description = tenant.description;
  //     }

  //     return await this.client
  //       .patch<Dict>(`cloud/tenants/${tenant.key}`, data)
  //       .then((response) => {
  //         return response.data;
  //       })
  //       .catch((error: Error) => {
  //         this.logger.error(`tried to update tenant with key: ${tenant.key}, got error: ${error}`);
  //         throw error;
  //       });
  //   });
  // }

  // public deleteTenant(tenantKey: string): WriteOperation<Dict> {
  //   return new WriteOperation(async () => {
  //     this.logger.info(`permit.api.deleteTenant(${tenantKey})`);
  //     return await this.client
  //       .delete(`cloud/tenants/${tenantKey}`)
  //       .then((response) => {
  //         return { status: response.status };
  //       })
  //       .catch((error: Error) => {
  //         this.logger.error(`tried to delete tenant with key: ${tenantKey}, got error: ${error}`);
  //         throw error;
  //       });
  //   });
  // }

  // // role mutations
  // public assignRole(userKey: string, roleKey: string, tenantKey: string): WriteOperation<Dict> {
  //   return new WriteOperation(async () => {
  //     const data = {
  //       role: roleKey,
  //       user: userKey,
  //       scope: tenantKey,
  //     };

  //     this.logger.info(`permit.api.assignRole(${JSON.stringify(data)})`);

  //     return await this.client
  //       .post<Dict>('cloud/role_assignments', data)
  //       .then((response) => {
  //         return response.data;
  //       })
  //       .catch((error: Error) => {
  //         this.logger.error(
  //           `could not assign role ${roleKey} to ${userKey} in tenant ${tenantKey}, got error: ${error}`,
  //         );
  //         throw error;
  //       });
  //   });
  // }

  // public unassignRole(userKey: string, roleKey: string, tenantKey: string): WriteOperation<Dict> {
  //   return new WriteOperation(async () => {
  //     const data = {
  //       role: roleKey,
  //       user: userKey,
  //       scope: tenantKey,
  //     };
  //     this.logger.info(`permit.api.assignRole(${JSON.stringify(data)})`);

  //     return await this.client
  //       .delete<Dict>(`cloud/role_assignments?role=${roleKey}&user=${userKey}&scope=${tenantKey}`)
  //       .then((response) => {
  //         return response.data;
  //       })
  //       .catch((error: Error) => {
  //         this.logger.error(
  //           `could not unassign role ${roleKey} of ${userKey} in tenant ${tenantKey}, got error: ${error}`,
  //         );
  //         throw error;
  //       });
  //   });
  // }

  public get api(): IPermitApi {
    return {
      // write methods
      createUser: this.createUser.bind(this),

      // // read methods
      // getUser: this.getUser.bind(this),
      // getRole: this.getRole.bind(this),
      // getTenant: this.getTenant.bind(this),
      // getAssignedRoles: this.getAssignedRoles.bind(this),
      // // write methods
      // syncUser: this.syncUser.bind(this),
      // deleteUser: this.deleteUser.bind(this),
      // createTenant: this.createTenant.bind(this),
      // updateTenant: this.updateTenant.bind(this),
      // deleteTenant: this.deleteTenant.bind(this),
      // assignRole: this.assignRole.bind(this),
      // unassignRole: this.unassignRole.bind(this),
    };
  }

  public getMethods(): IApiClient {
    return {
      api: this.api,
    };
  }
}
