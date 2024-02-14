import { Logger } from 'pino';

import { IPermitConfig } from '../config';
import {
  RelationshipTuplesApi as AutogenRelationshipTuplesApi,
  RelationshipTupleCreate,
  RelationshipTupleCreateBulkOperation,
  RelationshipTupleDelete,
  RelationshipTupleDeleteBulkOperation,
  RelationshipTupleRead,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiContextLevel, ApiKeyLevel } from './context';

export {
  RelationshipTupleDeleteBulkOperation,
  RelationshipTupleCreateBulkOperation,
  RelationshipTupleCreate,
  RelationshipTupleDelete,
  RelationshipTupleRead,
} from '../openapi';

/**
 * Represents the parameters for listing role createments.
 */
export interface IListRelationshipTuples extends IPagination {
  /**
   * optional tenant filter, will only return relationship tuples with this tenant.
   */
  tenant?: string;
  /**
   * optional subject filter, will only return relationship tuples with this subject.
   */
  subject?: string;

  /**
   * optional relation filter, will only return relationship tuples with this relation.
   */
  relation?: string;

  /**
   * optional object filter, will only return relationship tuples with this object.
   */
  object?: string;
}

/**
 * API client for managing role createments.
 */
export interface IRelationshipTuplesApi {
  /**
   * Retrieves a list of role createments based on the specified filters.
   *
   * @param params - The filters and pagination options for listing role createments.
   * @returns A promise that resolves with an array of role createments.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(params: IListRelationshipTuples): Promise<RelationshipTupleRead[]>;

  /**
   * Creates a new relationship tuple, that states that a relationship (of type: relation)
   * exists between two resource instances: the subject and the object.
   *
   * @param tuple - The tuple to create
   * @returns A promise that resolves to the created relationship tuple.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(tuple: RelationshipTupleCreate): Promise<RelationshipTupleRead>;

  /**
   * Removes a relationship tuple.
   *
   * @param tuple - The tuple to delete
   * @returns A promise that resolves when the tuple is successfully deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(tuple: RelationshipTupleDelete): Promise<void>;

  /**
   * Creates multiple relationship tuples at once using the provided tuple data.
   * Each tuple object is of type RelationshipTupleCreate and is essentially a tuple of (subject, relation, object, tenant).
   *
   * @param tuples - The relationship tuples to create.
   * @returns A promise that resolves with the bulk assignment report.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  bulkRelationshipTuples(
    tuples: RelationshipTupleCreate[],
  ): Promise<RelationshipTupleCreateBulkOperation>;

  /**
   * Deletes multiple relationship tuples at once using the provided tuple data.
   * Each tuple object is of type RelationshipTupleDelete and is essentially a tuple of (subject, relation, object).
   *
   * @param tuples - he relationship tuples to delete.
   * @returns A promise that resolves with the bulk un relationship tuples report.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  bulkUnRelationshipTuples(
    tuples: RelationshipTupleDelete[],
  ): Promise<RelationshipTupleDeleteBulkOperation>;
}

/**
 * The RelationshipTuplesApi class provides methods for interacting with Role createments.
 */
export class RelationshipTuplesApi extends BasePermitApi implements IRelationshipTuplesApi {
  private relationshipTuples: AutogenRelationshipTuplesApi;

  /**
   * Creates an instance of the RelationshipTuplesApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.relationshipTuples = new AutogenRelationshipTuplesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of role createments based on the specified filters.
   *
   * @param params - The filters and pagination options for listing role createments.
   * @returns A promise that resolves with an array of role createments.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(params: IListRelationshipTuples): Promise<RelationshipTupleRead[]> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    // TODO: add filters: subject, relation, object
    const { page = 1, perPage = 100, subject, object, relation, tenant } = params;
    try {
      return (
        await this.relationshipTuples.listRelationshipTuples({
          ...this.config.apiContext.environmentContext,
          page,
          perPage,
          tenant,
          subject,
          relation,
          object,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Creates a new relationship tuple, that states that a relationship (of type: relation)
   * exists between two resource instances: the subject and the object.
   *
   * @param tuple - The tuple to create
   * @returns A promise that resolves to the created relationship tuple.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(tuple: RelationshipTupleCreate): Promise<RelationshipTupleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.relationshipTuples.createRelationshipTuple({
          ...this.config.apiContext.environmentContext,
          relationshipTupleCreate: tuple,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Removes a relationship tuple.
   *
   * @param tuple - The tuple to delete
   * @returns A promise that resolves when the tuple is successfully deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(tuple: RelationshipTupleDelete): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.relationshipTuples.bulkDeleteRelationshipTuples({
          ...this.config.apiContext.environmentContext,
          relationshipTupleDelete: tuple,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Creates a new relationship tuple, that states that a relationship (of type: relation)
   * exists between two resource instances: the subject and the object.
   *
   * @returns A promise that resolves to the created relationship tuple.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   * @param tuples
   */
  public async bulkRelationshipTuples(
    tuples: RelationshipTupleCreate[],
  ): Promise<RelationshipTupleCreateBulkOperation> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.relationshipTuples.bulkCreateRelationshipTuples({
          ...this.config.apiContext.environmentContext,
          relationshipTupleCreate: tuples,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Deletes multiple relationship tuples at once using the provided tuple data.
   * Each tuple object is of type RelationshipTupleDelete and is essentially a tuple of (subject, relation, object).
   *
   * @param tuples - he relationship tuples to delete.
   * @returns A promise that resolves with the bulk un relationship tuples report.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async bulkUnRelationshipTuples(
    tuples: RelationshipTupleDelete[],
  ): Promise<RelationshipTupleDeleteBulkOperation> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.relationshipTuples.bulkDeleteRelationshipTuples({
          ...this.config.apiContext.environmentContext,
          relationshipTupleDelete: tuples,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
