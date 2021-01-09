import { authorizationClient, ResourceStub } from './client';
import { enforcer } from './enforcer';
import { config } from './config';
import { logger } from './logger';
import { ActionDefinition, ResourceDefinition } from './registry';
import { ActionConfig, ResourceConfig, AuthorizonConfig } from './interface';
export { ActionConfig, ResourceConfig, AuthorizonConfig } from './interface';

export const init = (configOptions: AuthorizonConfig): void => {
  // if provided via config options, sidecar url overrides the env var.
  configOptions.sidecarUrl = configOptions.sidecarUrl ?? config.sidecarUrl;
  logger.info(`authorizon.init(), sidecarUrl: ${configOptions.sidecarUrl}`);
  authorizationClient.initialize(configOptions);
  enforcer.initialize(configOptions);
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
