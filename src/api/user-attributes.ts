import type { Logger } from 'pino';

import type { IPermitConfig } from '#src/config';
import {
  UserAttributesApi as AutogenUserAttributesApi,
  type ResourceAttributeCreate,
  type ResourceAttributeRead,
  type ResourceAttributeUpdate,
} from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';
import { BasePermitApi, type IPagination } from '#src/api/base';
// oxlint-disable-next-line no-unused-vars -- Public TSDoc resolves the named REST failure.
import type { PermitApiError } from '#src/api/base';
import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';
// oxlint-disable-next-line no-unused-vars -- Public TSDoc resolves the named context failure.
import type { PermitContextError } from '#src/api/context';

/** Defines the environment's user attribute schema; user values belong to the Users API. */
export interface IUserAttributesApi {
  /**
   * Lists user attribute definitions in the selected environment.
   * @param params - Optional pagination; page defaults to 1 and perPage to 100.
   * @returns The complete attribute rows, including identity, context and timestamps.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the environment or API key scope is insufficient.
   */
  list(params?: IPagination): Promise<ResourceAttributeRead[]>;

  /**
   * Gets a user attribute definition by its key or UUID.
   * @param attributeKey - The attribute key or UUID.
   * @returns The complete stored attribute definition.
   * @throws {@link PermitApiError} If the attribute is absent or the API rejects the request.
   * @throws {@link PermitContextError} If the environment or API key scope is insufficient.
   */
  get(attributeKey: string): Promise<ResourceAttributeRead>;

  /**
   * Creates a user attribute definition; it does not assign values to individual users.
   * @param attribute - The schema key, type and optional description.
   * @returns The complete stored attribute definition.
   * @throws {@link PermitApiError} If the API rejects the body or denies write access.
   * @throws {@link PermitContextError} If the environment or API key scope is insufficient.
   */
  create(attribute: ResourceAttributeCreate): Promise<ResourceAttributeRead>;

  /**
   * Partially updates a user attribute definition, overwriting the supplied fields.
   * @param attributeKey - The attribute key or UUID.
   * @param attribute - The type and/or description to update.
   * @returns The complete updated attribute definition.
   * @throws {@link PermitApiError} If the attribute is absent or the API rejects the update.
   * @throws {@link PermitContextError} If the environment or API key scope is insufficient.
   */
  update(attributeKey: string, attribute: ResourceAttributeUpdate): Promise<ResourceAttributeRead>;

  /**
   * Deletes a user attribute definition and related data; policies then see it as undefined.
   * @param attributeKey - The attribute key or UUID.
   * @returns A promise that resolves to undefined after successful deletion.
   * @throws {@link PermitApiError} If the attribute is absent or the API denies deletion.
   * @throws {@link PermitContextError} If the environment or API key scope is insufficient.
   */
  delete(attributeKey: string): Promise<void>;
}

/** Direct control-plane client for the five user attribute schema operations. */
export class UserAttributesApi extends BasePermitApi implements IUserAttributesApi {
  private readonly attributes: AutogenUserAttributesApi;

  /**
   * Creates the user attribute schema client.
   * @param config - The SDK configuration and selected API context.
   * @param logger - The SDK logger.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.attributes = new AutogenUserAttributesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /** {@inheritDoc IUserAttributesApi.list} */
  public async list(params: IPagination = {}): Promise<ResourceAttributeRead[]> {
    const { page = 1, perPage = 100 } = params;
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.attributes.listUserAttributes({
          ...this.config.apiContext.environmentContext,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IUserAttributesApi.get} */
  public async get(attributeKey: string): Promise<ResourceAttributeRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.attributes.getUserAttribute({
          ...this.config.apiContext.environmentContext,
          attributeId: attributeKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IUserAttributesApi.create} */
  public async create(attribute: ResourceAttributeCreate): Promise<ResourceAttributeRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.attributes.createUserAttribute({
          ...this.config.apiContext.environmentContext,
          resourceAttributeCreate: attribute,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IUserAttributesApi.update} */
  public async update(
    attributeKey: string,
    attribute: ResourceAttributeUpdate,
  ): Promise<ResourceAttributeRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.attributes.updateUserAttribute({
          ...this.config.apiContext.environmentContext,
          attributeId: attributeKey,
          resourceAttributeUpdate: attribute,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IUserAttributesApi.delete} */
  public async delete(attributeKey: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.attributes.deleteUserAttribute({
        ...this.config.apiContext.environmentContext,
        attributeId: attributeKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
