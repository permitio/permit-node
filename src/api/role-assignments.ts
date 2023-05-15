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
import { ApiKeyLevel } from './context';

export interface IListRoleAssignments extends IPagination {
  user: string;
  tenant: string;
  role: string;
}

export interface IRoleAssignmentsApi {
  list(params: IListRoleAssignments): Promise<RoleAssignmentRead[]>;
  assign(assignment: RoleAssignmentCreate): Promise<RoleAssignmentRead>;
  unassign(unassignment: RoleAssignmentRemove): Promise<void>;
  bulkAssign(assignments: RoleAssignmentCreate[]): Promise<BulkRoleAssignmentReport>;
  bulkUnassign(unassignments: RoleAssignmentRemove[]): Promise<BulkRoleUnAssignmentReport>;
}

export class RoleAssignmentsApi extends BasePermitApi implements IRoleAssignmentsApi {
  private roleAssignments: AutogenRoleAssignmentsApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.roleAssignments = new AutogenRoleAssignmentsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  public async list(params: IListRoleAssignments): Promise<RoleAssignmentRead[]> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    const { user, tenant, role, page = 1, perPage = 100 } = params;
    try {
      return (
        await this.roleAssignments.listRoleAssignments({
          ...this.config.apiContext.environmentContext,
          user,
          tenant,
          role,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async assign(assignment: RoleAssignmentCreate): Promise<RoleAssignmentRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async unassign(unassignment: RoleAssignmentRemove): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async bulkAssign(assignments: RoleAssignmentCreate[]): Promise<BulkRoleAssignmentReport> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async bulkUnassign(
    unassignments: RoleAssignmentRemove[],
  ): Promise<BulkRoleUnAssignmentReport> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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
