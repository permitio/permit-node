import type { Logger } from 'pino';

import type { IPermitConfig } from '#src/config';
import {
  APIKeysApi as AutogenAPIKeysApi,
  type APIKeyCreate,
  type APIKeyRead,
  type APIKeyScopeRead,
  type MemberAccessObj,
  type PaginatedResultAPIKeyRead,
} from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';
import { BasePermitApi, type IPagination } from '#src/api/base';
// oxlint-disable-next-line no-unused-vars -- Public TSDoc resolves the named REST failure.
import type { PermitApiError } from '#src/api/base';

export type {
  APIKeyCreate,
  APIKeyRead,
  APIKeyScopeRead,
  PaginatedResultAPIKeyRead,
} from '#src/openapi/index';

/** Optional scope filters; project references accept a UUID or key. */
export interface IListApiKeys extends IPagination {
  /** Record scope to filter by: organization, project or environment. */
  objectType?: MemberAccessObj;
  /** Project UUID or key to filter by; this does not select the client's context. */
  projId?: string;
}

/** API-key management through the control plane; server authorization governs access. */
export interface IApiKeysApi {
  /**
   * Lists API-key records with their complete pagination envelope.
   * @param params - Optional scope filters; page defaults to 1 and perPage to 100.
   * @returns The received page, including counts and any returned optional secrets.
   * @throws {@link PermitApiError} If the API denies access or rejects the request.
   */
  list(params?: IListApiKeys): Promise<PaginatedResultAPIKeyRead>;

  /**
   * Gets an API-key record by its ID.
   * @param apiKeyId - API-key ID, not its name or secret.
   * @returns The complete record; the server may omit its secret or return null.
   * @throws {@link PermitApiError} If the record is absent or access is denied.
   */
  get(apiKeyId: string): Promise<APIKeyRead>;

  /**
   * Creates an API key with the supplied scope without injecting the client's context.
   * @param apiKey - Published creation body, including organization_id and optional scope.
   * @returns The complete received record; retain its secret securely when present.
   * @throws {@link PermitApiError} If the API rejects the body or denies creation.
   */
  create(apiKey: APIKeyCreate): Promise<APIKeyRead>;

  /**
   * Deletes an API-key record and its related data.
   * @param apiKeyId - API-key ID, not its name or secret.
   * @returns A promise resolving to undefined after successful deletion.
   * @throws {@link PermitApiError} If the record is absent or deletion is denied.
   */
  delete(apiKeyId: string): Promise<void>;

  /**
   * Rotates a key's secret with a bodyless POST; the SDK does not replay this request.
   * @param apiKeyId - API-key UUID to rotate; use a disposable key for lifecycle tests.
   * @returns The complete response; no stable record ID or always-present secret is promised.
   *   Rotation does not replace this client's configured credential.
   * @throws {@link PermitApiError} If the record is absent or rotation fails.
   */
  rotate(apiKeyId: string): Promise<APIKeyRead>;

  /**
   * Discovers the configured credential's scope without initializing API context.
   * @returns The received organization ID and optional, nullable project/environment IDs.
   * @throws {@link PermitApiError} If the credential is invalid or discovery fails.
   */
  getScope(): Promise<APIKeyScopeRead>;
}

/** Direct control-plane client for the six published API-key operations. */
export class ApiKeysApi extends BasePermitApi implements IApiKeysApi {
  private readonly keys: AutogenAPIKeysApi;

  /**
   * Creates the API-key management client.
   * @param config - SDK configuration; management does not initialize selected scope.
   * @param logger - SDK logger.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.keys = new AutogenAPIKeysApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /** {@inheritDoc IApiKeysApi.list} */
  public async list(params: IListApiKeys = {}): Promise<PaginatedResultAPIKeyRead> {
    const { objectType, projId, page = 1, perPage = 100 } = params;
    try {
      return (
        await this.keys.listApiKeys({
          ...(objectType !== undefined && { objectType }),
          ...(projId !== undefined && { projId }),
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IApiKeysApi.get} */
  public async get(apiKeyId: string): Promise<APIKeyRead> {
    try {
      return (await this.keys.getApiKey({ apiKeyId })).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IApiKeysApi.create} */
  public async create(apiKey: APIKeyCreate): Promise<APIKeyRead> {
    try {
      const body = structuredClone(apiKey);
      return (await this.keys.createApiKey({ aPIKeyCreate: body })).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IApiKeysApi.delete} */
  public async delete(apiKeyId: string): Promise<void> {
    try {
      await this.keys.deleteApiKey({ apiKeyId });
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IApiKeysApi.rotate} */
  public async rotate(apiKeyId: string): Promise<APIKeyRead> {
    try {
      return (await this.keys.rotateApiKey({ apiKeyId })).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IApiKeysApi.getScope} */
  public async getScope(): Promise<APIKeyScopeRead> {
    try {
      return (await this.keys.getApiKeyScope()).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
