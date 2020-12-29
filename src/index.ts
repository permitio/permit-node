import { authorizationClient, AuthorizonConfig, ResourceStub } from './client';
import { sidecarUrl } from './constants';
import { enforcer } from './enforcer';
import { hook } from './plugin';
import { ActionDefinition, ResourceDefinition } from './registry';

// Set hooks to auto decorate host application
hook();

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

export const init = (config: AuthorizonConfig): void => {
  console.log(`authorizon.init(), sidecarUrl: ${sidecarUrl}`);
  authorizationClient.initialize(config);
};

export const resource = (config: ResourceConfig): ResourceStub => {
  const resource = new ResourceDefinition(
    config.name,
    config.type,
    config.path,
    config.description,
    config.actions || [],
    config.attributes || {}
  );
  return authorizationClient.addResource(resource);
};

export const action = (config: ActionConfig): ActionDefinition => {
  return new ActionDefinition(
    config.name,
    config.title,
    config.description,
    config.path,
    config.attributes || {}
  );
};

const client = authorizationClient;
export const syncUser = client.syncUser.bind(client);
export const syncOrg = client.syncOrg.bind(client);
export const deleteOrg = client.deleteOrg.bind(client);
export const addUserToOrg = client.addUserToOrg.bind(client);
export const getOrgsForUser = client.getOrgsForUser.bind(client);
export const assignRole = client.assignRole.bind(client);
export const updatePolicyData = client.updatePolicyData.bind(client);

export const isAllowed = enforcer.isAllowed.bind(enforcer);
export const transformResourceContext = enforcer.addTransform.bind(enforcer);

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
