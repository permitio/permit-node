import axios from 'axios';
import { Logger } from 'pino';

import { IPermitConfig } from '../config';
import { AuthenticationApi, Configuration, EmbeddedLoginRequestOutput } from '../openapi';

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

export interface IElementsApiClient {
  elements: IPermitElementsApi;
}

export interface loginAsSchema {
  userId: string;
  tenantId: string;
}

export class ElementsClient implements IElementsApiClient {
  private authApi: AuthenticationApi;

  constructor(private config: IPermitConfig, private logger: Logger) {
    const axiosClientConfig = new Configuration({
      basePath: `${this.config.apiUrl}`,
      accessToken: this.config.token,
    });
    this.authApi = new AuthenticationApi(axiosClientConfig);
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
      this.logger.debug(`[${response.status}] permit.api.loginAs(${userId})`);
      const res: EmbeddedLoginRequestOutputWithContent = response.data;
      res['content'] = { url: response.data.redirect_url };
      return res;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `[${err?.response?.status}] permit.api.loginAs(${userId}), err: ${JSON.stringify(
            err?.response?.data,
          )}`,
        );
      }
      throw err;
    }
  }

  public get elements(): IPermitElementsApi {
    return {
      loginAs: this.loginAs.bind(this),
    };
  }

  public getMethods(): IElementsApiClient {
    return {
      elements: this.elements,
    };
  }
}
