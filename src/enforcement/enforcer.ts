import axios, { AxiosInstance } from 'axios';
import { Logger } from 'pino';
import URL from 'url-parse';
import { IPermitConfig } from '../config';
import { CheckConfig, Context, ContextStore } from '../utils/context';
import { AxiosLoggingInterceptor } from '../utils/http-logger';

import {
  AllTenantsResponse,
  BulkOpaDecisionResult,
  BulkPolicyDecision,
  IAction,
  ICheckInput,
  ICheckOpaInput,
  ICheckQuery,
  IResource,
  isOpaGetUserPermissionsResult,
  IUser,
  IUserPermissions,
  OpaDecisionResult,
  OpaGetUserPermissionsResult,
  PolicyDecision,
  TenantDetails,
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

  /**
   * Checks multiple requests within the specified context.
   *
   * @param checks   - The check requests.
   * @param context  - The context object representing the context in which the action is performed.
   * @returns array containing `true` if the user is authorized, `false` otherwise for each check request.
   * @throws {@link PermitConnectionError} if an error occurs while sending the authorization request to the PDP.
   * @throws {@link PermitPDPStatusError} if received a response with unexpected status code from the PDP.
   */
  bulkCheck(
    checks: Array<ICheckQuery>,
    context?: Context,
    config?: CheckConfig,
  ): Promise<Array<boolean>>;

  /**
   * Get all permissions for the specified user.
   *
   * @param user     - The user object representing the user.
   * @param tenants  - The list of tenants to filter the permissions on ( given by roles ).
   * @param resources - The list of resources to filter the permissions on ( given by resource roles ).
   * @param resource_types - The list of resource types to filter the permissions on ( given by resource roles ).
   * @returns object with key as the resource identifier and value as the resource details and permissions.
   * @throws {@link PermitConnectionError} if an error occurs while sending the authorization request to the PDP.
   * @throws {@link PermitPDPStatusError} if received a response with unexpected status code from the PDP.
   */
  getUserPermissions(
    user: IUser | string,
    tenants?: string[],
    resources?: string[],
    resource_types?: string[],
    config?: CheckConfig,
  ): Promise<IUserPermissions>;

  /**
   * Get all tenants available in the system.
   * @returns An array of TenantDetails representing all tenants.
   */
  checkAllTenants(
    user: IUser | string,
    action: string,
    resource: IResource | string,
    context: Context | undefined,
    sdk: string | undefined,
  ): Promise<TenantDetails[]>;
}

/**
 * The {@link Enforcer} class is responsible for performing permission checks against the PDP.
 * It implements the {@link IEnforcer} interface.
 */
export class Enforcer implements IEnforcer {
  public contextStore: ContextStore; // cross-query context (global context)
  private client: AxiosInstance;
  private opaClient: AxiosInstance;

  /**
   * Creates an instance of the Enforcer class.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(private config: IPermitConfig, private logger: Logger) {
    const opaBaseUrl = new URL(this.config.pdp);
    opaBaseUrl.set('port', '8181');
    opaBaseUrl.set('pathname', `${opaBaseUrl.pathname}v1/data/permit/`);
    const version = process.env.npm_package_version ?? 'unknown';
    if (config.axiosInstance) {
      this.client = config.axiosInstance;
      this.client.defaults.baseURL = `${this.config.pdp}/`;
      this.client.defaults.headers.common['X-Permit-SDK-Version'] = `node:${version}`;
    } else {
      this.client = axios.create({
        baseURL: `${this.config.pdp}/`,
        headers: {
          'X-Permit-SDK-Version': `node:${version}`,
        },
      });
    }
    if (config.opaAxiosInstance) {
      this.opaClient = config.opaAxiosInstance;
      this.opaClient.defaults.baseURL = opaBaseUrl.toString();
      this.opaClient.defaults.headers.common['X-Permit-SDK-Version'] = `node:${version}`;
    } else {
      this.opaClient = axios.create({
        baseURL: opaBaseUrl.toString(),
        headers: {
          'X-Permit-SDK-Version': `node:${version}`,
        },
      });
    }
    this.logger = logger;
    AxiosLoggingInterceptor.setupInterceptor(this.client, this.logger);
    this.contextStore = new ContextStore();
  }

  public async getUserPermissions(
    user: IUser | string,
    tenants?: string[],
    resources?: string[],
    resource_types?: string[],
    config: CheckConfig = {},
  ): Promise<IUserPermissions> {
    return await this.getUserPermissionsWithExceptions(
      user,
      tenants,
      resources,
      resource_types,
      config,
    ).catch((err) => {
      const shouldThrow =
        config.throwOnError === undefined ? this.config.throwOnError : config.throwOnError;
      if (shouldThrow) {
        throw err;
      } else {
        this.logger.error(err);
        return {};
      }
    });
  }

  private async getUserPermissionsWithExceptions(
    user: IUser | string,
    tenants?: string[],
    resources?: string[],
    resource_types?: string[],
    config: CheckConfig = {},
  ): Promise<IUserPermissions> {
    const checkTimeout = config.timeout || this.config.timeout;
    const input = {
      user: isString(user) ? { key: user } : user,
      tenants,
      resources,
      resource_types,
    };
    return await this.client
      .post<OpaGetUserPermissionsResult | IUserPermissions>('user-permissions', input, {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
        },
        timeout: checkTimeout,
      })
      .then((response) => {
        if (response.status !== 200) {
          throw new PermitPDPStatusError(`Permit.getUserPermissions() got an unexpected status code: ${response.status}, please check your SDK init and make sure the PDP sidecar is configured correctly. \n\
            Read more about setting up the PDP at https://docs.permit.io`);
        }
        const permissions =
          (isOpaGetUserPermissionsResult(response.data)
            ? response.data.result.permissions
            : response.data) || {};
        this.logger.info(
          `permit.getUserPermissions(${Enforcer.userRepr(input.user)}) = ${JSON.stringify(
            permissions,
          )}`,
        );
        return permissions;
      })
      .catch((error) => {
        const errorMessage = `Error in permit.getUserPermissions(${Enforcer.userRepr(input.user)})`;

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

  public async bulkCheck(
    checks: Array<ICheckQuery>,
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
    checks: Array<ICheckQuery>,
    context: Context = {}, // context provided specifically for this query
    config: CheckConfig = {},
  ): Promise<Array<boolean>> {
    const checkTimeout = config.timeout || this.config.timeout;
    const inputs: Array<ICheckInput> = [];
    checks.forEach((check) => {
      const input = this.buildCheckInput(check.user, check.action, check.resource, context);
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

  public async checkAllTenants(
    user: IUser | string,
    action: string,
    resource: IResource | string,
    context: Context = {}, // default to empty context if not provided
    sdk = 'node', // default to "node" if not provided
  ): Promise<TenantDetails[]> {
    try {
      const response = await this.client.post<AllTenantsResponse>('/allowed/all-tenants', {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'X-Permit-Sdk-Language': sdk,
        },
        params: {
          user,
          action,
          resource,
          context,
        },
      });
      return response.data.allowedTenants.map((item) => item.tenant);
    } catch (error) {
      this.logger.error('Error fetching all tenants:', error);
      throw error;
    }
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

  //check
  private async checkWithExceptions(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context: Context = {}, // context provided specifically for this query
    config: CheckConfig = {},
  ): Promise<boolean> {
    let input: ICheckOpaInput | ICheckInput = this.buildCheckInput(user, action, resource, context);
    const client = config?.useOpa ? this.opaClient : this.client;
    const path = config?.useOpa ? 'root' : 'allowed';

    if (config?.useOpa) {
      input = { input: input };
    }
    // /root
    const checkTimeout = config.timeout || this.config.timeout;

    return await client
      .post<PolicyDecision | OpaDecisionResult>(path, input, {
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

        this.logger.info(
          `permit.check(${this.checkInputRepr((input as any).input || input)}) = ${decision}`,
        );
        return decision;
      })
      .catch((error) => {
        const errorMessage = `Error in permit.check(${this.checkInputRepr(
          (input as any).input || input,
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
      getUserPermissions: this.getUserPermissions.bind(this),
      checkAllTenants: this.checkAllTenants.bind(this),
    };
  }
}
