import { Logger } from 'winston';

import { IPermitConfig } from '../config';

import { ConditionSetRulesApi, IConditionSetRulesApi } from './condition-set-rules';
import { ConditionSetsApi, IConditionSetsApi } from './condition-sets';
import { ApiContext, ApiKeyLevel } from './context';
import { DeprecatedApiClient, IDeprecatedPermitApi } from './deprecated';
import { EnvironmentsApi, IEnvironmentsApi } from './environments';
import { IProjectsApi, ProjectsApi } from './projects';
import { IResourceActionGroupsApi, ResourceActionGroupsApi } from './resource-action-groups';
import { IResourceActionsApi, ResourceActionsApi } from './resource-actions';
import { IResourceAttributesApi, ResourceAttributesApi } from './resource-attributes';
import { IResourcesApi, ResourcesApi } from './resources';
import { IRoleAssignmentsApi, RoleAssignmentsApi } from './role-assignments';
import { IRolesApi, RolesApi } from './roles';
import { ITenantsApi, TenantsApi } from './tenants';
import { IUsersApi, UsersApi } from './users';

export interface IPermitApi extends IDeprecatedPermitApi {
  /**
   * API for managing condition set rules.
   * @see {@link https://api.permit.io/v2/redoc#tag/Condition-Set-Rules}
   */
  conditionSetRules: IConditionSetRulesApi;

  /**
   * API for managing condition sets.
   * @see {@link https://api.permit.io/v2/redoc#tag/Condition-Sets}
   */
  conditionSets: IConditionSetsApi;

  /**
   * API for managing projects.
   * @see {@link https://api.permit.io/v2/redoc#tag/Projects}
   */
  projects: IProjectsApi;

  /**
   * API for managing environments.
   * @see {@link https://api.permit.io/v2/redoc#tag/Environments}
   */
  environments: IEnvironmentsApi;

  /**
   * API for managing resource action groups.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Action-Groups}
   */
  actionGroups: IResourceActionGroupsApi;

  /**
   * API for managing resource actions.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Actions}
   */
  resourceActions: IResourceActionsApi;

  /**
   * API for managing resource attributes.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Attributes}
   */
  resourceAttributes: IResourceAttributesApi;

  /**
   * API for managing resources.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resources}
   */
  resources: IResourcesApi;

  /**
   * API for managing role assignments.
   * @see {@link https://api.permit.io/v2/redoc#tag/Role-Assignments}
   */
  roleAssignments: IRoleAssignmentsApi;

  /**
   * API for managing roles.
   * @see {@link https://api.permit.io/v2/redoc#tag/Roles}
   */
  roles: IRolesApi;

  /**
   * API for managing tenants.
   * @see {@link https://api.permit.io/v2/redoc#tag/Tenants}
   */
  tenants: ITenantsApi;

  /**
   * API for managing users.
   * @see {@link https://api.permit.io/v2/redoc#tag/Users}
   */
  users: IUsersApi;

  /**
   * Verifies that the current api context is as expected or throws exception.
   *
   * @param callLevel the required permit api context
   * @throws {@link PermitContextError} If the configured {@link ApiContext} does not match the required context.
   */
  ensureContext(callLevel: ApiKeyLevel): Promise<void>;
}

export class ApiClient extends DeprecatedApiClient implements IPermitApi {
  /**
   * API for managing condition set rules.
   * @see {@link https://api.permit.io/v2/redoc#tag/Condition-Set-Rules}
   */
  public readonly conditionSetRules: IConditionSetRulesApi;

  /**
   * API for managing condition sets.
   * @see {@link https://api.permit.io/v2/redoc#tag/Condition-Sets}
   */
  public readonly conditionSets: IConditionSetsApi;

  /**
   * API for managing projects.
   * @see {@link https://api.permit.io/v2/redoc#tag/Projects}
   */
  public readonly projects: IProjectsApi;

  /**
   * API for managing environments.
   * @see {@link https://api.permit.io/v2/redoc#tag/Environments}
   */
  public readonly environments: IEnvironmentsApi;

  /**
   * API for managing resource action groups.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Action-Groups}
   */
  public readonly actionGroups: IResourceActionGroupsApi;

  /**
   * API for managing resource actions.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Actions}
   */
  public readonly resourceActions: IResourceActionsApi;

  /**
   * API for managing resource attributes.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Attributes}
   */
  public readonly resourceAttributes: IResourceAttributesApi;

  /**
   * API for managing resources.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resources}
   */
  public readonly resources: IResourcesApi;

  /**
   * API for managing role assignments.
   * @see {@link https://api.permit.io/v2/redoc#tag/Role-Assignments}
   */
  public readonly roleAssignments: IRoleAssignmentsApi;

  /**
   * API for managing roles.
   * @see {@link https://api.permit.io/v2/redoc#tag/Roles}
   */
  public readonly roles: IRolesApi;

  /**
   * API for managing tenants.
   * @see {@link https://api.permit.io/v2/redoc#tag/Tenants}
   */
  public readonly tenants: ITenantsApi;

  /**
   * API for managing users.
   * @see {@link https://api.permit.io/v2/redoc#tag/Users}
   */
  public readonly users: IUsersApi;

  /**
   * Constructs a new instance of the ApiClient class with the specified configuration and logger.
   *
   * @param config - The configuration for the Permit API client.
   * @param logger - The logger instance.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.conditionSetRules = new ConditionSetRulesApi(config, logger);
    this.conditionSets = new ConditionSetsApi(config, logger);
    this.projects = new ProjectsApi(config, logger);
    this.environments = new EnvironmentsApi(config, logger);
    this.actionGroups = new ResourceActionGroupsApi(config, logger);
    this.resourceActions = new ResourceActionsApi(config, logger);
    this.resourceAttributes = new ResourceAttributesApi(config, logger);
    this.resources = new ResourcesApi(config, logger);
    this.roleAssignments = new RoleAssignmentsApi(config, logger);
    this.roles = new RolesApi(config, logger);
    this.tenants = new TenantsApi(config, logger);
    this.users = new UsersApi(config, logger);
  }
}
