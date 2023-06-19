import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  RoleAssignmentsApi as AutogenRoleAssignmentsApi,
  BulkRoleAssignmentReport,
  BulkRoleUnAssignmentReport,
  RoleAssignmentCreate,
  RoleAssignmentRead,
  RoleAssignmentRemove,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiContextLevel, ApiKeyLevel } from './context';

export {
  BulkRoleAssignmentReport,
  BulkRoleUnAssignmentReport,
  RoleAssignmentCreate,
  RoleAssignmentRead,
  RoleAssignmentRemove,
} from '../openapi';

/**
 * Represents the parameters for listing role assignments.
 */
export interface IListRoleAssignments extends IPagination {
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
}

/**
 * API client for managing role assignments.
 */
export interface IRoleAssignmentsApi {
  /**
   * Retrieves a list of role assignments based on the specified filters.
   *
   * @param params - The filters and pagination options for listing role assignments.
   * @returns A promise that resolves with an array of role assignments.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(params: IListRoleAssignments): Promise<RoleAssignmentRead[]>;

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
export class RoleAssignmentsApi extends BasePermitApi implements IRoleAssignmentsApi {
  private roleAssignments: AutogenRoleAssignmentsApi;

  /**
   * Creates an instance of the RoleAssignmentsApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.roleAssignments = new AutogenRoleAssignmentsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of role assignments based on the specified filters.
   *
   * @param params - The filters and pagination options for listing role assignments.
   * @returns A promise that resolves with an array of role assignments.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(params: IListRoleAssignments): Promise<RoleAssignmentRead[]> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    const { user, tenant, role, resourceInstance, page = 1, perPage = 100 } = params;
    try {
      return (
        await this.roleAssignments.listRoleAssignments({
          ...this.config.apiContext.environmentContext,
          user,
          tenant,
          role,
          resourceInstance,
          page,
          perPage,
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
      return (
        await this.roleAssignments.unassignRole({
          ...this.config.apiContext.environmentContext,
          roleAssignmentRemove: unassignment,
        })
      ).data;
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
