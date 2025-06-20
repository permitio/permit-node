import { Logger } from 'pino';

import { IPermitConfig } from '../config';
import { BASE_PATH } from '../openapi/base.js';
import {
  ResourceRelationsApi as AutogenResourceRelationsApi,
  RelationCreate,
  RelationRead,
} from '../openapi/index.js';

import { BasePermitApi, IPagination, PermitApiError } from './base.js'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ApiContext, ApiContextLevel, ApiKeyLevel, PermitContextError } from './context.js'; // eslint-disable-line @typescript-eslint/no-unused-vars

export { RelationCreate, RelationRead } from '../openapi/index.js';

export interface IListRelations extends IPagination {
  resourceKey: string;
}

/**
 * Interface representing the Resource Relations API.
 */
export interface IResourceRelationsApi {
  /**
   * Retrieves a list of all resource relations that are defined for a given resource.
   * @param params - pagination and filtering params, @see {@link IListRelations}
   * @returns A promise that resolves to an array of RelationRead objects representing the relations.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(params: IListRelations): Promise<RelationRead[]>;

  /**
   * Retrieves a resource relation based on the resource key and the relation key.
   *
   * @param resourceKey - The resource key.
   * @param relationKey - The relation key.
   * @returns A promise that resolves to a RelationRead object representing the relation.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(resourceKey: string, relationKey: string): Promise<RelationRead>;

  /**
   * Retrieves an relation based on the resource key and the relation key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey - The resource key.
   * @param relationKey - The relation key.
   * @returns A promise that resolves to a RelationRead object representing the relation.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(resourceKey: string, relationKey: string): Promise<RelationRead>;

  /**
   * Retrieves an relation based on the resource ID and the relation ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId - The resource ID.
   * @param relationId - The relation ID.
   * @returns A promise that resolves to a RelationRead object representing the relation.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(resourceId: string, relationId: string): Promise<RelationRead>;

  /**
   * Creates a new resource relation.
   *
   * @param resourceKey - The resource key.
   * @param RelationData - The relation data.
   * @returns A promise that resolves to a RelationRead object representing the created relation.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(resourceKey: string, RelationData: RelationCreate): Promise<RelationRead>;

  /**
   * Deletes a relation based on the resource key and relation key.
   * @param resourceKey - The resource key.
   * @param relationKey - The relation key.
   * @returns A promise that resolves when the relation is successfully deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(resourceKey: string, relationKey: string): Promise<void>;
}

/**
 * API client for interacting with the Resource Relations API.
 */
export class ResourceRelationsApi extends BasePermitApi implements IResourceRelationsApi {
  private relationsApi: AutogenResourceRelationsApi;

  /**
   * Creates an instance of the ResourceRelationsApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.relationsApi = new AutogenResourceRelationsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of all resource relations that are defined for a given resource.
   * @param params - pagination and filtering params, @see {@link IListRelations}
   * @returns A promise that resolves to an array of RelationRead objects representing the relations.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(params: IListRelations): Promise<RelationRead[]> {
    const { resourceKey, page = 1, perPage = 100 } = params;
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.relationsApi.listResourceRelations({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a resource relation based on the resource key and the relation key.
   *
   * @param resourceKey - The resource key.
   * @param relationKey - The relation key.
   * @returns A promise that resolves to a RelationRead object representing the relation.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async get(resourceKey: string, relationKey: string): Promise<RelationRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.relationsApi.getResourceRelation({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          relationId: relationKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves an relation based on the resource key and the relation key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey - The resource key.
   * @param relationKey - The relation key.
   * @returns A promise that resolves to a RelationRead object representing the relation.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(resourceKey: string, relationKey: string): Promise<RelationRead> {
    return await this.get(resourceKey, relationKey);
  }

  /**
   * Retrieves an relation based on the resource ID and the relation ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId - The resource ID.
   * @param relationId - The relation ID.
   * @returns A promise that resolves to a RelationRead object representing the relation.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(resourceId: string, relationId: string): Promise<RelationRead> {
    return await this.get(resourceId, relationId);
  }

  /**
   * Creates a new resource relation.
   *
   * @param resourceKey - The resource key.
   * @param RelationData - The relation data.
   * @returns A promise that resolves to a RelationRead object representing the created relation.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(resourceKey: string, RelationData: RelationCreate): Promise<RelationRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.relationsApi.createResourceRelation({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          relationCreate: RelationData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Deletes a relation based on the resource key and relation key.
   * @param resourceKey - The resource key.
   * @param relationKey - The relation key.
   * @returns A promise that resolves when the relation is successfully deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(resourceKey: string, relationKey: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.relationsApi.deleteResourceRelation({
        ...this.config.apiContext.environmentContext,
        resourceId: resourceKey,
        relationId: relationKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
