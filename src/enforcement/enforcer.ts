import axios, { AxiosInstance } from 'axios'; // eslint-disable-line
import { Logger } from 'winston';
import { IAuthorizonConfig } from '../config';
import { Context, ContextStore } from '../utils/context';
import { IAction, IResource, IUser, OpaResult } from './interfaces';

function isString(x: any): x is string {
  return typeof x === "string";
}

export interface IEnforcer {
  isAllowed(user: IUser | string, action: IAction, resource: IResource, context?: Context): Promise<boolean>;
}

/**
 * this client is dealing with evaluation of isAllowed() queries.
 */
export class Enforcer implements IEnforcer {
  public contextStore: ContextStore; // cross-query context (global context)
  private client: AxiosInstance;

  constructor(private config: IAuthorizonConfig, private logger: Logger) {
    this.client = axios.create({
      baseURL: `${this.config.sidecarUrl}/`,
    });
    this.contextStore = new ContextStore();
  }

  /**
   * Usage:
   *
   * // with (resource, action):
   * const user = { key: 'UNIQUE_USER_ID' };
   * authorizon.is_allowed(user, 'get', {'type': 'task', 'id': '23'})
   * authorizon.is_allowed(user, 'get', {'type': 'task'})
   *
   * // with (url, method):
   * const { resource, action } = authorizon.getUrlContext('/lists/3/todos/37', 'GET');
   * authorizon.is_allowed(user, action, resource)
   *
   * @param user
   * @param action
   * @param resource
   * @param context
   *
   * @returns whether or not action is allowed for given user
   */
  public async isAllowed(
    user: IUser | string,
    action: IAction,
    resource: IResource,
    context: Context = {} // context provided specifically for this query
  ): Promise<boolean> {
    const normalizedUser: string = isString(user) ? user : user.key;

    const normalizedResource: IResource = Enforcer.normalizeResource(resource);

    const queryContext = this.contextStore.getDerivedContext(context);
    const input = {
      user: normalizedUser,
      action: action,
      resource: normalizedResource,
      context: queryContext,
    };

    return await this.client
      .post<OpaResult>('allowed', input)
      .then((response) => {
        const decision = response.data.allow || false;
        if (this.config.debugMode) {
          this.logger.info(`authorizon.isAllowed(${normalizedUser}, ${action}, ${Enforcer.resourceRepr(resource)}) = ${decision}`);
        }
        return decision;
      })
      .catch((error) => {
        this.logger.error(`Error in authorizon.isAllowed(${normalizedUser}, ${action}, ${Enforcer.resourceRepr(resource)}):\n${error}`);
        return false;
      });
  }

  // TODO: remove this eventually, once we decide on finalized structure of AuthzQuery
  private static normalizeResource(resource: IResource): IResource {
    const normalizedResource: IResource = Object.assign({}, resource);
    if (normalizedResource.context === undefined) {
      normalizedResource.context = {};
    }

    if (normalizedResource.context?.tenant === undefined && normalizedResource.tenant !== undefined) {
      normalizedResource.context.tenant = normalizedResource.tenant;
    }

    return normalizedResource;
  }

  private static resourceRepr(resource: IResource): string {
    let resourceRepr: string = resource.type;
    if (resource.id) {
      resourceRepr += ":" + resource.id;
    }
    if (resource.tenant) {
      resourceRepr += `, tenant: ${resource.tenant}`;
    }
    return resourceRepr;
  }

  public getMethods(): IEnforcer {
    return {
      isAllowed: this.isAllowed.bind(this),
    }
  }
}
