import axios, { AxiosInstance } from 'axios';
import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import { Context, ContextStore } from '../utils/context';

import { IAction, IResource, IUser, OpaResult } from './interfaces';

const RESOURCE_DELIMITER = ':';

function isString(x: any): x is string {
  return typeof x === 'string';
}

export interface IEnforcer {
  check(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context?: Context,
  ): Promise<boolean>;
}

/**
 * this client is dealing with evaluation of check() queries.
 */
export class Enforcer implements IEnforcer {
  public contextStore: ContextStore; // cross-query context (global context)
  private client: AxiosInstance;

  constructor(private config: IPermitConfig, private logger: Logger) {
    this.client = axios.create({
      baseURL: `${this.config.pdp}/`,
    });
    this.contextStore = new ContextStore();
  }

  /**
   * Usage:
   *
   * // with (resource, action):
   * const user = { key: 'UNIQUE_USER_ID' };
   * permit.check(user, 'get', {'type': 'task', 'id': '23'})
   * permit.check(user, 'get', {'type': 'task'})
   *
   * // with (url, method):
   * const { resource, action } = permit.getUrlContext('/lists/3/todos/37', 'GET');
   * permit.check(user, action, resource)
   *
   * @param user
   * @param action
   * @param resource
   * @param context
   *
   * @returns whether or not action is permitted for given user
   */
  public async check(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context: Context = {}, // context provided specifically for this query
  ): Promise<boolean> {
    const normalizedUser: string = isString(user) ? user : user.key;

    const resourceObj = isString(resource) ? Enforcer.resourceFromString(resource) : resource;
    const normalizedResource: IResource = this.normalizeResource(resourceObj);

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
          this.logger.info(
            `permit.check(${normalizedUser}, ${action}, ${Enforcer.resourceRepr(
              resourceObj,
            )}) = ${decision}`,
          );
        }
        return decision;
      })
      .catch((error) => {
        this.logger.error(
          `Error in permit.check(${normalizedUser}, ${action}, ${Enforcer.resourceRepr(
            resourceObj,
          )}):\n${error}`,
        );
        return false;
      });
  }

  // TODO: remove this eventually, once we decide on finalized structure of AuthzQuery
  private normalizeResource(resource: IResource): IResource {
    const normalizedResource: IResource = Object.assign({}, resource);
    if (normalizedResource.context === undefined) {
      normalizedResource.context = {};
    }

    // if tenant is empty, we migth auto-set the default tenant according to config
    if (!normalizedResource.tenant && this.config.multiTenancy.useDefaultTenantIfEmpty) {
      normalizedResource.tenant = this.config.multiTenancy.defaultTenant;
    }

    // copy tenant from resource.tenant to resource.context.tenant (until we change RBAC policy)
    if (
      normalizedResource.context?.tenant === undefined &&
      normalizedResource.tenant !== undefined
    ) {
      normalizedResource.context.tenant = normalizedResource.tenant;
    }

    return normalizedResource;
  }

  private static resourceRepr(resource: IResource): string {
    let resourceRepr: string = resource.type;
    if (resource.id) {
      resourceRepr += ':' + resource.id;
    }
    if (resource.tenant) {
      resourceRepr += `, tenant: ${resource.tenant}`;
    }
    return resourceRepr;
  }

  private static resourceFromString(resource: string): IResource {
    const parts = resource.split(RESOURCE_DELIMITER);
    if (parts.length < 1 || parts.length > 2) {
      throw Error(`permit.check() got invalid resource string: '${resource}'`);
    }
    return {
      type: parts[0],
      id: parts.length > 1 ? parts[1] : undefined,
    };
  }

  public getMethods(): IEnforcer {
    return {
      check: this.check.bind(this),
    };
  }
}
