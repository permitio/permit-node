import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  ResourceRolesApi as AutogenResourceRolesApi,
  ImplicitGrantsApi as AutogenRoleDerivationsApi,
  DerivedRoleRuleCreate,
  DerivedRoleRuleDelete,
  DerivedRoleRuleRead,
  PermitBackendSchemasSchemaDerivedRoleDerivedRoleSettings,
  ResourceRoleCreate,
  ResourceRoleRead,
  ResourceRoleUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiContextLevel, ApiKeyLevel } from './context';

export { ResourceRoleCreate, ResourceRoleRead, ResourceRoleUpdate } from '../openapi';

export interface IListResourceRoles extends IPagination {
  resourceKey: string;
}

export interface IRolesApi {
  /**
   * Retrieves a list of resource roles.
   *
   * @param params - pagination and filtering params, @see {@link IListResourceRoles}
   * @returns A promise that resolves to an array of roles.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(params: IListResourceRoles): Promise<ResourceRoleRead[]>;

  /**
   * Retrieves a resource role by its key.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey The key of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(resourceKey: string, roleKey: string): Promise<ResourceRoleRead>;

  /**
   * Retrieves a resource role by its key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey The key of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(resourceKey: string, roleKey: string): Promise<ResourceRoleRead>;

  /**
   * Retrieves a resource role by its ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId The ID of the resource.
   * @param roleId The ID of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(resourceId: string, roleId: string): Promise<ResourceRoleRead>;

  /**
   * Creates a new role.
   *
   * @param resourceKey The key of the resource.
   * @param roleData The data for the new role.
   * @returns A promise that resolves to the created role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(resourceKey: string, roleData: ResourceRoleCreate): Promise<ResourceRoleRead>;

  /**
   * Updates a resource role.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey The key of the role.
   * @param roleData The updated data for the role.
   * @returns A promise that resolves to the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(
    resourceKey: string,
    roleKey: string,
    roleData: ResourceRoleUpdate,
  ): Promise<ResourceRoleRead>;

  /**
   * Deletes a resource role.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey The key of the role to delete.
   * @returns A promise that resolves when the role is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(resourceKey: string, roleKey: string): Promise<void>;

  /**
   * Assigns permissions to a resource role.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey - The key of the role.
   * @param permissions - An array of permission keys (<resourceKey:actionKey>) to be assigned to the role.
   * @returns A promise that resolves to a ResourceRoleRead object representing the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  assignPermissions(
    resourceKey: string,
    roleKey: string,
    permissions: string[],
  ): Promise<ResourceRoleRead>;

  /**
   * Removes permissions from a resource role.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey - The key of the role.
   * @param permissions - An array of permission keys (<resourceKey:actionKey>) to be removed from the role.
   * @returns A promise that resolves to a ResourceRoleRead object representing the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  removePermissions(
    resourceKey: string,
    roleKey: string,
    permissions: string[],
  ): Promise<ResourceRoleRead>;
}

/**
 * The ResourceRolesApi class provides methods for interacting with Permit Roles.
 */
export class ResourceRolesApi extends BasePermitApi implements IRolesApi {
  private resourceRoles: AutogenResourceRolesApi;
  private roleDerivations: AutogenRoleDerivationsApi;

  /**
   * Creates an instance of the ResourceRolesApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.resourceRoles = new AutogenResourceRolesApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );

    this.roleDerivations = new AutogenRoleDerivationsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of resource roles.
   *
   * @param params - pagination and filtering params, @see {@link IListResourceRoles}
   * @returns A promise that resolves to an array of roles.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async list(params: IListResourceRoles): Promise<ResourceRoleRead[]> {
    const { resourceKey, page = 1, perPage = 100 } = params;
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.resourceRoles.listResourceRoles({
          ...this.config.apiContext.environmentContext,
          page,
          perPage,
          resourceId: resourceKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a resource role by its key.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey The key of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async get(resourceKey: string, roleKey: string): Promise<ResourceRoleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.resourceRoles.getResourceRole({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          roleId: roleKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Retrieves a resource role by its key.
   * Alias for the {@link get} method.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey The key of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(resourceKey: string, roleKey: string): Promise<ResourceRoleRead> {
    return await this.get(resourceKey, roleKey);
  }

  /**
   * Retrieves a resource role by its ID.
   * Alias for the {@link get} method.
   *
   * @param resourceId The ID of the resource.
   * @param roleId The ID of the role.
   * @returns A promise that resolves to the role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(resourceId: string, roleId: string): Promise<ResourceRoleRead> {
    return await this.get(resourceId, roleId);
  }

  /**
   * Creates a new role.
   *
   * @param resourceKey The key of the resource.
   * @param roleData The data for the new role.
   * @returns A promise that resolves to the created role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async create(
    resourceKey: string,
    roleData: ResourceRoleCreate,
  ): Promise<ResourceRoleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.resourceRoles.createResourceRole({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          resourceRoleCreate: roleData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Updates a resource role.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey The key of the role.
   * @param roleData The updated data for the role.
   * @returns A promise that resolves to the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async update(
    resourceKey: string,
    roleKey: string,
    roleData: ResourceRoleUpdate,
  ): Promise<ResourceRoleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.resourceRoles.updateResourceRole({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
          roleId: roleKey,
          resourceRoleUpdate: roleData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Deletes a resource role.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey The key of the role to delete.
   * @returns A promise that resolves when the role is deleted.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async delete(resourceKey: string, roleKey: string): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      await this.resourceRoles.deleteResourceRole({
        ...this.config.apiContext.environmentContext,
        resourceId: resourceKey,
        roleId: roleKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Assigns permissions to a resource role.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey - The key of the role.
   * @param permissions - An array of permission keys (<resourceKey:actionKey>) to be assigned to the role.
   * @returns A promise that resolves to a ResourceRoleRead object representing the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async assignPermissions(
    resourceKey: string,
    roleKey: string,
    permissions: string[],
  ): Promise<ResourceRoleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.resourceRoles.assignPermissionsToResourceRole({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
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
   * Removes permissions from a resource role.
   *
   * @param resourceKey The key of the resource.
   * @param roleKey - The key of the role.
   * @param permissions - An array of permission keys (<resourceKey:actionKey>) to be removed from the role.
   * @returns A promise that resolves to a ResourceRoleRead object representing the updated role.
   * @throws {@link PermitApiError} If the API returns an error HTTP status code.
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async removePermissions(
    resourceKey: string,
    roleKey: string,
    permissions: string[],
  ): Promise<ResourceRoleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.resourceRoles.removePermissionsFromResourceRole({
          ...this.config.apiContext.environmentContext,
          resourceId: resourceKey,
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

  /**
   * Create a conditional derivation from another role.
   * The derivation states that users with some other role on a related object will implicitly also be granted this role.
   *
   * @param resourceKey - The key of the resource the role belongs to.
   * @param roleKey - The key of the role.
   * @param derivationRule - A rule when to derived this role from another related role.
   * @returns A DerivedRoleRuleRead object representing the newly created role derivation.
   * @throws PermitApiError - If the API returns an error HTTP status code.
   * @throws PermitContextError - If the configured ApiContext does not match the required endpoint context.
   */
  async createRoleDerivation(
    resourceKey: string,
    roleKey: string,
    derivationRule: DerivedRoleRuleCreate,
  ): Promise<DerivedRoleRuleRead> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.roleDerivations.createImplicitGrant({
          ...this.config.apiContext.environmentContext,
          roleId: roleKey,
          derivedRoleRuleCreate: derivationRule,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Delete a role derivation.
   *
   * @param resourceKey - The key of the resource the role belongs to.
   * @param roleKey - The key of the role.
   * @param derivationRule - The details of the derivation rule to delete.
   * @throws PermitApiError - If the API returns an error HTTP status code.
   * @throws PermitContextError - If the configured ApiContext does not match the required endpoint context.
   */
  async deleteRoleDerivation(
    resourceKey: string,
    roleKey: string,
    derivationRule: DerivedRoleRuleDelete,
  ): Promise<void> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.roleDerivations.deleteImplicitGrant({
          ...this.config.apiContext.environmentContext,
          roleId: roleKey,
          derivedRoleRuleDelete: derivationRule,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  /**
   * Update the optional (ABAC) conditions when to derive this role from other roles.
   *
   * @param resourceKey - The key of the resource the role belongs to.
   * @param roleKey - The key of the role.
   * @param conditions - The conditions object.
   * @returns The updated PermitBackendSchemasSchemaDerivedRoleDerivedRoleSettings.
   * @throws PermitApiError - If the API returns an error HTTP status code.
   * @throws PermitContextError - If the configured ApiContext does not match the required endpoint context.
   */
  async updateRoleDerivationConditions(
    resourceKey: string,
    roleKey: string,
    conditions: PermitBackendSchemasSchemaDerivedRoleDerivedRoleSettings,
  ): Promise<PermitBackendSchemasSchemaDerivedRoleDerivedRoleSettings> {
    await this.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
    await this.ensureContext(ApiContextLevel.ENVIRONMENT);
    try {
      return (
        await this.roleDerivations.updateImplicitGrantsConditions({
          ...this.config.apiContext.environmentContext,
          roleId: roleKey,
          permitBackendSchemasSchemaDerivedRoleDerivedRoleSettings: conditions,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
