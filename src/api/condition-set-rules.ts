import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  ConditionSetRulesApi as AutogenConditionSetRulesApi,
  ConditionSetRuleCreate,
  ConditionSetRuleRead,
  ConditionSetRuleRemove,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiKeyLevel } from './context';

export interface IListConditionSetRules extends IPagination {
  userSetKey: string;
  permissionKey: string;
  resourceSetKey: string;
}

export interface IConditionSetRulesApi {
  list(params: IListConditionSetRules): Promise<ConditionSetRuleRead[]>;
  create(rule: ConditionSetRuleCreate): Promise<ConditionSetRuleRead>;
  delete(rule: ConditionSetRuleRemove): Promise<void>;
}

export class ConditionSetRulesApi extends BasePermitApi implements IConditionSetRulesApi {
  private setRules: AutogenConditionSetRulesApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.setRules = new AutogenConditionSetRulesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  public async list(params: IListConditionSetRules): Promise<ConditionSetRuleRead[]> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    const { userSetKey, permissionKey, resourceSetKey, page = 1, perPage = 100 } = params;
    try {
      return (
        await this.setRules.listSetPermissions({
          ...this.config.apiContext.environmentContext,
          userSet: userSetKey,
          permission: permissionKey,
          resourceSet: resourceSetKey,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async create(rule: ConditionSetRuleCreate): Promise<ConditionSetRuleRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.setRules.assignSetPermissions({
          ...this.config.apiContext.environmentContext,
          conditionSetRuleCreate: rule,
        })
      ).data[0];
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async delete(rule: ConditionSetRuleRemove): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.setRules.unassignSetPermissions({
          ...this.config.apiContext.environmentContext,
          conditionSetRuleRemove: rule,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
