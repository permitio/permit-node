// For Default export
import { IPermitCache, LocalCacheClient } from './cache/client';
import { ConfigFactory, IPermitConfig } from './config';
import { Enforcer, IEnforcer } from './enforcement/enforcer';
import { LoggerFactory } from './logger';
import { IMutationsClient, MutationsClient } from './mutations/client';
import { RecursivePartial } from './utils/types';

// exported interfaces
export { ISyncedUser, ISyncedRole, IPermitCache } from './cache/client';
export { IUser, IAction, IResource } from './enforcement/interfaces';
export { ITenant, IReadApis, IWriteApis } from './mutations/client';
export { Context, ContextTransform } from './utils/context';

export interface IPermitClient extends IEnforcer, IMutationsClient {
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
  private _cache: LocalCacheClient;
  private _mutationsClient: MutationsClient;

  constructor(config: RecursivePartial<IPermitConfig>) {
    this._config = ConfigFactory.build(config);
    const logger = LoggerFactory.createLogger(this._config);
    this._enforcer = new Enforcer(this._config, logger);
    this._cache = new LocalCacheClient(this._config, logger);
    this._mutationsClient = new MutationsClient(this._config, logger);
    logger.info(
      `Permit.io SDK initialized with config:\n${JSON.stringify(this._config, undefined, 2)}`,
    );

    Object.assign(this, {
      // config
      config: Object.freeze(this._config),

      // exposed methods from specialized clients
      ...this._enforcer.getMethods(),
      ...this._mutationsClient.getMethods(),
      cache: this._cache.getMethods(),
    });
  }
}

type Permit = _Permit & IPermitClient;
export const Permit = _Permit as new (config: RecursivePartial<IPermitConfig>) => Permit;
