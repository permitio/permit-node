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
  /**
   * Retrieves a list of condition sets.
   *
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to an array of condition sets.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(pagination?: IPagination): Promise<ConditionSetRead[]>;

  /**
   * Retrieves a condition set by its key.
   *
   * @param conditionSetKey The key of the condition set.
   * @returns A promise that resolves to the condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(conditionSetKey: string): Promise<ConditionSetRead>;

  /**
   * Retrieves a condition set by its key.
   * Alias for the {@link get} method.
   *
   * @param conditionSetKey The key of the condition set.
   * @returns A promise that resolves to the condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(conditionSetKey: string): Promise<ConditionSetRead>;

  /**
   * Retrieves a condition set by its ID.
   * Alias for the {@link get} method.
   *
   * @param conditionSetId The ID of the condition set.
   * @returns A promise that resolves to the condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(conditionSetId: string): Promise<ConditionSetRead>;

  /**
   * Creates a new condition set.
   *
   * @param conditionSetData The data for the new condition set.
   * @returns A promise that resolves to the created condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(conditionSetData: ConditionSetCreate): Promise<ConditionSetRead>;

  /**
   * Updates a condition set.
   *
   * @param conditionSetKey The key of the condition set.
   * @param conditionSetData The updated data for the condition set.
   * @returns A promise that resolves to the updated condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(conditionSetKey: string, conditionSetData: ConditionSetUpdate): Promise<ConditionSetRead>;

  /**
   * Deletes a condition set.
   *
   * @param conditionSetKey The key of the condition set to delete.
   * @returns A promise that resolves when the condition set is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(conditionSetKey: string): Promise<void>;
}

/**
 * The ConditionSetsApi class provides methods for interacting with condition sets using the Permit REST API.
 */
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

  /**
   * Retrieves a list of condition sets.
   *
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to an array of condition sets.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Retrieves a condition set by its key.
   *
   * @param conditionSetKey The key of the condition set.
   * @returns A promise that resolves to the condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Retrieves a condition set by its key.
   * Alias for the {@link get} method.
   *
   * @param conditionSetKey The key of the condition set.
   * @returns A promise that resolves to the condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(conditionSetKey: string): Promise<ConditionSetRead> {
    return await this.get(conditionSetKey);
  }

  /**
   * Retrieves a condition set by its ID.
   * Alias for the {@link get} method.
   *
   * @param conditionSetId The ID of the condition set.
   * @returns A promise that resolves to the condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(conditionSetId: string): Promise<ConditionSetRead> {
    return await this.get(conditionSetId);
  }

  /**
   * Creates a new condition set.
   *
   * @param conditionSetData The data for the new condition set.
   * @returns A promise that resolves to the created condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Updates a condition set.
   *
   * @param conditionSetKey The key of the condition set.
   * @param conditionSetData The updated data for the condition set.
   * @returns A promise that resolves to the updated condition set.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Deletes a condition set.
   *
   * @param conditionSetKey The key of the condition set to delete.
   * @returns A promise that resolves when the condition set is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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
