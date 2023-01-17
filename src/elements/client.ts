import axios from 'axios';
import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import { AuthenticationApi, Configuration, EmbeddedLoginRequestOutput } from '../openapi';

export interface EmbeddedLoginRequestOutputWithContext extends EmbeddedLoginRequestOutput {
  context?: any;
}

export interface IPermitElementsApi {
  loginAs({ userId, tenantId }: loginAsSchema): Promise<EmbeddedLoginRequestOutputWithContext>;
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
  }: loginAsSchema): Promise<EmbeddedLoginRequestOutputWithContext> {
    try {
      const response = await this.authApi.elementsLoginAs({
        userLoginRequestInput: {
          user_id: userId,
          tenant_id: tenantId,
        },
      });
      this.logger.debug(`[${response.status}] permit.api.loginAs(${userId})`);
      const res: EmbeddedLoginRequestOutputWithContext = response.data;
      res['context'] = { url: response.data.redirect_url };
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
