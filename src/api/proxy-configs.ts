import type { Logger } from 'pino';

import type { IPermitConfig } from '#src/config';
import {
  ProxyConfigApi as AutogenProxyConfigApi,
  type ProxyConfigCreate,
  type ProxyConfigRead,
  type ProxyConfigUpdate,
} from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';
import { BasePermitApi, type IPagination } from '#src/api/base';
// oxlint-disable-next-line no-unused-vars -- Public TSDoc resolves the named REST failure.
import type { PermitApiError } from '#src/api/base';
import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';
// oxlint-disable-next-line no-unused-vars -- Public TSDoc resolves the named context failure.
import type { PermitContextError } from '#src/api/context';

export {
  AuthMechanism,
  Methods,
  MappingRuleUrlTypeEnum,
  MappingRuleUpdateUrlTypeEnum,
  type MappingRule,
  type MappingRuleUpdate,
  type ProxyConfigCreate,
  type ProxyConfigRead,
  type ProxyConfigUpdate,
  type Secret,
} from '#src/openapi/index';

/** Manages environment proxy configurations and their complete URL mapping rules. */
export interface IProxyConfigsApi {
  /**
   * Lists proxy configurations in the selected environment.
   * @param params - Pagination; page defaults to 1 and perPage to 100.
   * @returns Complete stored rows in a plain array, including the received secret values.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the environment or API key scope is insufficient.
   */
  list(params?: IPagination): Promise<ProxyConfigRead[]>;

  /**
   * Gets a proxy configuration by its key or UUID.
   * @param proxyConfigKeyOrId - The proxy configuration key or UUID.
   * @returns The complete stored configuration; any returned secret mask is preserved.
   * @throws {@link PermitApiError} If the configuration is absent or the API rejects the request.
   * @throws {@link PermitContextError} If the environment or API key scope is insufficient.
   */
  get(proxyConfigKeyOrId: string): Promise<ProxyConfigRead>;

  /**
   * Creates a proxy configuration; an existing key may return the existing configuration.
   * @param proxyConfig - The key, name, secret and optional authentication/mapping rules.
   * @returns The complete API response, preserving its secret without merging submitted values.
   * @throws {@link PermitApiError} If input cannot be JSON-serialized or the API rejects it.
   * @throws {@link PermitContextError} If the environment or API key scope is insufficient.
   */
  create(proxyConfig: ProxyConfigCreate): Promise<ProxyConfigRead>;

  /**
   * Partially updates the supplied fields; mapping rules may use should_delete for removal.
   * @param proxyConfigKeyOrId - The proxy configuration key or UUID.
   * @param proxyConfig - The name, secret, authentication mechanism and/or mapping rule updates.
   * @returns The complete API response, preserving its secret without merging submitted values.
   * @throws {@link PermitApiError} If input cannot be JSON-serialized or the API rejects it.
   * @throws {@link PermitContextError} If the environment or API key scope is insufficient.
   */
  update(proxyConfigKeyOrId: string, proxyConfig: ProxyConfigUpdate): Promise<ProxyConfigRead>;

  /**
   * Deletes a proxy configuration by its key or UUID.
   * @param proxyConfigKeyOrId - The proxy configuration key or UUID.
   * @returns A promise that resolves to undefined after successful deletion.
   * @throws {@link PermitApiError} If the configuration is absent or the API denies deletion.
   * @throws {@link PermitContextError} If the environment or API key scope is insufficient.
   */
  delete(proxyConfigKeyOrId: string): Promise<void>;
}

/** Direct control-plane client for the five published proxy configuration operations. */
export class ProxyConfigsApi extends BasePermitApi implements IProxyConfigsApi {
  private readonly proxyConfigs: AutogenProxyConfigApi;

  /**
   * Creates the proxy configuration client.
   * @param config - The SDK configuration and selected API context.
   * @param logger - The SDK logger.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.proxyConfigs = new AutogenProxyConfigApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /** {@inheritDoc IProxyConfigsApi.list} */
  public async list(params: IPagination = {}): Promise<ProxyConfigRead[]> {
    const { page = 1, perPage = 100 } = params;
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.proxyConfigs.listProxyConfigs({
          ...this.config.apiContext.environmentContext,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IProxyConfigsApi.get} */
  public async get(proxyConfigKeyOrId: string): Promise<ProxyConfigRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.proxyConfigs.getProxyConfig({
          ...this.config.apiContext.environmentContext,
          proxyConfigId: proxyConfigKeyOrId,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IProxyConfigsApi.create} */
  public async create(proxyConfig: ProxyConfigCreate): Promise<ProxyConfigRead> {
    let body: ProxyConfigCreate;
    try {
      body = structuredClone(proxyConfig);
      JSON.stringify(body);
    } catch (cause) {
      this.handleApiError(
        new Error(
          'Cannot serialize proxy configuration create body. Supply JSON-compatible fields.',
          {
            cause,
          },
        ),
      );
    }
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.proxyConfigs.createProxyConfig({
          ...this.config.apiContext.environmentContext,
          proxyConfigCreate: body,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IProxyConfigsApi.update} */
  public async update(
    proxyConfigKeyOrId: string,
    proxyConfig: ProxyConfigUpdate,
  ): Promise<ProxyConfigRead> {
    let body: ProxyConfigUpdate;
    try {
      body = structuredClone(proxyConfig);
      JSON.stringify(body);
    } catch (cause) {
      this.handleApiError(
        new Error(
          'Cannot serialize proxy configuration update body. Supply JSON-compatible fields.',
          {
            cause,
          },
        ),
      );
    }
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.proxyConfigs.updateProxyConfig({
          ...this.config.apiContext.environmentContext,
          proxyConfigId: proxyConfigKeyOrId,
          proxyConfigUpdate: body,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IProxyConfigsApi.delete} */
  public async delete(proxyConfigKeyOrId: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.proxyConfigs.deleteProxyConfig({
        ...this.config.apiContext.environmentContext,
        proxyConfigId: proxyConfigKeyOrId,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
