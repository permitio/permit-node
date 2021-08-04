// For Default export
import { EventEmitter } from 'events';
import { AllAuthZOptions, decorate } from './instrument/decorator';
import { hook } from './instrument/plugin';
import { ConfigFactory, IAuthorizonConfig } from './config';
import { IAuthorizonCache, LocalCacheClient } from './cache/client';
import { ResourceRegistry } from './resources/registry';
import { IResourceReporter, ResourceReporter } from './resources/reporter';
import { Enforcer, IEnforcer } from './enforcement/enforcer';
import { AppManager } from './instrument/appManager';

interface IEventSubscriber {
  on(event: string | symbol, listener: (...args: any[]) => void): EventEmitter;
  once(event: string | symbol, listener: (...args: any[]) => void): EventEmitter;
}

export interface IAuthorizonClient extends IEventSubscriber, IResourceReporter, IEnforcer {
  cache: IAuthorizonCache;
  instrument(): void;
  decorate(target: any, options: AllAuthZOptions): any;
}

/**
 * The AuthorizonSDK class is a simple factory that returns
 * an initialized IAuthorizonClient object that the user can work with.
 *
 * The authorizon client can signal when its available.
 * all actions with the client should be after the 'ready' event has fired,
 * as shown below.
 *
 * usage example:
 * const authorizon: IAuthorizonClient = AuthorizonSDK.init({ // config });
 * authorizon.once('ready', () => {
 *  const allowed = await authorizon.isAllowed(user, action, resource);
 *  ...
 * })
 */
export class AuthorizonSDK {
  public static init(config: Partial<IAuthorizonConfig>): IAuthorizonClient {
    const events = new EventEmitter();
    const configOptions = ConfigFactory.build(config);
    const resourceRegistry = new ResourceRegistry();
    const resourceReporter = new ResourceReporter(configOptions, resourceRegistry);
    const enforcer = new Enforcer(configOptions);
    const cache = new LocalCacheClient(configOptions);
    const appManager = new AppManager(configOptions, resourceReporter);
    // logger.info(`authorizon.init(), sidecarUrl: ${configOptions.sidecarUrl}`);

    // TODO: close a loop with the sidecar and backend and signal real success.
    events.emit('ready');

    return {
      // exposed methods from specialized clients
      ...enforcer.getMethods(),
      ...resourceReporter.getMethods(),
      cache: cache.getMethods(),
      // instrumentation methods
      instrument: () => { hook(appManager); },
      decorate: decorate,
      // event emitter (read only, i.e: subscriber)
      on: events.on.bind(events),
      once: events.once.bind(events),
    }
  }
}

// const authorizon: IAuthorizonClient = AuthorizonSDK.init({});

// const client = authorizationClient;
// export const syncUser = client.syncUser.bind(client);
// export const deleteUser = client.deleteUser.bind(client);
// export const getUser = client.getUser.bind(client);
// export const syncOrg = client.syncOrg.bind(client);
// export const deleteOrg = client.deleteOrg.bind(client);
// export const getOrg = client.getOrg.bind(client);
// export const addUserToOrg = client.addUserToOrg.bind(client);
// export const removeUserFromOrg = client.removeUserFromOrg.bind(client);
// export const getOrgsForUser = client.getOrgsForUser.bind(client);
// export const getUserRoles = client.getUserRoles.bind(client);
// export const getRole = client.getRole.bind(client);
// export const assignRole = client.assignRole.bind(client);
// export const unassignRole = client.unassignRole.bind(client);
// export const updatePolicyData = client.updatePolicyData.bind(client);

// // export const transformResourceContext = enforcer.addResourceContextTransform.bind(enforcer);
// // export const provideContext = enforcer.addContext.bind(enforcer);
// export const getResourceAndAction = resourceRegistry.getResourceAndActionFromRequestParams.bind(resourceRegistry);


// const authorizon2 = {
//   syncUser: syncUser,
//   deleteUser: deleteUser,
//   getUser: getUser,
//   syncOrg: syncOrg,
//   deleteOrg: deleteOrg,
//   getOrg: getOrg,
//   addUserToOrg: addUserToOrg,
//   removeUserFromOrg: removeUserFromOrg,
//   getOrgsForUser: getOrgsForUser,
//   getUserRoles: getUserRoles,
//   getRole: getRole,
//   assignRole: assignRole,
//   unassignRole: unassignRole,
//   updatePolicyData: updatePolicyData,
//   transformResourceContext: transformResourceContext,
//   provideContext: provideContext,
//   getResourceAndAction: getResourceAndAction,
// };

// export default authorizon;
