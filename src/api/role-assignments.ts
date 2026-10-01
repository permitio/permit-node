import { type Logger } from 'pino';

import { type IPermitConfig } from '#src/config';
import {
  RoleAssignmentsApi as AutogenRoleAssignmentsApi,
  Configuration,
  type BulkRoleAssignmentReport,
  type BulkRoleUnAssignmentReport,
  type PaginatedResultRoleAssignmentDetailedRead,
  type PaginatedResultRoleAssignmentRead,
  type RoleAssignmentCreate,
  type RoleAssignmentDetailedRead,
  type RoleAssignmentRead,
  type RoleAssignmentRemove,
} from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';

import { BaseFactsPermitAPI, type IBasePaginationExtended, type IWaitForSync } from '#src/api/base';
import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';

export {
  type BulkRoleAssignmentReport,
  type BulkRoleUnAssignmentReport,
  type PaginatedResultRoleAssignmentDetailedRead,
  type PaginatedResultRoleAssignmentRead,
  type RoleAssignmentCreate,
  type RoleAssignmentRead,
  type RoleAssignmentDetailedRead,
  type RoleAssignmentRemove,
} from '#src/openapi/index';

/**
 * Represents the parameters for listing role assignments.
 */
export interface IBaseListRoleAssignments extends IBasePaginationExtended {
  /**
   * optional user filter, will only return role assignments granted to this user.
   */
  user?: string;

  /**
   * optional role filter, will only return role assignments granting this role.
   */
  role?: string;

  /**
   * optional tenant filter, will only return role assignments granted in that tenant.
   */
  tenant?: string;

  /**
   * optional resource instance filter, will only return (resource) role assignments granted on that resource instance.
   */
  resourceInstance?: string;

  /**
   * optional detailed flag, will return detailed role assignments.
   */
  detailed?: boolean;
}

export type IListRoleAssignments = IBaseListRoleAssignments;

/** Filters for the dedicated detailed endpoint, which always includes total counts. */
export type IListRoleAssignmentsDetailed = Omit<
  IBaseListRoleAssignments,
  'detailed' | 'includeTotalCount'
> & {
  /** Resource type key or ID to filter by. */
  resource?: string;
};

type RoleAssignmentListResult<Details, Counts> = Details extends true
  ? Counts extends true
    ? PaginatedResultRoleAssignmentDetailedRead
    : RoleAssignmentDetailedRead[]
  : Counts extends true
    ? PaginatedResultRoleAssignmentRead
    : RoleAssignmentRead[];

export type ReturnListRoleAssignments<T extends IListRoleAssignments> = T extends unknown
  ? RoleAssignmentListResult<
      'detailed' extends keyof T ? T['detailed'] : false,
      'includeTotalCount' extends keyof T ? T['includeTotalCount'] : false
    >
  : never;

/**
 * API client for managing role assignments.
 */
export interface IRoleAssignmentsApi extends IWaitForSync {
  /**
   * Retrieves a list of role assignments based on the specified filters.
   *
   * @param params - The filters and pagination options for listing role assignments.
   * @returns A promise that resolves with an array of role assignments.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list<T extends IListRoleAssignments>(params: T): Promise<ReturnListRoleAssignments<T>>;

  /**
   * Lists role assignments with nested details through the dedicated endpoint.
   * Uses the control plane even when facts proxying or waitForSync is enabled.
   * @param params - Filters and pagination. Pages start at 1; perPage defaults to 100.
   * @returns The complete detailed envelope, including data, total_count, and optional page_count.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the environment context or API key is insufficient.
   */
  listDetailed(
    params?: IListRoleAssignmentsDetailed,
  ): Promise<PaginatedResultRoleAssignmentDetailedRead>;

  /**
   * Assigns a role to a user in the scope of a given tenant.
   *
   * @param assignment - The role assignment details.
   * @returns A promise that resolves with the assigned role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  assign(assignment: RoleAssignmentCreate): Promise<RoleAssignmentRead>;

  /**
   * Unassigns a role from a user in the scope of a given tenant.
   *
   * @param unassignment - The role unassignment details.
   * @returns A promise that resolves when the role is successfully unassigned.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  unassign(unassignment: RoleAssignmentRemove): Promise<void>;

  /**
   * Assigns multiple roles in bulk using the provided role assignments data.
   * Each role assignment is a tuple of (user, role, tenant).
   *
   * @param assignments - The role assignments to be performed in bulk.
   * @returns A promise that resolves with the bulk assignment report.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  bulkAssign(assignments: RoleAssignmentCreate[]): Promise<BulkRoleAssignmentReport>;

  /**
   * Removes multiple role assignments in bulk using the provided unassignment data.
   * Each role to unassign is a tuple of (user, role, tenant).
   *
   * @param unassignments - The role unassignments to be performed in bulk.
   * @returns A promise that resolves with the bulk unassignment report.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  bulkUnassign(unassignments: RoleAssignmentRemove[]): Promise<BulkRoleUnAssignmentReport>;
}

/**
 * The RoleAssignmentsApi class provides methods for interacting with Role Assignments.
 */
export class RoleAssignmentsApi extends BaseFactsPermitAPI implements IRoleAssignmentsApi {
  private roleAssignments: AutogenRoleAssignmentsApi;
  private detailedRoleAssignments: AutogenRoleAssignmentsApi;

  /**
   * Creates an instance of the RoleAssignmentsApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.detailedRoleAssignments = new AutogenRoleAssignmentsApi(
      new Configuration({
        basePath: this.config.apiUrl,
        accessToken: this.config.token,
        baseOptions: {
          headers: {
            'X-Permit-SDK-Version':
              this.openapiClientConfig.baseOptions.headers['X-Permit-SDK-Version'],
          },
        },
      }),
      BASE_PATH,
      this.config.axiosInstance,
    );
    this.roleAssignments = new AutogenRoleAssignmentsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Lists role assignments with nested details through the dedicated endpoint.
   * Uses the control plane even when facts proxying or waitForSync is enabled.
   * @param params - Filters and pagination. Pages start at 1; perPage defaults to 100.
   * @returns The complete detailed envelope, including data, total_count, and optional page_count.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the environment context or API key is insufficient.
   */
  public async listDetailed({
    user,
    tenant,
    role,
    resource,
    resourceInstance,
    page = 1,
    perPage = 100,
  }: IListRoleAssignmentsDetailed = {}): Promise<PaginatedResultRoleAssignmentDetailedRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.detailedRoleAssignments.listRoleAssignmentsDetailed({
          ...this.config.apiContext.environmentContext,
          ...(user !== undefined && { user: [user] }),
          ...(tenant !== undefined && { tenant: [tenant] }),
          ...(role !== undefined && { role: [role] }),
          ...(resource !== undefined && { resource }),
          ...(resourceInstance !== undefined && { resourceInstance }),
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a list of role assignments based on the specified filters.
   *
   * @param params - The filters and pagination options for listing role assignments.
   * @returns A promise that resolves with an array of role assignments.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list<T extends IListRoleAssignments>(
    params: T,
  ): Promise<ReturnListRoleAssignments<T>>;
  public async list(
    params: IListRoleAssignments,
  ): Promise<
    | Array<RoleAssignmentRead>
    | Array<RoleAssignmentDetailedRead>
    | PaginatedResultRoleAssignmentRead
    | PaginatedResultRoleAssignmentDetailedRead
  > {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    const {
      user,
      tenant,
      role,
      resourceInstance,
      page = 1,
      perPage = 100,
      detailed,
      includeTotalCount,
    } = params;
    try {
      return (
        await this.roleAssignments.listRoleAssignments({
          ...this.config.apiContext.environmentContext,
          ...(user !== undefined && { user: [user] }),
          ...(tenant !== undefined && { tenant: [tenant] }),
          ...(role !== undefined && { role: [role] }),
          ...(resourceInstance !== undefined && { resourceInstance }),
          ...(detailed !== undefined && { detailed }),
          page,
          perPage,
          ...(includeTotalCount !== undefined && { includeTotalCount }),
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Assigns a role to a user in the scope of a given tenant.
   *
   * @param assignment - The role assignment details.
   * @returns A promise that resolves with the assigned role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async assign(assignment: RoleAssignmentCreate): Promise<RoleAssignmentRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.roleAssignments.assignRole({
          ...this.config.apiContext.environmentContext,
          roleAssignmentCreate: assignment,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Unassigns a role from a user in the scope of a given tenant.
   *
   * @param unassignment - The role unassignment details.
   * @returns A promise that resolves when the role is successfully unassigned.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async unassign(unassignment: RoleAssignmentRemove): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.roleAssignments.unassignRole({
        ...this.config.apiContext.environmentContext,
        roleAssignmentRemove: unassignment,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Assigns multiple roles in bulk using the provided role assignments data.
   * Each role assignment is a tuple of (user, role, tenant).
   *
   * @param assignments - The role assignments to be performed in bulk.
   * @returns A promise that resolves with the bulk assignment report.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async bulkAssign(assignments: RoleAssignmentCreate[]): Promise<BulkRoleAssignmentReport> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.roleAssignments.bulkAssignRole({
          ...this.config.apiContext.environmentContext,
          roleAssignmentCreate: assignments,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Removes multiple role assignments in bulk using the provided unassignment data.
   * Each role to unassign is a tuple of (user, role, tenant).
   *
   * @param unassignments - The role unassignments to be performed in bulk.
   * @returns A promise that resolves with the bulk unassignment report.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async bulkUnassign(
    unassignments: RoleAssignmentRemove[],
  ): Promise<BulkRoleUnAssignmentReport> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.roleAssignments.bulkUnassignRole({
          ...this.config.apiContext.environmentContext,
          roleAssignmentRemove: unassignments,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
