import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  ConditionSetsApi as AutogenConditionSetsApi,
  ConditionSetCreate,
  ConditionSetRead,
  ConditionSetUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiKeyLevel } from './context';

export interface IListConditionSetUsers extends IPagination {
  conditionSetKey: string;
}

export interface IConditionSetsApi {
  list(pagination?: IPagination): Promise<ConditionSetRead[]>;
  get(conditionSetKey: string): Promise<ConditionSetRead>;
  getByKey(conditionSetKey: string): Promise<ConditionSetRead>;
  getById(conditionSetId: string): Promise<ConditionSetRead>;
  create(conditionSetData: ConditionSetCreate): Promise<ConditionSetRead>;
  update(conditionSetKey: string, conditionSetData: ConditionSetUpdate): Promise<ConditionSetRead>;
  delete(conditionSetKey: string): Promise<void>;
}

export class ConditionSetsApi extends BasePermitApi implements IConditionSetsApi {
  private conditionSets: AutogenConditionSetsApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.conditionSets = new AutogenConditionSetsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  public async list(pagination?: IPagination): Promise<ConditionSetRead[]> {
    const { page = 1, perPage = 100 } = pagination ?? {};
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.conditionSets.listConditionSets({
          ...this.config.apiContext.environmentContext,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async get(conditionSetKey: string): Promise<ConditionSetRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.conditionSets.getConditionSet({
          ...this.config.apiContext.environmentContext,
          conditionSetId: conditionSetKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async getByKey(conditionSetKey: string): Promise<ConditionSetRead> {
    return await this.get(conditionSetKey);
  }

  public async getById(conditionSetId: string): Promise<ConditionSetRead> {
    return await this.get(conditionSetId);
  }

  public async create(conditionSetData: ConditionSetCreate): Promise<ConditionSetRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.conditionSets.createConditionSet({
          ...this.config.apiContext.environmentContext,
          conditionSetCreate: conditionSetData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async update(
    conditionSetKey: string,
    conditionSetData: ConditionSetUpdate,
  ): Promise<ConditionSetRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.conditionSets.updateConditionSet({
          ...this.config.apiContext.environmentContext,
          conditionSetId: conditionSetKey,
          conditionSetUpdate: conditionSetData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async delete(conditionSetKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      await this.conditionSets.deleteConditionSet({
        ...this.config.apiContext.environmentContext,
        conditionSetId: conditionSetKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
