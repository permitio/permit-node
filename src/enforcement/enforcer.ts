import axios, { AxiosInstance } from 'axios'; // eslint-disable-line
import { Logger } from 'winston';
import { IAuthorizonConfig } from '../config';
import { Context, ContextStore } from '../utils/context';
import { IAction, IResource, IUser, OpaResult } from './interfaces';

export interface IEnforcer {
  isAllowed(user: IUser, action: IAction, resource: IResource, context: Context): Promise<boolean>;
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
        this.logger.error(`Error in authorizon.isAllowed(): ${error}`);
        return false;
      });
  }

  public getMethods(): IEnforcer {
    return {
      isAllowed: this.isAllowed.bind(this),
    }
  }
}
