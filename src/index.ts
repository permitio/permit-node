// For Default export
// import { IPermitCache, LocalCacheClient } from './cache/client';
import { ConfigFactory, IPermitConfig } from './config';
import { Enforcer, IEnforcer } from './enforcement/enforcer';
import { LoggerFactory } from './logger';
import { IApiClient, ApiClient } from './api/client';
import { RecursivePartial } from './utils/types';
import { ElementsClient, IElementsApiClient } from './elements/client';

// exported interfaces
export { ISyncedUser, ISyncedRole, IPermitCache } from './cache/client';
export { IUser, IAction, IResource } from './enforcement/interfaces';
export { IReadApis, IWriteApis } from './api/client';
export { Context, ContextTransform } from './utils/context';

export interface IPermitClient extends IEnforcer, IApiClient, IElementsApiClient {
  // cache: IPermitCache;
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
  // private _cache: LocalCacheClient;
  private _api: ApiClient;
  private _elements: ElementsClient;

  constructor(config: RecursivePartial<IPermitConfig>) {
    this._config = ConfigFactory.build(config);
    const logger = LoggerFactory.createLogger(this._config);
    this._enforcer = new Enforcer(this._config, logger);
    // this._cache = new LocalCacheClient(this._config, logger);
    this._api = new ApiClient(this._config, logger);
    this._elements = new ElementsClient(this._config, logger);
    logger.debug(
      `Permit.io SDK initialized with config:\n${JSON.stringify(this._config, undefined, 2)}`,
    );

    Object.assign(this, {
      // config
      config: Object.freeze(this._config),

      // exposed methods from specialized clients
      ...this._enforcer.getMethods(),
      ...this._api.getMethods(),
      ...this._elements.getMethods(),
      // cache: this._cache.getMethods(),
    });
  }
}

type Permit = _Permit & IPermitClient;
export const Permit = _Permit as new (config: RecursivePartial<IPermitConfig>) => Permit;
