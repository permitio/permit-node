import axios, { AxiosInstance } from 'axios';
import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import { CheckConfig, Context, ContextStore } from '../utils/context';

import { IAction, IResource, IUser, OpaDecisionResult, PolicyDecision } from './interfaces';

const RESOURCE_DELIMITER = ':';

function isString(x: any): x is string {
  return typeof x === 'string';
}

export class PermitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermitError';
  }
}
export class PermitConnectionError extends PermitError {
  constructor(message: string) {
    super(message);
    this.name = 'PermitConnectionError';
  }
}
export class PermitPDPStatusError extends PermitError {
  constructor(message: string) {
    super(message);
    this.name = 'PermitPDPStatusError';
  }
}

export interface IEnforcer {
  check(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context?: Context,
    config?: CheckConfig,
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
      headers: {
        Authorization: "Bearer " + this.config.token,
      },
    });
    this.logger = logger;
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
   * @param config
   *
   * @returns whether or not action is permitted for given user
   */
  public async check(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context: Context = {}, // context provided specifically for this query
    config: CheckConfig = {},
  ): Promise<boolean> {
    return await this.checkWithExceptions(user, action, resource, context, config).catch((err) => {
      const shouldThrow =
        config.throwOnError === undefined ? this.config.throwOnError : config.throwOnError;
      if (shouldThrow) {
        throw err;
      } else {
        this.logger.error(err);
        return false;
      }
    });
  }
  private async checkWithExceptions(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context: Context = {}, // context provided specifically for this query
    config: CheckConfig = {},
  ): Promise<boolean> {
    const normalizedUser: string = isString(user) ? user : user.key;
    const checkTimeout = config.timeout || this.config.timeout;

    const resourceObj = isString(resource) ? Enforcer.resourceFromString(resource) : resource;
    const normalizedResource: IResource = this.normalizeResource(resourceObj);

    const queryContext = this.contextStore.getDerivedContext(context);
    const input = {
      user: {
        id: normalizedUser,
      },
      action: {
        id: action,
      },
      resource: normalizedResource,
      context: queryContext,
    };

    return await this.client
      .post<PolicyDecision | OpaDecisionResult>('allowed', input, { timeout: checkTimeout })
      .then((response) => {
        if (response.status !== 200) {
          throw new PermitPDPStatusError(`Permit.check() got an unexpected status code: ${response.status}, please check your SDK init and make sure the PDP sidecar is configured correctly. \n\
            Read more about setting up the PDP at https://docs.permit.io`);
        }
        const decision =
          ('allow' in response.data ? response.data.allow : response.data.result.allow) || false;
        this.logger.info(
          `permit.check(${normalizedUser}, ${action}, ${Enforcer.resourceRepr(
            resourceObj,
          )}) = ${decision}`,
        );
        return decision;
      })
      .catch((error) => {
        this.logger.error(
          `Error in permit.check(${normalizedUser}, ${action}, ${Enforcer.resourceRepr(
            resourceObj,
          )}):\n${error}`,
        );
        throw new PermitConnectionError(`Permit SDK got error: \n ${error.message} \n
          and cannot connect to the PDP, please check your configuration and make sure the PDP is running at ${this.config.pdp} and accepting requests. \n
          Read more about setting up the PDP at https://docs.permit.io`);
      });
  }

  // TODO: remove this eventually, once we decide on finalized structure of AuthzQuery
  private normalizeResource(resource: IResource): IResource {
    const normalizedResource: IResource = Object.assign({}, resource);

    // if tenant is empty, we might auto-set the default tenant according to config
    if (!normalizedResource.tenant && this.config.multiTenancy.useDefaultTenantIfEmpty) {
      normalizedResource.tenant = this.config.multiTenancy.defaultTenant;
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
