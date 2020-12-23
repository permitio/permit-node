import { ResourceDefinition, ActionDefinition } from "./registry";
import { AuthorizonConfig, authorizationClient, ResourceStub } from "./client";
import { enforcer } from './enforcer';
import { sidecarUrl } from "./constants";

export const init = (
  config: AuthorizonConfig
): void => {
  console.log(`authorizon.init(), sidecarUrl: ${sidecarUrl}`);
  authorizationClient.initialize(config);
}

export const resource = (
  name: string,
  type: string,
  path: string,
  description?: string,
  actions: ActionDefinition[] = [],
  attributes: Record<string, any> = {},
): ResourceStub => {
  const resource = new ResourceDefinition(
    name,
    type,
    path,
    description,
    actions,
    attributes,
  );
  return authorizationClient.addResource(resource);
}

export const action = (
  name: string,
  title?: string,
  description?: string,
  path?: string,
  attributes: Record<string, any> = {},
): ActionDefinition => {
  return new ActionDefinition(
    name,
    title,
    description,
    path,
    attributes,
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
