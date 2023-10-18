import { Logger } from 'pino';

import { IPermitConfig } from '../config';
import { RolesApi as AutogenRolesApi, RoleCreate, RoleRead, RoleUpdate } from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiContextLevel, ApiKeyLevel } from './context';

export { RoleCreate, RoleRead, RoleUpdate } from '../openapi';

export interface IRolesApi {
  /**
   * Retrieves a list of roles.
   *
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to an array of roles.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(pagination?: IPagination): Promise<RoleRead[]>;

  /**
   * Retrieves a role by its key.
   *
   * @param roleKey The key of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(roleKey: string): Promise<RoleRead>;

  /**
   * Retrieves a role by its key.
   * Alias for the {@link get} method.
   *
   * @param roleKey The key of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(roleKey: string): Promise<RoleRead>;

  /**
   * Retrieves a role by its ID.
   * Alias for the {@link get} method.
   *
   * @param roleId The ID of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(roleId: string): Promise<RoleRead>;

  /**
   * Creates a new role.
   *
   * @param roleData The data for the new role.
   * @returns A promise that resolves to the created role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(roleData: RoleCreate): Promise<RoleRead>;

  /**
   * Updates a role.
   *
   * @param roleKey The key of the role.
   * @param roleData The updated data for the role.
   * @returns A promise that resolves to the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(roleKey: string, roleData: RoleUpdate): Promise<RoleRead>;

  /**
   * Deletes a role.
   *
   * @param roleKey The key of the role to delete.
   * @returns A promise that resolves when the role is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(roleKey: string): Promise<void>;

  /**
   * Assigns permissions to a role.
   * @param roleKey - The key of the role.
   * @param permissions - An array of permission keys (<resourceKey:actionKey>) to be assigned to the role.
   * @returns A promise that resolves to a RoleRead object representing the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  assignPermissions(roleKey: string, permissions: string[]): Promise<RoleRead>;

  /**
   * Removes permissions from a role.
   * @param roleKey - The key of the role.
   * @param permissions - An array of permission keys (<resourceKey:actionKey>) to be removed from the role.
   * @returns A promise that resolves to a RoleRead object representing the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  removePermissions(roleKey: string, permissions: string[]): Promise<RoleRead>;
}

/**
 * The RolesApi class provides methods for interacting with Permit Roles.
 */
export class RolesApi extends BasePermitApi implements IRolesApi {
  private roles: AutogenRolesApi;

  /**
   * Creates an instance of the RolesApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.roles = new AutogenRolesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of roles.
   *
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to an array of roles.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(pagination?: IPagination): Promise<RoleRead[]> {
    const { page = 1, perPage = 100 } = pagination ?? {};
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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

  /**
   * Retrieves a role by its key.
   *
   * @param roleKey The key of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async get(roleKey: string): Promise<RoleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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

  /**
   * Retrieves a role by its key.
   * Alias for the {@link get} method.
   *
   * @param roleKey The key of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(roleKey: string): Promise<RoleRead> {
    return await this.get(roleKey);
  }

  /**
   * Retrieves a role by its ID.
   * Alias for the {@link get} method.
   *
   * @param roleId The ID of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(roleId: string): Promise<RoleRead> {
    return await this.get(roleId);
  }

  /**
   * Creates a new role.
   *
   * @param roleData The data for the new role.
   * @returns A promise that resolves to the created role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(roleData: RoleCreate): Promise<RoleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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

  /**
   * Updates a role.
   *
   * @param roleKey The key of the role.
   * @param roleData The updated data for the role.
   * @returns A promise that resolves to the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async update(roleKey: string, roleData: RoleUpdate): Promise<RoleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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

  /**
   * Deletes a role.
   *
   * @param roleKey The key of the role to delete.
   * @returns A promise that resolves when the role is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(roleKey: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.roles.deleteRole({
        ...this.config.apiContext.environmentContext,
        roleId: roleKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Assigns permissions to a role.
   * @param roleKey - The key of the role.
   * @param permissions - An array of permission keys (<resourceKey:actionKey>) to be assigned to the role.
   * @returns A promise that resolves to a RoleRead object representing the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async assignPermissions(roleKey: string, permissions: string[]): Promise<RoleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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

  /**
   * Removes permissions from a role.
   * @param roleKey - The key of the role.
   * @param permissions - An array of permission keys (<resourceKey:actionKey>) to be removed from the role.
   * @returns A promise that resolves to a RoleRead object representing the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async removePermissions(roleKey: string, permissions: string[]): Promise<RoleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
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
