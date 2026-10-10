import type { Logger } from 'pino';

import type { IPermitConfig } from '#src/config';
import {
  AuditLogsApi as AutogenAuditLogsApi,
  type AuditLogQueryType,
  type AuditLogSortKey,
  type AuditLogsApiListAuditLogsRequest,
  type DetailedAuditLogModel,
  type LimitedPaginatedResultAuditLogModel,
} from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';
import { BasePermitApi, type IPagination } from '#src/api/base';
// oxlint-disable-next-line no-unused-vars -- Public TSDoc names the REST failure.
import type { PermitApiError } from '#src/api/base';
import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';
// oxlint-disable-next-line no-unused-vars -- Public TSDoc names the context failure.
import type { PermitContextError } from '#src/api/context';

export {
  AuditLogQueryType,
  AuditLogSortKey,
  type AuditLogModel,
  type AuditLogObjectsModel,
  type DetailedAuditLogModel,
  type LimitedPaginatedResultAuditLogModel,
  type RawData,
  type RawData1,
  type OPAEngineDecisionLog,
  type AVPEngineDecisionLog,
  type GenericEngineDecisionLog,
  type DummyEngineModel,
} from '#src/openapi/index';

/** Published audit-log filters; arrays are sent as repeated query parameters. */
export interface IListAuditLogs extends IPagination {
  /** PDP configuration UUID. */
  readonly pdpId?: string;
  /** User keys or emails; the API limits each item to 500 characters. */
  readonly users?: readonly string[];
  readonly decision?: boolean;
  readonly resources?: readonly string[];
  readonly tenant?: string;
  readonly action?: string;
  /** Numeric timestamp boundary, forwarded unchanged; units are not specified by the contract. */
  readonly timestampFrom?: number;
  /** Numeric timestamp boundary, forwarded unchanged; units are not specified by the contract. */
  readonly timestampTo?: number;
  readonly sortBy?: AuditLogSortKey;
  /** `none` includes all published query types. */
  readonly query?: AuditLogQueryType;
}

/** Reads authorization audit logs through the selected environment's control-plane API. */
export interface IAuditLogsApi {
  /**
   * Lists audit logs with the complete paginated envelope and received decision data.
   * @param params - Published filters and pagination; SDK defaults are page 1 and perPage 100.
   * @returns The complete page, including total_count, pagination_count and optional page_count.
   * @throws {@link PermitApiError} If filters cannot be copied or the API rejects the request.
   * @throws {@link PermitContextError} If the environment or API-key scope is insufficient.
   */
  list(params?: IListAuditLogs): Promise<LimitedPaginatedResultAuditLogModel>;

  /**
   * Gets the complete audit log and its raw engine data.
   * @param logId - The audit-log UUID; the service determines record availability and retention.
   * @returns The complete detailed log, retaining all published raw-data union branches.
   * @throws {@link PermitApiError} If the log is unavailable or the API rejects the request.
   * @throws {@link PermitContextError} If the environment or API-key scope is insufficient.
   */
  get(logId: string): Promise<DetailedAuditLogModel>;
}

/** Direct API transport for the two published authorization audit-log read operations. */
export class AuditLogsApi extends BasePermitApi implements IAuditLogsApi {
  private readonly auditLogs: AutogenAuditLogsApi;

  /**
   * Creates the audit-log client.
   * @param config - The SDK configuration and selected API context.
   * @param logger - The SDK logger.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.auditLogs = new AutogenAuditLogsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /** {@inheritDoc IAuditLogsApi.list} */
  public async list(params: IListAuditLogs = {}): Promise<LimitedPaginatedResultAuditLogModel> {
    let filters: Omit<AuditLogsApiListAuditLogsRequest, 'projId' | 'envId'>;
    try {
      const {
        page = 1,
        perPage = 100,
        pdpId,
        users,
        decision,
        resources,
        tenant,
        action,
        timestampFrom,
        timestampTo,
        sortBy,
        query,
      } = params;
      filters = {
        page,
        perPage,
        ...(pdpId === undefined ? {} : { pdpId }),
        ...(users === undefined ? {} : { users: [...users] }),
        ...(decision === undefined ? {} : { decision }),
        ...(resources === undefined ? {} : { resources: [...resources] }),
        ...(tenant === undefined ? {} : { tenant }),
        ...(action === undefined ? {} : { action }),
        ...(timestampFrom === undefined ? {} : { timestampFrom }),
        ...(timestampTo === undefined ? {} : { timestampTo }),
        ...(sortBy === undefined ? {} : { sortBy }),
        ...(query === undefined ? {} : { query }),
      };
    } catch (cause) {
      this.handleApiError(
        new Error('Cannot copy audit-log filters. Supply the published scalar and array fields.', {
          cause,
        }),
      );
    }
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.auditLogs.listAuditLogs({
          ...filters,
          ...this.config.apiContext.environmentContext,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IAuditLogsApi.get} */
  public async get(logId: string): Promise<DetailedAuditLogModel> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.auditLogs.getDetailedAuditLog({
          ...this.config.apiContext.environmentContext,
          logId,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
