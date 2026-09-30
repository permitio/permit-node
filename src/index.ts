// For Default export
import pino from 'pino';

import { ApiClient, type IPermitApi } from '#src/api/api-client';
import { ElementsClient, type IPermitElementsApi } from '#src/api/elements';
import { ConfigFactory, type IPermitConfig, type IPermitOptions } from '#src/config';
import { Enforcer, type IEnforcer } from '#src/enforcement/enforcer';
import {
  type ICheckQuery,
  type IAuthorizedUsersResult,
  type IFilterObject,
  type IResource,
  type IUser,
  type IUserPermissions,
  type TenantDetails,
} from '#src/enforcement/interfaces';
import { LoggerFactory } from '#src/logger';
import { type CheckConfig, type Context, type GetUserPermissionsConfig } from '#src/utils/context';
import { createOwnedTransport } from '#src/utils/http-transport';
import { resolveRetryConfig } from '#src/utils/retry';

// exported interfaces
export * from '#src/api/index';
export { type IPermitConfig, type IPermitOptions } from '#src/config';
export {
  type IUser,
  type IAction,
  type IResource,
  type IFilterObject,
  type IAuthorizedUserAssignment,
  type IAuthorizedUsersResult,
  type TenantDetails,
} from '#src/enforcement/interfaces';
export {
  PermitConnectionError,
  PermitError,
  PermitPDPStatusError,
} from '#src/enforcement/enforcer';
export {
  type Context,
  type ContextTransform,
  type GetUserPermissionsConfig,
} from '#src/utils/context';
export { ApiContext, PermitContextError, ApiKeyLevel } from '#src/api/context';
export { PermitApiError } from '#src/api/base';
export { type IRetryConfig, type RetryConditionFn, RETRYABLE_STATUS_CODES } from '#src/utils/retry';

export interface IPermitClient extends IEnforcer {
  /**
   * Access the SDK configuration using this property.
   * Once the SDK is initialized, the configuration is read-only.
   */
  readonly config: IPermitConfig;

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
 * The SDK constructor expects {@link IPermitOptions}; effective settings are validated and frozen.
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
   * @throws TypeError When effective constructor options are invalid.
   */
  constructor(config: IPermitOptions) {
    this.config = ConfigFactory.build(config);
    Object.defineProperty(this, 'config', { writable: false, configurable: false });
    this.logger = LoggerFactory.createLogger(this.config);
    const resolvedRetryConfig = resolveRetryConfig(this.config.retry);
    const restConfig = {
      ...this.config,
      axiosInstance: createOwnedTransport({
        caller: this.config.axiosInstance,
        logger: this.logger,
        retry: {
          ...resolvedRetryConfig,
          retryMethods: resolvedRetryConfig.retryMethods.filter(
            (method) => method !== 'POST' && method !== 'PATCH',
          ),
        },
        name: 'API',
      }),
    };
    this.api = new ApiClient(restConfig, this.logger);
    this.enforcer = new Enforcer(this.config, this.logger);
    this.elements = new ElementsClient(restConfig, this.logger);

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
   * Returns the full PDP result for users authorized to perform an action on a resource.
   *
   * @param action - Action to evaluate.
   * @param resource - Resource type, type:key string, or resource attributes and tenant.
   * @param context - Request context overriding existing global context.
   * @param config - Timeout/error policy; unsupported useOpa:true always rejects.
   * @returns The validated result or a normalized empty result in non-throwing mode.
   * @throws {PermitError} For unsupported OPA, invalid resource strings, or non-JSON inputs.
   * @throws {PermitConnectionError} On an operational failure in throwing mode.
   * @throws {PermitPDPStatusError} On a rejected or malformed response in throwing mode.
   */
  public async getAuthorizedUsers(
    action: string,
    resource: IResource | string,
    context?: Context,
    config?: CheckConfig,
  ): Promise<IAuthorizedUsersResult> {
    return await this.enforcer.getAuthorizedUsers(action, resource, context, config);
  }

  /**
   * Returns a user's role-derived tenants from a compatible container PDP; not published by cloud.
   *
   * @param user - User key or attributes.
   * @param context - Request context overriding existing global context.
   * @param config - Timeout/error policy; unsupported useOpa:true always rejects.
   * @returns Validated tenants, or [] on operational failure in non-throwing mode.
   * @throws {PermitError} For unsupported OPA or non-JSON input in throwing mode.
   * @throws {PermitPDPStatusError} For an unavailable endpoint regardless of error policy,
   *   or other rejected/malformed responses in throwing mode.
   * @throws {PermitConnectionError} On an operational failure in throwing mode.
   */
  public async getUserTenants(
    user: IUser | string,
    context?: Context,
    config?: CheckConfig,
  ): Promise<TenantDetails[]> {
    return await this.enforcer.getUserTenants(user, context, config);
  }

  /**
   * Filters objects through bulk authorization while retaining original references and order.
   *
   * @param user - User key or attributes.
   * @param action - Action to evaluate for every object.
   * @param objects - Dense readonly array; extra fields remain in returned objects only.
   * @param context - Shared request context; an object's context overrides it.
   * @param config - Bulk timeout/error policy; unsupported OPA queries always reject.
   * @returns Authorized original objects from a synchronous snapshot, including duplicates.
   * @throws {PermitError} For unsupported OPA/invalid slots, or non-JSON inputs in throwing mode.
   * @throws {PermitConnectionError} On an operational failure in throwing mode.
   * @throws {PermitPDPStatusError} On rejected/malformed bulk responses in throwing mode.
   */
  public async filterObjects<T extends IFilterObject>(
    user: IUser | string,
    action: string,
    objects: readonly T[],
    context?: Context,
    config?: CheckConfig,
  ): Promise<T[]> {
    return await this.enforcer.filterObjects(user, action, objects, context, config);
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
   * @param config - Timeout/error policy and request context overriding existing global context.
   * @returns object with key as the resource identifier and value as the resource details and permissions.
   * @throws {@link PermitConnectionError} if an error occurs while sending the authorization request to the PDP.
   * @throws {@link PermitPDPStatusError} if the PDP returned an unexpected status code or response body.
   */
  public async getUserPermissions(
    user: IUser | string,
    tenants?: string[],
    resources?: string[],
    resource_types?: string[],
    config?: GetUserPermissionsConfig,
  ): Promise<IUserPermissions> {
    return await this.enforcer.getUserPermissions(user, tenants, resources, resource_types, config);
  }
}
