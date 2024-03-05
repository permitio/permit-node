import { Logger } from 'pino';

import { IPermitConfig } from '../config';
import {
  RoleAssignmentsApi as AutogenRoleAssignmentsApi,
  UsersApi as AutogenUsersApi,
  PaginatedResultUserRead,
  RoleAssignmentCreate,
  RoleAssignmentRead,
  RoleAssignmentRemove,
  UserCreate,
  UserRead,
  UserUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiContextLevel, ApiKeyLevel } from './context';

export {
  PaginatedResultUserRead,
  RoleAssignmentCreate,
  RoleAssignmentRead,
  RoleAssignmentRemove,
  UserCreate,
  UserRead,
  UserUpdate,
} from '../openapi';

export interface ICreateOrUpdateUserResult {
  /**
   * the created or updated user
   */
  user: UserRead;

  /**
   * whether the user was newly created
   */
  created: boolean;
}

export interface IGetUserRoles {
  /**
   * id or key of the user
   * @type {string}
   */
  readonly user: string;

  /**
   * optional tenant filter, will only return role assignments granted in that tenant (id or key).
   * @type {string}
   */
  readonly tenant?: string;

  /**
   * Page number of the results to fetch, starting at 1.
   * @type {number}
   */
  readonly page?: number;

  /**
   * The number of results per page (max 100).
   * @type {number}
   */
  readonly perPage?: number;
}

export interface IUsersApi {
  /**
   * Retrieves a list of users.
   *
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to a PaginatedResultUserRead object containing the list of users.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(pagination?: IPagination): Promise<PaginatedResultUserRead>;

  /**
   * Retrieves a user by its key.
   *
   * @param userKey The key of the user.
   * @returns A promise that resolves to the user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(userKey: string): Promise<UserRead>;

  /**
   * Retrieves a user by its key.
   * Alias for the {@link get} method.
   *
   * @param userKey The key of the user.
   * @returns A promise that resolves to the user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(userKey: string): Promise<UserRead>;

  /**
   * Retrieves a user by its ID.
   * Alias for the {@link get} method.
   *
   * @param userId The ID of the user.
   * @returns A promise that resolves to the user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(userId: string): Promise<UserRead>;

  /**
   * Creates a new user.
   *
   * @param userData The data for the new user.
   * @returns A promise that resolves to the created user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(userData: UserCreate): Promise<UserRead>;

  /**
   * Updates a user.
   *
   * @param userKey The key of the user.
   * @param userData The updated data for the user.
   * @returns A promise that resolves to the updated user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(userKey: string, userData: UserUpdate): Promise<UserRead>;

  /**
   * Synchronizes user data by creating or updating a user.
   *
   * @param userData - The data of the user to be synchronized.
   * @returns A promise that resolves with the result of the user creation or update operation.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  sync(userData: UserCreate): Promise<ICreateOrUpdateUserResult>;

  /**
   * Deletes a user.
   *
   * @param userKey The key of the user to delete.
   * @returns A promise that resolves when the user is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(userKey: string): Promise<void>;

  /**
   * Assigns a role to a user in the scope of a given tenant.
   *
   * @param assignment - The role assignment details.
   * @returns A promise that resolves with the assigned role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  assignRole(assignment: RoleAssignmentCreate): Promise<RoleAssignmentRead>;

  /**
   * Unassigns a role from a user in the scope of a given tenant.
   *
   * @param unassignment - The role unassignment details.
   * @returns A promise that resolves when the role is successfully unassigned from the user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  unassignRole(unassignment: RoleAssignmentRemove): Promise<void>;

  /**
   * Retrieves the roles assigned to a user in a given tenant (if the tenant filter is provided)
   * or across all tenants (if the tenant filter in not provided).
   *
   * @param roleFilters - The filters for retrieving role assignments.
   * @returns A promise that resolves with an array of role assignments for the user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getAssignedRoles({ user, tenant, page, perPage }: IGetUserRoles): Promise<RoleAssignmentRead[]>;

  /**
   * Creates users in bulk.
   *
   * @param users The array of users to create.
   * @returns A promise that resolves with the bulk create users report .
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  bulkUserCreate(users: UserCreate[]): Promise<BulkCreateUserResult>;

  /**
   * Deletes users in bulk.
   *
   * @param userKeys The array of user keys to delete.
   * @returns A promise that resolves with the bulk delete users report .
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  bulkUserDelete(userKeys: string[]): Promise<BulkDeleteUserResult>;

  /**
   * Replaces users in bulk.
   *
   * If a user exists, it will be replaced. Otherwise, it will be created.
   *
   * @param users The array of users to replace.
   * @returns A promise that resolves with the bulk replacement users report .
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  bulkUserReplace(users: UserCreate[]): Promise<BulkReplaceUserResult>;
}

/**
 * The UsersApi class provides methods for interacting with Permit Users.
 */
export class UsersApi extends BasePermitApi implements IUsersApi {
  private users: AutogenUsersApi;
  private roleAssignments: AutogenRoleAssignmentsApi;

  /**
   * Creates an instance of the UsersApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.users = new AutogenUsersApi(
      this.openapiClientConfig,
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
   * Retrieves a list of users.
   *
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to a PaginatedResultUserRead object containing the list of users.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(pagination?: IPagination): Promise<PaginatedResultUserRead> {
    const { page = 1, perPage = 100 } = pagination ?? {};
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.users.listUsers({
          ...this.config.apiContext.environmentContext,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a user by its key.
   *
   * @param userKey The key of the user.
   * @returns A promise that resolves to the user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async get(userKey: string): Promise<UserRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.users.getUser({
          ...this.config.apiContext.environmentContext,
          userId: userKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a user by its key.
   * Alias for the {@link get} method.
   *
   * @param userKey The key of the user.
   * @returns A promise that resolves to the user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(userKey: string): Promise<UserRead> {
    return await this.get(userKey);
  }

  /**
   * Retrieves a user by its ID.
   * Alias for the {@link get} method.
   *
   * @param userId The ID of the user.
   * @returns A promise that resolves to the user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(userId: string): Promise<UserRead> {
    return await this.get(userId);
  }

  /**
   * Creates a new user.
   *
   * @param userData The data for the new user.
   * @returns A promise that resolves to the created user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(userData: UserCreate): Promise<UserRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.users.createUser({
          ...this.config.apiContext.environmentContext,
          userCreate: userData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Updates a user.
   *
   * @param userKey The key of the user.
   * @param userData The updated data for the user.
   * @returns A promise that resolves to the updated user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async update(userKey: string, userData: UserUpdate): Promise<UserRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.users.updateUser({
          ...this.config.apiContext.environmentContext,
          userId: userKey,
          userUpdate: userData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Synchronizes user data by creating or updating a user.
   *
   * @param userData - The data of the user to be synchronized.
   * @returns A promise that resolves with the result of the user creation or update operation.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async sync(userData: UserCreate): Promise<ICreateOrUpdateUserResult> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      const response = await this.users.replaceUser({
        ...this.config.apiContext.environmentContext,
        userId: userData.key,
        userCreate: userData,
      });
      return {
        user: response.data,
        created: response.status === 201,
      };
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Deletes a user.
   *
   * @param userKey The key of the user to delete.
   * @returns A promise that resolves when the user is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(userKey: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.users.deleteUser({
        ...this.config.apiContext.environmentContext,
        userId: userKey,
      });
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
  public async assignRole(assignment: RoleAssignmentCreate): Promise<RoleAssignmentRead> {
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
   * @returns A promise that resolves when the role is successfully unassigned from the user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async unassignRole(unassignment: RoleAssignmentRemove): Promise<void> {
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
   * Creates users in bulk.
   *
   * @param users The array of users to create.
   * @returns A promise that resolves to the bulk creation result.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async bulkUserCreate(users: UserCreate[]): Promise<BulkCreateUserResult> {
    // Ensure access level and context
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.users.bulkCreateUsers({
          ...this.config.apiContext.environmentContext,
          usersCreateBulkOperation: {
            users: users,
          },
        })
      ).data;
    } catch (err) {
      // Handle any errors that occur during the API call
      this.handleApiError(err);
    }
  }

  /**
   * Deletes users in bulk.
   *
   * @param userKeys The array of user keys to delete.
   * @returns A promise that resolves to the bulk deletion result.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async bulkUserDelete(userKeys: string[]): Promise<BulkDeleteUserResult> {
    // Ensure access level and context
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.users.bulkDeleteUsers({
          ...this.config.apiContext.environmentContext,
          usersDeleteBulkOperation: {
            users: userKeys,
          },
        })
      ).data;
    } catch (err) {
      // Handle any errors that occur during the API call
      this.handleApiError(err);
    }
  }

  /**
   * Replaces users in bulk.
   *
   * If a user exists, it will be replaced. Otherwise, it will be created.
   *
   * @param users The array of users to replace.
   * @returns A promise that resolves to the bulk replacement result.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async bulkUserReplace(users: UserCreate[]): Promise<BulkReplaceUserResult> {
    // Ensure access level and context
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.users.bulkReplaceUsers({
          ...this.config.apiContext.environmentContext,
          usersReplaceBulkOperation: {
            users: users,
          },
        })
      ).data;
    } catch (err) {
      // Handle any errors that occur during the API call
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves the roles assigned to a user in a given tenant (if the tenant filter is provided)
   * or across all tenants (if the tenant filter in not provided).
   *
   * @param roleFilters - The filters for retrieving role assignments.
   * @returns A promise that resolves with an array of role assignments for the user.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getAssignedRoles({
    user,
    tenant,
    page = 1,
    perPage = 100,
  }: IGetUserRoles): Promise<RoleAssignmentRead[]> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.roleAssignments.listRoleAssignments({
          ...this.config.apiContext.environmentContext,
          user,
          tenant,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
