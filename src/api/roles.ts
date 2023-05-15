import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import { RolesApi as AutogenRolesApi, RoleCreate, RoleRead, RoleUpdate } from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiKeyLevel } from './context';

export interface IRolesApi {
  list(pagination?: IPagination): Promise<RoleRead[]>;
  get(roleKey: string): Promise<RoleRead>;
  getByKey(roleKey: string): Promise<RoleRead>;
  getById(roleId: string): Promise<RoleRead>;
  create(roleData: RoleCreate): Promise<RoleRead>;
  update(roleKey: string, roleData: RoleUpdate): Promise<RoleRead>;
  delete(roleKey: string): Promise<void>;
  assignPermissions(roleKey: string, permissions: string[]): Promise<RoleRead>;
  removePermissions(roleKey: string, permissions: string[]): Promise<RoleRead>;
}

export class RolesApi extends BasePermitApi implements IRolesApi {
  private roles: AutogenRolesApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.roles = new AutogenRolesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  public async list(pagination?: IPagination): Promise<RoleRead[]> {
    const { page = 1, perPage = 100 } = pagination ?? {};
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.roles.listRoles({
          ...this.config.apiContext.environmentContext,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async get(roleKey: string): Promise<RoleRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.roles.getRole({
          ...this.config.apiContext.environmentContext,
          roleId: roleKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async getByKey(roleKey: string): Promise<RoleRead> {
    return await this.get(roleKey);
  }

  public async getById(roleId: string): Promise<RoleRead> {
    return await this.get(roleId);
  }

  public async create(roleData: RoleCreate): Promise<RoleRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.roles.createRole({
          ...this.config.apiContext.environmentContext,
          roleCreate: roleData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async update(roleKey: string, roleData: RoleUpdate): Promise<RoleRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.roles.updateRole({
          ...this.config.apiContext.environmentContext,
          roleId: roleKey,
          roleUpdate: roleData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async delete(roleKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      await this.roles.deleteRole({
        ...this.config.apiContext.environmentContext,
        roleId: roleKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async assignPermissions(roleKey: string, permissions: string[]): Promise<RoleRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.roles.assignPermissionsToRole({
          ...this.config.apiContext.environmentContext,
          roleId: roleKey,
          addRolePermissions: {
            permissions,
          },
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async removePermissions(roleKey: string, permissions: string[]): Promise<RoleRead> {
    await this.ensureContext(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    try {
      return (
        await this.roles.removePermissionsFromRole({
          ...this.config.apiContext.environmentContext,
          roleId: roleKey,
          removeRolePermissions: {
            permissions,
          },
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
