import { type Logger } from 'pino';

import { type IPermitConfig } from '#src/config';
import {
  GroupsApi as AutogenGroupsApi,
  type GroupAddRole,
  type GroupAssignUser,
  type GroupCreate,
  type GroupRead,
  type GroupReadSchema,
  type PaginatedResultGroupReadSchema,
} from '#src/openapi/index';
import { BASE_PATH } from '#src/openapi/base';

import { BasePermitApi, type IPagination } from '#src/api/base';
// oxlint-disable-next-line no-unused-vars -- Type imports resolve public TSDoc error links.
import type { PermitApiError } from '#src/api/base';
import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';
// oxlint-disable-next-line no-unused-vars -- Type imports resolve public TSDoc error links.
import type { PermitContextError } from '#src/api/context';

export {
  type GroupAddRole,
  type GroupAssignUser,
  type GroupCreate,
  type GroupRead,
  type GroupReadSchema,
  type PaginatedResultGroupReadSchema,
} from '#src/openapi/index';

/** Filters and pagination for the direct Groups list. */
export interface IListGroups extends IPagination {
  /** Tenant key or ID to filter by. */
  tenant?: string;
  /** Resource type key or ID to filter by. */
  resource?: string;
  /** Text to search for in the group name or key. */
  search?: string;
}

/** Manages groups, their user membership, and resource role grants. */
export interface IGroupsApi {
  /**
   * Creates a group resource instance.
   * @param group - The group instance key, tenant, and optional resource type.
   * @returns The created group and its membership; this response does not contain an ID.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the API key or selected context is insufficient.
   */
  create(group: GroupCreate): Promise<GroupRead>;

  /**
   * Deletes a group resource instance.
   * @param groupKeyOrId - The qualified resource:instance key or internal instance ID.
   * @returns A promise that resolves when the group is deleted.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the API key or selected context is insufficient.
   */
  delete(groupKeyOrId: string): Promise<void>;

  /**
   * Lists groups through the direct endpoint.
   * @param params - Filters and pagination. Pages start at 1; perPage defaults to 100.
   * @returns The complete envelope, including data, total_count, and optional page_count.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the API key or selected context is insufficient.
   */
  list(params?: IListGroups): Promise<PaginatedResultGroupReadSchema>;

  /**
   * Gets a group through the direct endpoint.
   * @param groupKeyOrId - The qualified resource:instance key or internal instance ID.
   * @returns The group instance, including its internal ID.
   * @throws {@link PermitApiError} If the API rejects the request, including a missing group.
   * @throws {@link PermitContextError} If the API key or selected context is insufficient.
   */
  get(groupKeyOrId: string): Promise<GroupReadSchema>;

  /**
   * Adds a user to a group so the user can inherit the group's resource roles through ReBAC.
   * @param groupKeyOrId - The qualified resource:instance key or internal instance ID.
   * @param userKeyOrId - The user key or ID.
   * @param assignment - The required tenant body for the membership request.
   * @returns The updated group and its membership.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the API key or selected context is insufficient.
   */
  assignUser(
    groupKeyOrId: string,
    userKeyOrId: string,
    assignment: GroupAssignUser,
  ): Promise<GroupRead>;

  /**
   * Removes a user's membership from a group.
   * @param groupKeyOrId - The qualified resource:instance key or internal instance ID.
   * @param userKeyOrId - The user key or ID.
   * @param assignment - The required tenant body, also sent for this DELETE request.
   * @returns A promise that resolves when the membership is removed.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the API key or selected context is insufficient.
   */
  removeUser(groupKeyOrId: string, userKeyOrId: string, assignment: GroupAssignUser): Promise<void>;

  /**
   * Grants a group a resource role using relationships and role derivation through ReBAC.
   * @param groupKeyOrId - The qualified resource:instance key or internal instance ID.
   * @param assignment - The role, resource type, resource instance, and tenant identifiers.
   * @returns The updated group and its role membership.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the API key or selected context is insufficient.
   */
  assignRole(groupKeyOrId: string, assignment: GroupAddRole): Promise<GroupRead>;

  /**
   * Revokes a group's resource role grant.
   * @param groupKeyOrId - The qualified resource:instance key or internal instance ID.
   * @param assignment - The role, resource type, resource instance, and tenant identifiers.
   * @returns A promise that resolves when the role grant is removed.
   * @throws {@link PermitApiError} If the API rejects the request.
   * @throws {@link PermitContextError} If the API key or selected context is insufficient.
   */
  removeRole(groupKeyOrId: string, assignment: GroupAddRole): Promise<void>;
}

/** API client for the GA core Groups operations. */
export class GroupsApi extends BasePermitApi implements IGroupsApi {
  private readonly groupsApi: AutogenGroupsApi;

  /**
   * Creates the Groups API wrapper.
   * @param config - The SDK configuration.
   * @param logger - The SDK logger.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.groupsApi = new AutogenGroupsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /** {@inheritDoc IGroupsApi.create} */
  public async create(group: GroupCreate): Promise<GroupRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.groupsApi.createGroup({
          ...this.config.apiContext.environmentContext,
          groupCreate: group,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IGroupsApi.delete} */
  public async delete(groupKeyOrId: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.groupsApi.deleteGroup({
        ...this.config.apiContext.environmentContext,
        groupInstanceKey: groupKeyOrId,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IGroupsApi.list} */
  public async list(params: IListGroups = {}): Promise<PaginatedResultGroupReadSchema> {
    const { tenant, resource, search, page = 1, perPage = 100 } = params;
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.groupsApi.listDirectGroup({
          ...this.config.apiContext.environmentContext,
          ...(tenant !== undefined && { tenant }),
          ...(resource !== undefined && { resource }),
          ...(search !== undefined && { search }),
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IGroupsApi.get} */
  public async get(groupKeyOrId: string): Promise<GroupReadSchema> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.groupsApi.getDirectGroup({
          ...this.config.apiContext.environmentContext,
          groupInstanceKey: groupKeyOrId,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IGroupsApi.assignUser} */
  public async assignUser(
    groupKeyOrId: string,
    userKeyOrId: string,
    assignment: GroupAssignUser,
  ): Promise<GroupRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.groupsApi.assignUserToGroup({
          ...this.config.apiContext.environmentContext,
          groupInstanceKey: groupKeyOrId,
          userId: userKeyOrId,
          groupAssignUser: assignment,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IGroupsApi.removeUser} */
  public async removeUser(
    groupKeyOrId: string,
    userKeyOrId: string,
    assignment: GroupAssignUser,
  ): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.groupsApi.removeUserFromGroup({
        ...this.config.apiContext.environmentContext,
        groupInstanceKey: groupKeyOrId,
        userId: userKeyOrId,
        groupAssignUser: assignment,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IGroupsApi.assignRole} */
  public async assignRole(groupKeyOrId: string, assignment: GroupAddRole): Promise<GroupRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.groupsApi.assignRoleToGroup({
          ...this.config.apiContext.environmentContext,
          groupInstanceKey: groupKeyOrId,
          groupAddRole: assignment,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /** {@inheritDoc IGroupsApi.removeRole} */
  public async removeRole(groupKeyOrId: string, assignment: GroupAddRole): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.groupsApi.removeRoleFromGroup({
        ...this.config.apiContext.environmentContext,
        groupInstanceKey: groupKeyOrId,
        groupAddRole: assignment,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
