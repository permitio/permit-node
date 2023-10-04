import axios, { AxiosInstance } from 'axios';
import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import { CheckConfig, Context, ContextStore } from '../utils/context';
import { AxiosLoggingInterceptor } from '../utils/http-logger';

import {
  BulkOpaDecisionResult,
  BulkPolicyDecision,
  IAction,
  ICheckInput,
  IResource,
  IUser,
  OpaDecisionResult,
  PolicyDecision,
} from './interfaces';

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
  /**
   * Checks if a `user` is authorized to perform an `action` on a `resource` within the specified context.
   *
   * @param user     - The user object representing the user.
   * @param action   - The action to be performed on the resource.
   * @param resource - The resource object representing the resource.
   * @param context  - The context object representing the context in which the action is performed.
   * @returns `true` if the user is authorized, `false` otherwise.
   * @throws {@link PermitConnectionError} if an error occurs while sending the authorization request to the PDP.
   * @throws {@link PermitPDPStatusError} if received a response with unexpected status code from the PDP.
   */
  check(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context?: Context,
    config?: CheckConfig,
  ): Promise<boolean>;

  bulkCheck(
    checks: Array<[IUser | string, IAction, IResource | string]>,
    context?: Context,
    config?: CheckConfig,
  ): Promise<Array<boolean>>;
}

/**
 * The {@link Enforcer} class is responsible for performing permission checks against the PDP.
 * It implements the {@link IEnforcer} interface.
 */
export class Enforcer implements IEnforcer {
  public contextStore: ContextStore; // cross-query context (global context)
  private client: AxiosInstance;

  /**
   * Creates an instance of the Enforcer class.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(private config: IPermitConfig, private logger: Logger) {
    const version = process.env.npm_package_version ?? 'unknown';
    this.client = axios.create({
      baseURL: `${this.config.pdp}/`,
      headers: {
        'X-Permit-SDK-Version': `node:${version}`,
      },
    });
    this.logger = logger;
    AxiosLoggingInterceptor.setupInterceptor(this.client, this.logger);
    this.contextStore = new ContextStore();
  }

  /**
   * Checks if a `user` is authorized to perform an `action` on a `resource` within the specified context.
   *
   * @param user     - The user object representing the user.
   * @param action   - The action to be performed on the resource.
   * @param resource - The resource object representing the resource.
   * @param context  - The context object representing the context in which the action is performed.
   * @returns `true` if the user is authorized, `false` otherwise.
   * @throws {@link PermitConnectionError} if an error occurs while sending the authorization request to the PDP.
   * @throws {@link PermitPDPStatusError} if received a response with unexpected status code from the PDP.
   */
  public async bulkCheck(
    checks: Array<[IUser | string, IAction, IResource | string]>,
    context: Context = {}, // context provided specifically for this query
    config: CheckConfig = {},
  ): Promise<Array<boolean>> {
    return await this.bulkCheckWithExceptions(checks, context, config).catch((err) => {
      const shouldThrow =
        config.throwOnError === undefined ? this.config.throwOnError : config.throwOnError;
      if (shouldThrow) {
        throw err;
      } else {
        this.logger.error(err);
        return [];
      }
    });
  }

  private buildCheckInput(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context: Context = {}, // context provided specifically for this query
  ): ICheckInput {
    const normalizedUser: IUser = isString(user) ? { key: user } : user;

    const resourceObj = isString(resource) ? Enforcer.resourceFromString(resource) : resource;
    const normalizedResource: IResource = this.normalizeResource(resourceObj);

    const queryContext = this.contextStore.getDerivedContext(context);
    return {
      user: normalizedUser,
      action: action,
      resource: normalizedResource,
      context: queryContext,
    };
  }

  private checkInputRepr(checkInput: ICheckInput): string {
    return `${Enforcer.userRepr(checkInput.user)}, ${checkInput.action}, ${Enforcer.resourceRepr(
      checkInput.resource,
    )}`;
  }

  private async bulkCheckWithExceptions(
    checks: Array<[IUser | string, IAction, IResource | string]>,
    context: Context = {}, // context provided specifically for this query
    config: CheckConfig = {},
  ): Promise<Array<boolean>> {
    const checkTimeout = config.timeout || this.config.timeout;
    const inputs: Array<ICheckInput> = [];
    checks.forEach((check) => {
      const input = this.buildCheckInput(check[0], check[1], check[2], context);
      inputs.push(input);
    });

    return await this.client
      .post<BulkPolicyDecision | BulkOpaDecisionResult>('allowed/bulk', inputs, {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
        },
        timeout: checkTimeout,
      })
      .then((response) => {
        if (response.status !== 200) {
          throw new PermitPDPStatusError(`Permit.bulkCheck() got an unexpected status code: ${response.status}, please check your SDK init and make sure the PDP sidecar is configured correctly. \n\
            Read more about setting up the PDP at https://docs.permit.io`);
        }
        const decisions = (
          ('allow' in response.data ? response.data.allow : response.data.result.allow) || []
        ).map((decision) => decision.allow || false);
        this.logger.info(
          `permit.bulkCheck(${inputs.map((input) => this.checkInputRepr(input))}) = ${decisions}`,
        );
        return decisions;
      })
      .catch((error) => {
        const errorMessage = `Error in permit.bulkCheck(${inputs.map((input) =>
          this.checkInputRepr(input),
        )})`;

        if (axios.isAxiosError(error)) {
          const errorStatusCode: string = error.response?.status.toString() || '';
          const errorDetails: string = error?.response?.data
            ? JSON.stringify(error.response.data)
            : error.message;
          this.logger.error(`[${errorStatusCode}] ${errorMessage}, err: ${errorDetails}`);
        } else {
          this.logger.error(`${errorMessage}\n${error}`);
        }
        throw new PermitConnectionError(`Permit SDK got error: \n ${error.message} \n
          and cannot connect to the PDP, please check your configuration and make sure the
          PDP is running at ${this.config.pdp} and accepting requests. \n
          Read more about setting up the PDP at https://docs.permit.io`);
      });
  }

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
    const input = this.buildCheckInput(user, action, resource, context);
    const checkTimeout = config.timeout || this.config.timeout;

    return await this.client
      .post<PolicyDecision | OpaDecisionResult>('allowed', input, {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
        },
        timeout: checkTimeout,
      })
      .then((response) => {
        if (response.status !== 200) {
          throw new PermitPDPStatusError(`Permit.check() got an unexpected status code: ${response.status}, please check your SDK init and make sure the PDP sidecar is configured correctly. \n\
            Read more about setting up the PDP at https://docs.permit.io`);
        }
        const decision =
          ('allow' in response.data ? response.data.allow : response.data.result.allow) || false;
        this.logger.info(`permit.check(${this.checkInputRepr(input)}) = ${decision}`);
        return decision;
      })
      .catch((error) => {
        const errorMessage = `Error in permit.check(${this.checkInputRepr(input)})`;

        if (axios.isAxiosError(error)) {
          const errorStatusCode: string = error.response?.status.toString() || '';
          const errorDetails: string = error?.response?.data
            ? JSON.stringify(error.response.data)
            : error.message;
          this.logger.error(`[${errorStatusCode}] ${errorMessage}, err: ${errorDetails}`);
        } else {
          this.logger.error(`${errorMessage}\n${error}`);
        }
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

  private static userRepr(user: IUser): string {
    if (user.attributes || user.email) {
      return JSON.stringify(user);
    }
    return user.key;
  }

  private static resourceRepr(resource: IResource): string {
    if (resource.attributes && resource.attributes.length > 0) {
      return JSON.stringify(resource);
    }

    let resourceRepr = '';
    if (resource.tenant) {
      resourceRepr += `${resource.tenant}/`;
    }
    resourceRepr += `${resource.type}:${resource.key ?? '*'}`;
    return resourceRepr;
  }

  private static resourceFromString(resource: string): IResource {
    const parts = resource.split(RESOURCE_DELIMITER);
    if (parts.length < 1 || parts.length > 2) {
      throw Error(`permit.check() got invalid resource string: '${resource}'`);
    }
    return {
      type: parts[0],
      key: parts.length > 1 ? parts[1] : undefined,
    };
  }

  public getMethods(): IEnforcer {
    return {
      check: this.check.bind(this),
      bulkCheck: this.bulkCheck.bind(this),
    };
  }
}
