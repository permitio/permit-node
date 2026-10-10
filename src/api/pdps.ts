import { type Logger } from 'pino';

import { type IPermitConfig } from '#src/config';
import {
  PolicyDecisionPointsApi as AutogenPolicyDecisionPointsApi,
  type PDPDataRefreshRequest,
  type PDPDataRefreshResponse,
} from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';

import { BasePermitApi } from '#src/api/base';
// oxlint-disable-next-line no-unused-vars -- Type imports resolve public TSDoc error links.
import type { PermitApiError } from '#src/api/base';
import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';
// oxlint-disable-next-line no-unused-vars -- Type imports resolve public TSDoc error links.
import type { PermitContextError } from '#src/api/context';

export { type PDPDataRefreshResponse } from '#src/openapi/index';

/** Environment-wide refresh accepts a reason; shard targeting is a per-PDP operation. */
export type IEnvironmentPdpDataRefreshRequest = Pick<PDPDataRefreshRequest, 'reason'>;

/** Manages environment-wide PDP data refresh requests through the control plane. */
export interface IPdpsApi {
  /**
   * Requests a data refresh for all PDP configurations in the selected environment.
   * Requires an API key with write access to those configurations.
   * @param request - An optional human-readable reason. Environment refresh does not accept a shard.
   * @returns The update ID and targeted PDP IDs. This acknowledges the request, not completion.
   * @throws {@link PermitApiError} If no PDP configurations exist or the API rejects the request.
   * @throws {@link PermitContextError} If the environment context or API key is insufficient.
   */
  refresh(request?: IEnvironmentPdpDataRefreshRequest): Promise<PDPDataRefreshResponse>;
}

/** Control-plane client for environment-wide PDP refresh. */
export class PdpsApi extends BasePermitApi implements IPdpsApi {
  private pdps: AutogenPolicyDecisionPointsApi;

  /**
   * Creates a PDP management client.
   * @param config - The SDK configuration and selected API context.
   * @param logger - The SDK logger.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.pdps = new AutogenPolicyDecisionPointsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Requests a data refresh for all PDP configurations in the selected environment.
   * Requires an API key with write access to those configurations.
   * @param request - An optional human-readable reason. Environment refresh does not accept a shard.
   * @returns The update ID and targeted PDP IDs. This acknowledges the request, not completion.
   * @throws {@link PermitApiError} If no PDP configurations exist or the API rejects the request.
   * @throws {@link PermitContextError} If the environment context or API key is insufficient.
   */
  public async refresh(
    request?: IEnvironmentPdpDataRefreshRequest,
  ): Promise<PDPDataRefreshResponse> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.pdps.refreshEnvironmentPdpData({
          ...this.config.apiContext.environmentContext,
          ...(request !== undefined && { pDPDataRefreshRequest: request }),
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
