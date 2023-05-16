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

export interface IApiClient {
  api: IPermitApi;
}

export class ApiClient {
  private deprecatedApi: DeprecatedApiClient;

  public conditionSetRules: IConditionSetRulesApi;
  public conditionSets: IConditionSetsApi;
  public projects: IProjectsApi;
  public environments: IEnvironmentsApi;
  public actionGroups: IResourceActionGroupsApi;
  public resourceActions: IResourceActionsApi;
  public resourceAttributes: IResourceAttributesApi;
  public resources: IResourcesApi;
  public roleAssignments: IRoleAssignmentsApi;
  public roles: IRolesApi;
  public tenants: ITenantsApi;
  public users: IUsersApi;

  constructor(config: IPermitConfig, logger: Logger) {
    this.deprecatedApi = new DeprecatedApiClient(config, logger);

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

  public get api(): IPermitApi {
    return {
      // deprecated
      ...this.deprecatedApi.getMethods(),
      // new api
      conditionSetRules: this.conditionSetRules,
      conditionSets: this.conditionSets,
      projects: this.projects,
      environments: this.environments,
      actionGroups: this.actionGroups,
      resourceActions: this.resourceActions,
      resourceAttributes: this.resourceAttributes,
      resources: this.resources,
      roleAssignments: this.roleAssignments,
      roles: this.roles,
      tenants: this.tenants,
      users: this.users,
    };
  }

  public getMethods(): IApiClient {
    return {
      api: this.api,
    };
  }
}
