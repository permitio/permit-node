import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import { UserRead } from '../openapi';

import { BasePermitApi } from './base';

export interface IPermitUsersApi {
  list(): Promise<UserRead[]>;
}

export class PermitUsersApi extends BasePermitApi implements IPermitUsersApi {
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
  }
  list(): Promise<UserRead[]> {
    throw new Error('Method not implemented.');
  }
}
