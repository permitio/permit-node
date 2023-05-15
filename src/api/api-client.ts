import { Logger } from 'winston';

import { IPermitConfig } from '../config';

import { DeprecatedApiClient, IDeprecatedPermitApi } from './deprecated';
import { IUsersApi, UsersApi } from './users';

export interface IPermitApi extends IDeprecatedPermitApi {
  users: IUsersApi;
}

export interface IApiClient {
  api: IPermitApi;
}

export class ApiClient {
  private deprecatedApi: DeprecatedApiClient;
  public users: IUsersApi;

  constructor(config: IPermitConfig, logger: Logger) {
    this.deprecatedApi = new DeprecatedApiClient(config, logger);
    this.users = new UsersApi(config, logger);
  }

  public get api(): IPermitApi {
    return {
      // deprecated
      ...this.deprecatedApi.getMethods(),
      // new api
      users: this.users,
    };
  }

  public getMethods(): IApiClient {
    return {
      api: this.api,
    };
  }
}
