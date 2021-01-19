import { authorizationClient } from './client';
// For regular require
export { action, init, resource } from './commands';
export { decorate } from './decorator';
// For Default export
import { action, init, resource } from './commands';
import { decorate } from './decorator';
import { enforcer } from './enforcer';
import { hook } from './plugin';
import { resourceRegistry } from './registry';

// Set hooks to auto decorate host application
hook();

const client = authorizationClient;
export const syncUser = client.syncUser.bind(client);
export const deleteUser = client.deleteUser.bind(client);
export const syncOrg = client.syncOrg.bind(client);
export const deleteOrg = client.deleteOrg.bind(client);
export const addUserToOrg = client.addUserToOrg.bind(client);
export const removeUserFromOrg = client.removeUserFromOrg.bind(client);
export const getOrgsForUser = client.getOrgsForUser.bind(client);
export const assignRole = client.assignRole.bind(client);
export const unassignRole = client.unassignRole.bind(client);
export const updatePolicyData = client.updatePolicyData.bind(client);

export const isAllowed = enforcer.isAllowed.bind(enforcer);
export const transformResourceContext = enforcer.addResourceContextTransform.bind(enforcer);
export const provideContext = enforcer.addContext.bind(enforcer);
export const getResourceAndAction = resourceRegistry.getResourceAndActionFromRequestParams.bind(resourceRegistry);

const authorizon = {
  init: init,
  resource: resource,
  action: action,
  syncUser: syncUser,
  deleteUser: deleteUser,
  syncOrg: syncOrg,
  deleteOrg: deleteOrg,
  addUserToOrg: addUserToOrg,
  removeUserFromOrg: removeUserFromOrg,
  getOrgsForUser: getOrgsForUser,
  assignRole: assignRole,
  unassignRole: unassignRole,
  updatePolicyData: updatePolicyData,
  isAllowed: isAllowed,
  transformResourceContext: transformResourceContext,
  provideContext: provideContext,
  decorate: decorate,
  getResourceAndAction: getResourceAndAction,
};

export default authorizon;
