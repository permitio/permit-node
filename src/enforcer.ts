import axios, { AxiosInstance } from 'axios'; // eslint-disable-line
import { sidecarUrl } from './constants';
import { logger } from './logger';
import Resource from './resource';

export interface Context {
  [id: string]: string;
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
  result: boolean;
}

export class Enforcer {
  private transforms: ContextTransform[] = [];
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${sidecarUrl}/`,
    });
  }

  public addTransform(transform: ContextTransform): void {
    this.transforms.push(transform);
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
      resourceDict = Resource.fromPath(resource)?.dict() || {};
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
   *
   * @returns whether or not action is allowed for given user
   */
  public async isAllowed(
    user: UserType,
    action: ActionType,
    resource: ResourceType
  ): Promise<boolean> {
    const resourceDict: Dict = this.translateResource(resource);
    const input = {
      user: user,
      action: action,
      resource: resourceDict,
    };

    return await this.client
      .post<OpaResult>('allowed', input)
      .then((response) => {
        return response.data.result || false;
      })
      .catch((error) => {
        logger.error(`Error in authorizon.isAllowed(): ${error}`);
        return false;
      });
  }
}

export const enforcer: Enforcer = new Enforcer();
