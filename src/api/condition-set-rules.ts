import { Logger } from 'pino';

import { IPermitConfig } from '../config';
import { BASE_PATH } from '../openapi/base.js';
import {
  ConditionSetRulesApi as AutogenConditionSetRulesApi,
  ConditionSetRuleCreate,
  ConditionSetRuleRead,
  ConditionSetRuleRemove,
} from '../openapi/index.js';

import { BasePermitApi, IPagination, PermitApiError } from './base.js'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ApiContext, ApiContextLevel, ApiKeyLevel, PermitContextError } from './context.js'; // eslint-disable-line @typescript-eslint/no-unused-vars

export {
  ConditionSetRuleCreate,
  ConditionSetRuleRead,
  ConditionSetRuleRemove,
} from '../openapi/index.js';

export interface IListConditionSetRules extends IPagination {
  /**
   * the key of the userset, if used only rules matching that userset will be fetched.
   */
  userSetKey: string;
  /**
   * the key of the permission, formatted as <resource>:<action>.
   * if used only rules granting that permission will be fetched.
   */
  permissionKey: string;
  /**
   * the key of the resourceset, if used only rules matching that resourceset will be fetched.
   */
  resourceSetKey: string;
}

/**
 * The ConditionSetsApi class provides methods for interacting with condition sets using the Permit REST API.
 */
export interface IConditionSetRulesApi {
  /**
   * Retrieves a list of condition set rules based on the specified parameters.
   *
   * @param params - parameters for filtering and pagination, @see {@link IListConditionSetRules}
   * @returns A promise that resolves to an array of condition set rules.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(params: IListConditionSetRules): Promise<ConditionSetRuleRead[]>;

  /**
   * Creates a new condition set rule.
   *
   * @param rule - The condition set rule to create.
   * @returns A promise that resolves to the created condition set rule.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(rule: ConditionSetRuleCreate): Promise<ConditionSetRuleRead>;

  /**
   * Deletes a condition set rule.
   *
   * @param rule - The condition set rule to delete.
   * @returns A promise that resolves when the condition set rule is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(rule: ConditionSetRuleRemove): Promise<void>;
}

export class ConditionSetRulesApi extends BasePermitApi implements IConditionSetRulesApi {
  private setRules: AutogenConditionSetRulesApi;

  /**
   * Creates an instance of the ConditionSetRulesApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.setRules = new AutogenConditionSetRulesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of condition set rules based on the specified parameters.
   *
   * @param params - parameters for filtering and pagination, @see {@link IListConditionSetRules}
   * @returns A promise that resolves to an array of condition set rules.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(params: IListConditionSetRules): Promise<ConditionSetRuleRead[]> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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

  /**
   * Creates a new condition set rule.
   *
   * @param rule - The condition set rule to create.
   * @returns A promise that resolves to the created condition set rule.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(rule: ConditionSetRuleCreate): Promise<ConditionSetRuleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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

  /**
   * Deletes a condition set rule.
   *
   * @param rule - The condition set rule to delete.
   * @returns A promise that resolves when the condition set rule is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(rule: ConditionSetRuleRemove): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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
