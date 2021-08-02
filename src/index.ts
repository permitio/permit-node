import { authorizationClient } from './client';
// For regular require
export { action, init, resource } from './commands';
export { decorate } from './instrument/decorator';
// For Default export
import { action, init, resource } from './commands';
import { decorate } from './instrument/decorator';
import { enforcer } from './enforcer';
import { hook } from './instrument/plugin';
import { resourceRegistry } from './registry';

// Set hooks to auto decorate host application
hook();

const client = authorizationClient;
export const syncUser = client.syncUser.bind(client);
export const deleteUser = client.deleteUser.bind(client);
export const getUser = client.getUser.bind(client);
export const syncOrg = client.syncOrg.bind(client);
export const deleteOrg = client.deleteOrg.bind(client);
export const getOrg = client.getOrg.bind(client);
export const addUserToOrg = client.addUserToOrg.bind(client);
export const removeUserFromOrg = client.removeUserFromOrg.bind(client);
export const getOrgsForUser = client.getOrgsForUser.bind(client);
export const getUserRoles = client.getUserRoles.bind(client);
export const getRole = client.getRole.bind(client);
export const assignRole = client.assignRole.bind(client);
export const unassignRole = client.unassignRole.bind(client);
export const updatePolicyData = client.updatePolicyData.bind(client);

export const isAllowed = enforcer.isAllowed.bind(enforcer);
export const transformResourceContext = enforcer.addResourceContextTransform.bind(enforcer);
export const provideContext = enforcer.addContext.bind(enforcer);
export const getResourceAndAction = resourceRegistry.getResourceAndActionFromRequestParams.bind(resourceRegistry);

// local api
export const isUserSynced = client.isUserSynced.bind(client);
export const getLocallyCachedUser = client.getLocallyCachedUser.bind(client);
export const getLocallyCachedUserList = client.getLocallyCachedUserList.bind(client);
export const getLocallyCachedUserOrgs = client.getLocallyCachedUserOrgs.bind(client);
export const getLocallyCachedUserRoles = client.getLocallyCachedUserRoles.bind(client);
export const getLocallyCachedRoleList = client.getLocallyCachedRoleList.bind(client);
export const getLocallyCachedRoleById = client.getLocallyCachedRoleById.bind(client);
export const getLocallyCachedRoleByName = client.getLocallyCachedRoleByName.bind(client);

const authorizon = {
  init: init,
  resource: resource,
  action: action,
  syncUser: syncUser,
  deleteUser: deleteUser,
  getUser: getUser,
  syncOrg: syncOrg,
  deleteOrg: deleteOrg,
  getOrg: getOrg,
  addUserToOrg: addUserToOrg,
  removeUserFromOrg: removeUserFromOrg,
  getOrgsForUser: getOrgsForUser,
  getUserRoles: getUserRoles,
  getRole: getRole,
  assignRole: assignRole,
  unassignRole: unassignRole,
  updatePolicyData: updatePolicyData,
  isAllowed: isAllowed,
  transformResourceContext: transformResourceContext,
  provideContext: provideContext,
  decorate: decorate,
  getResourceAndAction: getResourceAndAction,

  // local api
  isUserSynced: isUserSynced,
  getLocallyCachedUser: getLocallyCachedUser,
  getLocallyCachedUserList: getLocallyCachedUserList,
  getLocallyCachedUserOrgs: getLocallyCachedUserOrgs,
  getLocallyCachedUserRoles: getLocallyCachedUserRoles,
  getLocallyCachedRoleList: getLocallyCachedRoleList,
  getLocallyCachedRoleById: getLocallyCachedRoleById,
  getLocallyCachedRoleByName: getLocallyCachedRoleByName,
};

export default authorizon;
