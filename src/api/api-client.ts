import { Logger } from 'winston';

import { IPermitConfig } from '../config';

import { ConditionSetRulesApi, IConditionSetRulesApi } from './condition-set-rules';
import { ConditionSetsApi, IConditionSetsApi } from './condition-sets';
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
  conditionSetRules: IConditionSetRulesApi;
  conditionSets: IConditionSetsApi;
  projects: IProjectsApi;
  environments: IEnvironmentsApi;
  actionGroups: IResourceActionGroupsApi;
  resourceActions: IResourceActionsApi;
  resourceAttributes: IResourceAttributesApi;
  resources: IResourcesApi;
  roleAssignments: IRoleAssignmentsApi;
  roles: IRolesApi;
  tenants: ITenantsApi;
  users: IUsersApi;
}

export class ApiClient extends DeprecatedApiClient implements IPermitApi {
  public readonly conditionSetRules: IConditionSetRulesApi;
  public readonly conditionSets: IConditionSetsApi;
  public readonly projects: IProjectsApi;
  public readonly environments: IEnvironmentsApi;
  public readonly actionGroups: IResourceActionGroupsApi;
  public readonly resourceActions: IResourceActionsApi;
  public readonly resourceAttributes: IResourceAttributesApi;
  public readonly resources: IResourcesApi;
  public readonly roleAssignments: IRoleAssignmentsApi;
  public readonly roles: IRolesApi;
  public readonly tenants: ITenantsApi;
  public readonly users: IUsersApi;

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
