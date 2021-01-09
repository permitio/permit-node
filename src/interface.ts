import { ActionDefinition } from './registry';

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

export interface AuthorizonConfig {
  token: string;
  appName?: string;
  serviceName?: string;
  sidecarUrl?: string;
}
