// For Default export
import pino from 'pino';

import { ApiClient, type IPermitApi } from '#src/api/api-client';
import { ElementsClient, type IPermitElementsApi } from '#src/api/elements';
import { ConfigFactory, type IPermitConfig } from '#src/config';
import { Enforcer, type IEnforcer } from '#src/enforcement/enforcer';
import {
  type ICheckQuery,
  type IResource,
  type IUser,
  type IUserPermissions,
  type TenantDetails,
} from '#src/enforcement/interfaces';
import { LoggerFactory } from '#src/logger';
import { type CheckConfig, type Context } from '#src/utils/context';
import { AxiosLoggingInterceptor } from '#src/utils/http-logger';
import { resolveRetryConfig } from '#src/utils/retry';
import { AxiosRetryInterceptor } from '#src/utils/retry-interceptor';
import { type RecursivePartial } from '#src/utils/types';

// exported interfaces
export * from '#src/api/index';
export { type IPermitConfig } from '#src/config';
export { type IUser, type IAction, type IResource } from '#src/enforcement/interfaces';
export {
  PermitConnectionError,
  PermitError,
  PermitPDPStatusError,
} from '#src/enforcement/enforcer';
export { type Context, type ContextTransform } from '#src/utils/context';
export { ApiContext, PermitContextError, ApiKeyLevel } from '#src/api/context';
export { PermitApiError } from '#src/api/base';
export { type IRetryConfig, type RetryConditionFn, RETRYABLE_STATUS_CODES } from '#src/utils/retry';

export interface IPermitClient extends IEnforcer {
  /**
   * Access the SDK configuration using this property.
   * Once the SDK is initialized, the configuration is read-only.
   */
  config: IPermitConfig;

  /**
   * Access the Permit REST API using this property.
   */
  api: IPermitApi;

  /**
   * Access the Permit Elements API using this property.
   */
  elements: IPermitElementsApi;
}

/**
 * The `Permit` class represents the main entry point for interacting with the Permit.io SDK.
 * The SDK constructor expects an object implementing the {@link IPermitConfig} interface.
 *
 * Example usage:
 *
 * ```typescript
 * import { Permit } from 'permitio';
 *
 * const permit = new Permit({
 *   // this is typically the same API Key you would use for the PDP container
 *   token: "[YOUR_API_KEY]",
 *   // in production, you might need to change this url to fit your deployment
 *   pdp: "http://localhost:7766",
 *   ...
 * });
 *
 * // creates (or updates) a user on that can be assigned roles and permissions
 * const { user } = await permit.api.users.sync({
 *   // the user key must be a unique id of the user
 *   key: 'auth0|elon',
 *   // optional params
 *   email: 'elonmusk@tesla.com',
 *   first_name: 'Elon',
 *   last_name: 'Musk',
 *   // user attributes can be used in attribute-based access-control policies
 *   attributes: {
 *     age: 50,
 *     favoriteColor: 'red',
 *   },
 * });
 *
 * // 'document' is the protected resource we are enforcing access to
 * const resource = 'document';
 * // the action the user is trying to do on the resource
 * const action = 'read';
 *
 * const permitted = await permit.check(user, action, resource);
 * if (permitted) {
 *     console.log('User is authorized to read a document.');
 * } else {
 *     console.log('User is not authorized to read a document.');
 * }
 * ```
 */
export class Permit implements IPermitClient {
  private logger: pino.Logger;
  private enforcer: IEnforcer;

  /**
   * Access the SDK configuration using this property.
   * Once the SDK is initialized, the configuration is read-only.
   *
   * Usage example:
   *
   * ```typescript
   * const permit = new Permit(config);
   * const pdpUrl = permit.config.pdp;
   * ```
   */
  public readonly config: IPermitConfig;

  /**
   * Access the Permit REST API using this property.
   *
   * Usage example:
   *
   * ```typescript
   * const permit = new Permit(config);
   * permit.api.roles.create(...);
   * ```
   */
  public readonly api: IPermitApi;

  /**
   * Access the Permit Elements API using this property.
   *
   * Usage example:
   *
   * ```typescript
   * const permit = new Permit(config);
   * permit.elements.loginAs(user, tenant);
   * ```
   */
  public readonly elements: IPermitElementsApi;

  /**
   * Constructs a new instance of the {@link Permit} class with the specified configuration.
   *
   * @param config - The configuration for the Permit SDK.
   */
  constructor(config: RecursivePartial<IPermitConfig>) {
    this.config = ConfigFactory.build(config);
    this.logger = LoggerFactory.createLogger(this.config);
    AxiosLoggingInterceptor.setupInterceptor(this.config.axiosInstance, this.logger);

    // Setup retry interceptor for REST API calls.
    // Strip POST from the REST retryMethods regardless of user config: REST
    // writes are non-idempotent and must never be repeated. (This is symmetric
    // with the enforcer, which ADDS POST for the idempotent PDP/OPA check calls.)
    const resolvedRetryConfig = resolveRetryConfig(this.config.retry);
    const restRetryConfig = {
      ...resolvedRetryConfig,
      retryMethods: resolvedRetryConfig.retryMethods.filter((m) => m !== 'POST'),
    };
    // Skip the install when no methods remain (e.g. retryMethods: ['POST']),
    // which would otherwise add an interceptor that can never retry.
    if (resolvedRetryConfig.enabled && restRetryConfig.retryMethods.length > 0) {
      AxiosRetryInterceptor.setupInterceptor(
        this.config.axiosInstance,
        restRetryConfig,
        this.logger,
        'API',
      );
    }

    this.api = new ApiClient(this.config, this.logger);

    this.enforcer = new Enforcer(this.config, this.logger);
    this.elements = new ElementsClient(this.config, this.logger);

    this.logger.debug('Permit.io SDK initialized');
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
   * @throws {@link PermitPDPStatusError} if the PDP returned an unexpected status code or response body.
   */
  public async check(
    user: string | IUser,
    action: string,
    resource: string | IResource,
    context?: Context | undefined,
    config?: CheckConfig | undefined,
  ): Promise<boolean> {
    return await this.enforcer.check(user, action, resource, context, config);
  }

  /**
   * Checks multiple requests within the specified context.
   *
   * @param checks   - The check requests.
   * @param context  - The context object representing the context in which the action is performed.
   * @returns array containing `true` if the user is authorized, `false` otherwise for each check request.
   * @throws {@link PermitConnectionError} if an error occurs while sending the authorization request to the PDP.
   * @throws {@link PermitPDPStatusError} if the PDP returned an unexpected status code or response body.
   */
  public async bulkCheck(
    checks: Array<ICheckQuery>,
    context?: Context | undefined,
    config?: CheckConfig | undefined,
  ): Promise<Array<boolean>> {
    return await this.enforcer.bulkCheck(checks, context, config);
  }

  /**
   * Get all tenants available in the system.
   * @returns An array of TenantDetails representing all tenants.
   */
  public async checkAllTenants(
    user: IUser | string,
    action: string,
    resource: IResource | string,
    context?: Context | undefined,
    sdk?: string | undefined,
  ): Promise<TenantDetails[]> {
    return await this.enforcer.checkAllTenants(user, action, resource, context, sdk);
  }

  /**
   * Get all permissions for the specified user.
   *
   * @param user     - The user object representing the user.
   * @param tenants  - The list of tenants to filter the permissions on ( given by roles ).
   * @param resources - The list of resources to filter the permissions on ( given by resource roles ).
   * @param resource_types - The list of resource types to filter the permissions on ( given by resource roles ).
   * @returns object with key as the resource identifier and value as the resource details and permissions.
   * @throws {@link PermitConnectionError} if an error occurs while sending the authorization request to the PDP.
   * @throws {@link PermitPDPStatusError} if the PDP returned an unexpected status code or response body.
   */
  public async getUserPermissions(
    user: IUser | string,
    tenants?: string[],
    resources?: string[],
    resource_types?: string[],
    config?: CheckConfig,
  ): Promise<IUserPermissions> {
    return await this.enforcer.getUserPermissions(user, tenants, resources, resource_types, config);
  }
}
