import { type Logger } from 'pino';

import { type IPermitConfig } from '#src/config';

import { ConditionSetRulesApi, type IConditionSetRulesApi } from '#src/api/condition-set-rules';
import { ConditionSetsApi, type IConditionSetsApi } from '#src/api/condition-sets';
import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';
import { DeprecatedApiClient, type IDeprecatedPermitApi } from '#src/api/deprecated';
import { EnvironmentsApi, type IEnvironmentsApi } from '#src/api/environments';
import { GroupsApi, type IGroupsApi } from '#src/api/groups';
import { type IPdpsApi, PdpsApi } from '#src/api/pdps';
import { type IProjectsApi, ProjectsApi } from '#src/api/projects';
import { type IRelationshipTuplesApi, RelationshipTuplesApi } from '#src/api/relationship-tuples';
import {
  type IResourceActionGroupsApi,
  ResourceActionGroupsApi,
} from '#src/api/resource-action-groups';
import { type IResourceActionsApi, ResourceActionsApi } from '#src/api/resource-actions';
import { type IResourceAttributesApi, ResourceAttributesApi } from '#src/api/resource-attributes';
import { type IResourceInstancesApi, ResourceInstancesApi } from '#src/api/resource-instances';
import { type IResourceRelationsApi, ResourceRelationsApi } from '#src/api/resource-relations';
import { type IResourceRolesApi, ResourceRolesApi } from '#src/api/resource-roles';
import { type IResourcesApi, ResourcesApi } from '#src/api/resources';
import { type IRoleAssignmentsApi, RoleAssignmentsApi } from '#src/api/role-assignments';
import { type IRolesApi, RolesApi } from '#src/api/roles';
import { type ITenantsApi, TenantsApi } from '#src/api/tenants';
import { type IUsersApi, UsersApi } from '#src/api/users';

export interface IPermitApi extends IDeprecatedPermitApi {
  /** API for managing groups, user membership, and resource role grants. */
  groups: IGroupsApi;

  /** API for requesting environment-wide PDP data refreshes. */
  pdps: IPdpsApi;

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
   * API for managing resource roles.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Roles}
   */
  resourceRoles: IResourceRolesApi;

  /**
   * API for managing resource relations.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Relations}
   */
  resourceRelations: IResourceRelationsApi;

  /**
   * API for managing resource instances.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Instances}
   */
  resourceInstances: IResourceInstancesApi;

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
   * API for managing relationship tuples.
   * @see {@link https://api.permit.io/v2/redoc#tag/Relationship-Tuples}
   */
  relationshipTuples: IRelationshipTuplesApi;

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
   * Ensure that the API Key has the necessary permissions to successfully call the API endpoint.
   * Note that this check is not foolproof, and the API may still throw 401.
   * @param requiredAccessLevel The required API Key Access level for the endpoint.
   * @throws PermitContextError If the currently set API key access level does not match the required access level.
   */
  ensureAccessLevel(requiredAccessLevel: ApiKeyLevel): Promise<void>;

  /**
   * Ensure that the API context matches the required endpoint context.
   * @param requiredContext The required API context level for the endpoint.
   * @throws PermitContextError If the currently set API context level does not match the required context level.
   */
  ensureContext(requiredContext: ApiContextLevel): Promise<void>;
}

export class ApiClient extends DeprecatedApiClient implements IPermitApi {
  /** API for managing groups, user membership, and resource role grants. */
  public readonly groups: IGroupsApi;

  /** API for requesting environment-wide PDP data refreshes. */
  public readonly pdps: IPdpsApi;

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
   * API for managing resource roles.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Roles}
   */
  public readonly resourceRoles: IResourceRolesApi;

  /**
   * API for managing resource relations.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Relations}
   */
  public readonly resourceRelations: IResourceRelationsApi;

  /**
   * API for managing resource instances.
   * @see {@link https://api.permit.io/v2/redoc#tag/Resource-Instances}
   */
  public readonly resourceInstances: IResourceInstancesApi;

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
   * API for managing relationship tuples.
   * @see {@link https://api.permit.io/v2/redoc#tag/Relationship-Tuples}
   */
  public readonly relationshipTuples: IRelationshipTuplesApi;

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
    this.groups = new GroupsApi(config, logger);
    this.pdps = new PdpsApi(config, logger);
    this.conditionSetRules = new ConditionSetRulesApi(config, logger);
    this.conditionSets = new ConditionSetsApi(config, logger);
    this.projects = new ProjectsApi(config, logger);
    this.environments = new EnvironmentsApi(config, logger);
    this.actionGroups = new ResourceActionGroupsApi(config, logger);
    this.resourceActions = new ResourceActionsApi(config, logger);
    this.resourceAttributes = new ResourceAttributesApi(config, logger);
    this.resourceRoles = new ResourceRolesApi(config, logger);
    this.resourceRelations = new ResourceRelationsApi(config, logger);
    this.resourceInstances = new ResourceInstancesApi(config, logger);
    this.resources = new ResourcesApi(config, logger);
    this.roleAssignments = new RoleAssignmentsApi(config, logger);
    this.roles = new RolesApi(config, logger);
    this.relationshipTuples = new RelationshipTuplesApi(config, logger);
    this.tenants = new TenantsApi(config, logger);
    this.users = new UsersApi(config, logger);
  }
}
