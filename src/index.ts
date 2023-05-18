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
export { IUser, IAction, IResource } from './enforcement/interfaces';
export { PermitConnectionError, PermitError, PermitPDPStatusError } from './enforcement/enforcer';
export { Context, ContextTransform } from './utils/context';
export { ApiContext, PermitContextError, ApiKeyLevel } from './api/context';
export { PermitApiError } from './api/base';

export interface IPermitClient extends IEnforcer {
  config: IPermitConfig;
  api: IPermitApi;
  elements: IPermitElementsApi;
}

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
