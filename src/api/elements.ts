import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import { AuthenticationApi, EmbeddedLoginRequestOutput } from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi } from './base';

export interface EmbeddedLoginRequestOutputWithContent extends EmbeddedLoginRequestOutput {
  content?: any;
}

export interface IPermitElementsApi {
  loginAs({ userId, tenantId }: loginAsSchema): Promise<EmbeddedLoginRequestOutputWithContent>;
}

export enum ElementsApiErrors {
  USER_NOT_FOUND = 'User not found',
  TENANT_NOT_FOUND = 'Tenant not found',
  INVALID_PERMISSION_LEVEL = 'Invalid user permission level',
  FORBIDDEN_ACCESS = 'Forbidden access',
}

export interface loginAsSchema {
  userId: string;
  tenantId: string;
}

export class ElementsClient extends BasePermitApi implements IPermitElementsApi {
  private authApi: AuthenticationApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.authApi = new AuthenticationApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

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
