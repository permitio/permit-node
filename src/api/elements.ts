import { Logger } from 'pino';

import { IPermitConfig } from '../config';
import { AuthenticationApi, EmbeddedLoginRequestOutput } from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi } from './base';

/**
 * Represents the response returned by the `loginAs` method of the `ElementsClient` class, with additional content.
 */
export interface EmbeddedLoginRequestOutputWithContent extends EmbeddedLoginRequestOutput {
  content?: any;
}

/**
 * Interface for interacting with the Permit Elements API.
 */
export interface IPermitElementsApi {
  /**
   * Logs in as a user in the context of a specific tenant.
   * @param loginData - The login data containing the user key and tenant key.
   * @returns The embedded login authentication session data.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  loginAs({ userId, tenantId }: loginAsSchema): Promise<EmbeddedLoginRequestOutputWithContent>;
}

/**
 * Represents the possible error messages returned by the Elements API.
 */
export enum ElementsApiErrors {
  USER_NOT_FOUND = 'User not found',
  TENANT_NOT_FOUND = 'Tenant not found',
  INVALID_PERMISSION_LEVEL = 'Invalid user permission level',
  FORBIDDEN_ACCESS = 'Forbidden access',
}

/**
 * Input schema of the {@link ElementsClient.loginAs} method.
 */
export interface loginAsSchema {
  /**
   * The key (or ID) of the user the element will log in as.
   */
  userId: string;
  /**
   * The key (or ID) of the active tenant for the logged in user.
   * The embedded user will only be able to access the active tenant.
   */
  tenantId: string;
}

/**
 * API client for interacting with the Permit Elements API.
 */
export class ElementsClient extends BasePermitApi implements IPermitElementsApi {
  private authApi: AuthenticationApi;

  /**
   * Creates an instance of the ElementsClient.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.authApi = new AuthenticationApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Logs in as a user in the context of a specific tenant.
   * @param loginData - The login data containing the user key and tenant key.
   * @returns The embedded login authentication session data.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async loginAs({
    userId,
    tenantId,
  }: loginAsSchema): Promise<EmbeddedLoginRequestOutputWithContent> {
    try {
      const response = await this.authApi.elementsLoginAs({
        userLoginRequestInput: {
          user_id: userId,
          tenant_id: tenantId,
        },
      });
      return {
        ...response.data,
        content: { url: response.data.redirect_url },
      };
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
