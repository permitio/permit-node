import { authorizationClient, AuthorizonConfig, ResourceStub } from './client';
import { config } from './config';
import { logger } from './logger';
import { ActionDefinition, ResourceDefinition } from './registry';

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

export const init = (configOptions: AuthorizonConfig): void => {
  logger.info(`authorizon.init(), sidecarUrl: ${config.sidecarUrl}`);
  authorizationClient.initialize(configOptions);
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
