// For Default export
import winston from 'winston';

import { ApiClient, IPermitApi } from './api/api-client';
import { ElementsClient, IPermitElementsApi } from './api/elements';
import { ConfigFactory, IPermitConfig } from './config';
import { Enforcer, IEnforcer } from './enforcement/enforcer';
import { IResource, IUser } from './enforcement/interfaces';
import { LoggerFactory } from './logger';
import { CheckConfig, Context } from './utils/context';
import { AxiosLoggingInterceptor } from './utils/http-logger';
import { RecursivePartial } from './utils/types';

// exported interfaces
export * from './api';
export { IPermitConfig } from './config';
export { IUser, IAction, IResource } from './enforcement/interfaces';
export { PermitConnectionError, PermitError, PermitPDPStatusError } from './enforcement/enforcer';
export { Context, ContextTransform } from './utils/context';
export { ApiContext, PermitContextError, ApiKeyLevel } from './api/context';
export { PermitApiError } from './api/base';

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
  private logger: winston.Logger;
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
    AxiosLoggingInterceptor.setupInterceptor(this.config, this.logger);

    this.api = new ApiClient(this.config, this.logger);

    this.enforcer = new Enforcer(this.config, this.logger);
    this.elements = new ElementsClient(this.config, this.logger);

    this.logger.debug(
      `Permit.io SDK initialized with config:\n${JSON.stringify(this.config, undefined, 2)}`,
    );
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
  public async check(
    user: string | IUser,
    action: string,
    resource: string | IResource,
    context?: Context | undefined,
    config?: CheckConfig | undefined,
  ): Promise<boolean> {
    return await this.enforcer.check(user, action, resource, context, config);
  }
}
