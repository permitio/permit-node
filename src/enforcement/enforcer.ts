import axios, { AxiosInstance } from 'axios'; // eslint-disable-line
import { logger } from '../logger';
import { IAuthorizonConfig } from '../config';
import { Context, ContextStore } from './context';
import { IAction, IResource, IUser } from './interfaces';

interface OpaResult {
  allow: boolean;
}

/**
 * this client is dealing with evaluation of isAllowed() queries.
 */
export class Enforcer {
  public contextStore: ContextStore; // cross-query context (global context)
  private client: AxiosInstance;

  constructor(private config: IAuthorizonConfig) {
    this.client = axios.create({
      baseURL: `${this.config.sidecarUrl}/`,
    });
    this.contextStore = new ContextStore();
  }

  // private translateResource(resource: IResource): Dict {
  //   let resourceDict: Dict = {};

  //   if (typeof resource === 'string') {
  //     // we are provided a path
  //     const resourceActionPair = resourceRegistry.getResourceAndActionFromRequestParams(resource);
  //     resourceDict = (resourceActionPair !== undefined) ? resourceActionPair.resource.dict() : {};
  //   } else if (resource instanceof Resource) {
  //     resourceDict = resource.dict() || {};
  //   } else if (isDict(resource)) {
  //     resourceDict = resource;
  //   } else {
  //     throw new Error(`Unsupported resource type: ${typeof resource}`);
  //   }

  //   resourceDict['context'] = this.transformContext(
  //     resourceDict['context'] || {}
  //   );
  //   return resourceDict;
  // }

  /**
   * Usage:
   *
   * authorizon.is_allowed(user, 'get', '/tasks/23')
   * authorizon.is_allowed(user, 'get', '/tasks')
   * authorizon.is_allowed(user, 'post', '/lists/3/todos/37', context={org_id=2})
   * authorizon.is_allowed(user, 'view', task)
   *
   * @param user
   * @param action
   * @param resource
   * @param context
   *
   * @returns whether or not action is allowed for given user
   */
  public async isAllowed(
    user: IUser,
    action: IAction,
    resource: IResource,
    context: Context = {} // context provided specifically for this query
  ): Promise<boolean> {
    const queryContext = this.contextStore.getDerivedContext(context);
    const input = {
      user: user,
      action: action,
      resource: resource,
      context: queryContext,
    };

    return await this.client
      .post<OpaResult>('allowed', input)
      .then((response) => {
        return response.data.allow || false;
      })
      .catch((error) => {
        logger.error(`Error in authorizon.isAllowed(): ${error}`);
        return false;
      });
  }
}
