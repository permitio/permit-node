import { Logger } from 'winston';

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
import { ApiKeyLevel } from './context';

export interface ICreateOrUpdateUserResult {
  user: UserRead;
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
  list(pagination?: IPagination): Promise<PaginatedResultUserRead>;
  get(userKey: string): Promise<UserRead>;
  getByKey(userKey: string): Promise<UserRead>;
  getById(userId: string): Promise<UserRead>;
  create(userData: UserCreate): Promise<UserRead>;
  update(userKey: string, userData: UserUpdate): Promise<UserRead>;
  sync(userData: UserCreate): Promise<ICreateOrUpdateUserResult>;
  delete(userKey: string): Promise<void>;
  assignRole(assignment: RoleAssignmentCreate): Promise<RoleAssignmentRead>;
  unassignRole(unassignment: RoleAssignmentRemove): Promise<void>;
  getAssignedRoles({ user, tenant, page, perPage }: IGetUserRoles): Promise<RoleAssignmentRead[]>;
}

export class UsersApi extends BasePermitApi implements IUsersApi {
  private users: AutogenUsersApi;
  private roleAssignments: AutogenRoleAssignmentsApi;

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

  public async list(pagination?: IPagination): Promise<PaginatedResultUserRead> {
    const { page = 1, perPage = 100 } = pagination ?? {};
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async get(userKey: string): Promise<UserRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async getByKey(userKey: string): Promise<UserRead> {
    return await this.get(userKey);
  }

  public async getById(userId: string): Promise<UserRead> {
    return await this.get(userId);
  }

  public async create(userData: UserCreate): Promise<UserRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async update(userKey: string, userData: UserUpdate): Promise<UserRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async sync(userData: UserCreate): Promise<ICreateOrUpdateUserResult> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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

  public async delete(userKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      await this.users.deleteUser({
        ...this.config.apiContext.environmentContext,
        userId: userKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async assignRole(assignment: RoleAssignmentCreate): Promise<RoleAssignmentRead> {
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

  public async unassignRole(unassignment: RoleAssignmentRemove): Promise<void> {
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

  public async getAssignedRoles({
    user,
    tenant,
    page = 1,
    perPage = 100,
  }: IGetUserRoles): Promise<RoleAssignmentRead[]> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
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
