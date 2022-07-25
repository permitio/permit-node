// For Default export
import { ApiClient, IApiClient } from './api/client';
import { IPermitCache } from './cache/client';
import { ConfigFactory, IPermitConfig } from './config';
import { Enforcer, IEnforcer } from './enforcement/enforcer';
import { LoggerFactory } from './logger';
import { RecursivePartial } from './utils/types';

// exported interfaces
export { ISyncedUser, ISyncedRole, IPermitCache } from './cache/client';
export { IUser, IAction, IResource } from './enforcement/interfaces';
export { ResourceConfig, ActionConfig } from './resources/interfaces';
export { IUrlContext } from './resources/registry';
export { Context, ContextTransform } from './utils/context';

export interface IPermitClient extends IEnforcer, IApiClient {
  cache: IPermitCache;
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
  private _enforcer: Enforcer;
  private _apiClient: ApiClient;

  constructor(config: RecursivePartial<IPermitConfig>) {
    this._config = ConfigFactory.build(config);
    const logger = LoggerFactory.createLogger(this._config);

    this._enforcer = new Enforcer(this._config, logger);
    this._apiClient = new ApiClient(this._config, logger);

    logger.info(
      `Permit.io SDK initialized with config:\n${JSON.stringify(this._config, undefined, 2)}`,
    );
    logger.warn(
      'Debug mode is deprecated and will be removed in the next major version.\
                    You can control log level with log.logLevel property.',
    );

    Object.assign(this, {
      // config
      config: Object.freeze(this._config),

      // exposed methods from specialized clients
      ...this._enforcer.getMethods(),
      ...this._apiClient.getMethods(),
    });
  }
}

type Permit = _Permit & IPermitClient;
export const Permit = _Permit as new (config: RecursivePartial<IPermitConfig>) => Permit;
