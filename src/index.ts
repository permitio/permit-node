// For Default export
import { EventEmitter } from 'events';
import { decorate, IDecoratingObject } from './instrument/decorator';
import { hook } from './instrument/plugin';
import { ConfigFactory, IPermitConfig } from './config';
import { IPermitCache, LocalCacheClient } from './cache/client';
import { IResourceRegistry, ResourceRegistry } from './resources/registry';
import { IResourceReporter, ResourceReporter } from './resources/reporter';
import { Enforcer, IEnforcer } from './enforcement/enforcer';
import { AppManager } from './instrument/appManager';
import { IMutationsClient, MutationsClient } from './mutations/client';
import { LoggerFactory } from './logger';
import { RecursivePartial } from './utils/types';

// exported interfaces
export { ISyncedUser, ISyncedRole, IPermitCache } from './cache/client';
export { IUser, IAction, IResource } from './enforcement/interfaces';
export {
  ITenant,
  IPermitCloudReads,
  IPermitCloudMutations,
} from './mutations/client';
export { ResourceConfig, ActionConfig } from './resources/interfaces';
export { IUrlContext } from './resources/registry';
export { Context, ContextTransform } from './utils/context';

interface IEventSubscriber {
  on(event: string | symbol, listener: (...args: any[]) => void): EventEmitter;
  once(
    event: string | symbol,
    listener: (...args: any[]) => void
  ): EventEmitter;
}

export interface IPermitClient
  extends IEventSubscriber,
    IResourceReporter,
    IEnforcer,
    IMutationsClient,
    IResourceRegistry,
    IDecoratingObject {
  cache: IPermitCache;
  config: IPermitConfig;
}

/**
 * The PermitSDK class is a simple factory that returns
 * an initialized IPermitClient object that the user can work with.
 *
 * The permit.io client can signal when its available.
 * all actions with the client should be after the 'ready' event has fired,
 * as shown below.
 *
 * usage example:
 * const permit: IPermitClient = PermitSDK.init({ // config });
 * permit.once('ready', () => {
 *  const permitted = await permit.check(user, action, resource);
 *  ...
 * })
 */
export class PermitSDK {
  public static init(config: RecursivePartial<IPermitConfig>): IPermitClient {
    const events = new EventEmitter();
    const configOptions = ConfigFactory.build(config);
    const logger = LoggerFactory.createLogger(configOptions);
    const resourceRegistry = new ResourceRegistry();
    const resourceReporter = new ResourceReporter(
      configOptions,
      resourceRegistry,
      logger
    );
    const enforcer = new Enforcer(configOptions, logger);
    const cache = new LocalCacheClient(configOptions, logger);
    const mutationsClient = new MutationsClient(configOptions, logger);
    const appManager = new AppManager(configOptions, resourceReporter, logger);
    if (configOptions.debugMode) {
      logger.info(
        `Permit.io SDK initialized with config:\n${JSON.stringify(
          configOptions,
          undefined,
          2
        )}`
      );
    }

    // if auto mapping is enabled, hook into the http/https functions
    if (configOptions.autoMapping.enable) {
      hook(appManager, logger);
    }

    // TODO: close a loop with the sidecar and backend and signal real success.
    setImmediate(() => {
      events.emit('ready');
    });

    return {
      // config
      config: Object.freeze(configOptions),

      // exposed methods from specialized clients
      ...enforcer.getMethods(),
      ...resourceReporter.getMethods(),
      ...mutationsClient.getMethods(),
      cache: cache.getMethods(),

      // resource registry (url mapper)
      ...resourceRegistry.getMethods(),

      // instrumentation methods
      decorate: decorate,

      // event emitter (read only, i.e: subscriber)
      on: events.on.bind(events),
      once: events.once.bind(events),
    };
  }
}
