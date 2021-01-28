import axios, { AxiosInstance } from 'axios'; // eslint-disable-line
import { logger } from './logger';
import { config } from './config';
import Resource from './resource';
import { resourceRegistry } from './registry';
import { AuthorizonConfig } from './interface';

export interface Context {
  [id: string]: any;
}

export interface ContextTransform {
  (context: Context): Context;
}

type Dict = Record<string, any>;

function isDict(val: any): val is Dict {
  return (val as Dict) !== undefined;
}

export type UserType = string;
export type ActionType = string;
export type ResourceType = string | Resource | Dict;

interface OpaResult {
  allow: boolean;
}

export class Enforcer {
  private initialized: boolean = false;
  private config: AuthorizonConfig = { token: '' };
  private context: Context = {}; // cross-query context (global context)
  private transforms: ContextTransform[] = [];
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${config.sidecarUrl}/`,
    });
  }

  public initialize(configOptions: AuthorizonConfig): void {
    this.initialized = true;
    this.config = configOptions;
    if (this.config.sidecarUrl) {
      this.client = axios.create({
        baseURL: `${this.config.sidecarUrl}/`,
      });
    } // otherwise fallback to env var settings (see ctor)
  }

  public addResourceContextTransform(transform: ContextTransform): void {
    this.transforms.push(transform);
  }

  public addContext(context: Context): void {
    this.context = Object.assign(this.context, context);
  }

  /**
   * merges the global context (this.context) with the context
   * provided for this specific query (queryContext).
   */
  public combineContext(queryContext: Context): Context {
    return Object.assign({}, this.context, queryContext);
  }

  private transformContext(initialContext: Context): Context {
    let context = { ...initialContext };
    for (let transform of this.transforms) {
      context = transform(context);
    }
    return context;
  }

  private translateResource(resource: ResourceType): Dict {
    let resourceDict: Dict = {};

    if (typeof resource === 'string') {
      // we are provided a path
      const resourceActionPair = resourceRegistry.getResourceAndActionFromRequestParams(resource);
      resourceDict = (resourceActionPair !== undefined) ? resourceActionPair.resource.dict() : {};
    } else if (resource instanceof Resource) {
      resourceDict = resource.dict() || {};
    } else if (isDict(resource)) {
      resourceDict = resource;
    } else {
      throw new Error(`Unsupported resource type: ${typeof resource}`);
    }

    resourceDict['context'] = this.transformContext(
      resourceDict['context'] || {}
    );
    return resourceDict;
  }

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
    user: UserType,
    action: ActionType,
    resource: ResourceType,
    context: Context = {} // context provided specifically for this query
  ): Promise<boolean> {
    this.throwIfNotInitialized();

    const resourceDict: Dict = this.translateResource(resource);
    const queryContext = this.combineContext(context);
    const input = {
      user: user,
      action: action,
      resource: resourceDict,
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

  private throwIfNotInitialized() {
    if (!this.initialized) {
      throw new Error('You must call authorizon.init() first!');
    }
  }
}

export const enforcer: Enforcer = new Enforcer();
