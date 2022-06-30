// For Default export
import { IPermitCache, LocalCacheClient } from './cache/client';
import { ConfigFactory, IPermitConfig } from './config';
import { Enforcer, IEnforcer } from './enforcement/enforcer';
import { AppManager } from './instrument/appManager';
import { decorate, IDecoratingObject } from './instrument/decorator';
import { hook } from './instrument/plugin';
import { LoggerFactory } from './logger';
import { IMutationsClient, MutationsClient } from './mutations/client';
import { IResourceRegistry, ResourceRegistry } from './resources/registry';
import { IResourceReporter, ResourceReporter } from './resources/reporter';
import { RecursivePartial } from './utils/types';

// exported interfaces
export { ISyncedUser, ISyncedRole, IPermitCache } from './cache/client';
export { IUser, IAction, IResource } from './enforcement/interfaces';
export { ITenant, IReadApis, IWriteApis } from './mutations/client';
export { ResourceConfig, ActionConfig } from './resources/interfaces';
export { IUrlContext } from './resources/registry';
export { Context, ContextTransform } from './utils/context';

export interface IPermitClient
  extends IResourceReporter,
    IEnforcer,
    IMutationsClient,
    IResourceRegistry,
    IDecoratingObject {
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
  private _resourceRegistry: ResourceRegistry;
  private _resourceReporter: ResourceReporter;
  private _enforcer: Enforcer;
  private _cache: LocalCacheClient;
  private _mutationsClient: MutationsClient;
  private _appManager: AppManager;

  constructor(config: RecursivePartial<IPermitConfig>) {
    this._config = ConfigFactory.build(config);
    const logger = LoggerFactory.createLogger(this._config);

    this._resourceRegistry = new ResourceRegistry();
    this._resourceReporter = new ResourceReporter(this._config, this._resourceRegistry, logger);
    this._enforcer = new Enforcer(this._config, logger);
    this._cache = new LocalCacheClient(this._config, logger);
    this._mutationsClient = new MutationsClient(this._config, logger);
    this._appManager = new AppManager(this._config, this._resourceReporter, logger);
    logger.info(
      `Permit.io SDK initialized with config:\n${JSON.stringify(this._config, undefined, 2)}`,
    );
    if (this._config.debugMode) {
      logger.warn(
        'Debug mode is deprecated and will be removed in the next major version.\
                    You can control log level with log.logLevel property.',
      );
    }

    // if auto mapping is enabled, hook into the http/https functions
    if (this._config.autoMapping.enable) {
      hook(this._appManager, logger);
    }

    Object.assign(this, {
      // config
      config: Object.freeze(this._config),

      // exposed methods from specialized clients
      ...this._enforcer.getMethods(),
      ...this._resourceReporter.getMethods(),
      ...this._mutationsClient.getMethods(),
      cache: this._cache.getMethods(),

      // resource registry (url mapper)
      ...this._resourceRegistry.getMethods(),

      // instrumentation methods
      decorate: decorate,
    });
  }
}

type Permit = _Permit & IPermitClient;
export const Permit = _Permit as new (config: RecursivePartial<IPermitConfig>) => Permit;
