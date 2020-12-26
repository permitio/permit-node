import { ResourceDefinition, ActionDefinition } from "./registry";
import { AuthorizonConfig, authorizationClient, ResourceStub } from "./client";
import { enforcer } from './enforcer';
import { sidecarUrl } from "./constants";

export interface ResourceConfig {
  name: string;
  type: string;
  path: string;
  description?: string;
  actions?: ActionDefinition[];
  attributes?: Record<string, any>;
}

export interface ActionConfig {
  name: string;
  title?: string;
  description?: string;
  path?: string;
  attributes?: Record<string, any>;
}

export const init = (
  config: AuthorizonConfig
): void => {
  console.log(`authorizon.init(), sidecarUrl: ${sidecarUrl}`);
  authorizationClient.initialize(config);
}

export const resource = (config: ResourceConfig): ResourceStub => {
  const resource = new ResourceDefinition(
    config.name,
    config.type,
    config.path,
    config.description,
    config.actions || [],
    config.attributes || {},
  );
  return authorizationClient.addResource(resource);
}

export const action = (config: ActionConfig): ActionDefinition => {
  return new ActionDefinition(
    config.name,
    config.title,
    config.description,
    config.path,
    config.attributes || {},
  );
}

export const syncUser = authorizationClient.syncUser;
export const syncOrg = authorizationClient.syncOrg;
export const deleteOrg = authorizationClient.deleteOrg;
export const addUserToOrg = authorizationClient.addUserToOrg;
export const getOrgsForUser = authorizationClient.getOrgsForUser;
export const assignRole = authorizationClient.assignRole;
export const updatePolicyData = authorizationClient.updatePolicyData;

export const isAllowed = enforcer.isAllowed;
export const transformResourceContext = enforcer.addTransform;

const authorizon = {
  init: init,
  resource: resource,
  action: action,
  syncUser: syncUser,
  syncOrg: syncOrg,
  deleteOrg: deleteOrg,
  addUserToOrg: addUserToOrg,
  getOrgsForUser: getOrgsForUser,
  assignRole: assignRole,
  updatePolicyData: updatePolicyData,
  isAllowed: isAllowed,
  transformResourceContext: transformResourceContext,
};

export default authorizon;
