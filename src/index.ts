// For Default export
import winston from 'winston';

import { ApiClient, IApiClient } from './api/api-client';
import { ElementsClient, IElementsApiClient } from './api/elements';
import { ConfigFactory, IPermitConfig } from './config';
import { Enforcer, IEnforcer } from './enforcement/enforcer';
import { LoggerFactory } from './logger';
import { RecursivePartial } from './utils/types';

// exported interfaces
export { IUser, IAction, IResource } from './enforcement/interfaces';
export { IReadApis, IWriteApis } from './api/api-client';
export { Context, ContextTransform } from './utils/context';

export interface IPermitClient extends IEnforcer, IApiClient, IElementsApiClient {
  config: IPermitConfig;
}

/**
 * Permit.io SDK for Node.js
 *
 * You can use this class to enforce permissions in your app.
 *
 * Usage:
 * const permit = new Permit.init({ ... }); // receives a config object of type IPermitConfig
 * const permitted = await permit.check(user, action, resource);
 */
class _Permit {
  private _config: IPermitConfig;
  private _logger: winston.Logger;
  private _api: ApiClient;
  private _enforcer: Enforcer;
  private _elements: ElementsClient;

  constructor(config: RecursivePartial<IPermitConfig>) {
    this._config = ConfigFactory.build(config);
    this._logger = LoggerFactory.createLogger(this._config);
    this._api = new ApiClient(this._config, this._logger);

    this._enforcer = new Enforcer(this._config, this._logger);
    this._elements = new ElementsClient(this._config, this._logger);

    this._logger.debug(
      `Permit.io SDK initialized with config:\n${JSON.stringify(this._config, undefined, 2)}`,
    );

    Object.assign(this, {
      // config
      config: Object.freeze(this._config),

      // exposed methods from specialized clients
      ...this._enforcer.getMethods(),
      ...this._api.getMethods(),
      ...this._elements.getMethods(),
    });
  }
}

type Permit = _Permit & IPermitClient;
export const Permit = _Permit as new (config: RecursivePartial<IPermitConfig>) => Permit;
