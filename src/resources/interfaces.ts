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

// new api --------------------------------------------------------------------
export interface ActionProperties {
  title?: string;
  description?: string;
  path?: string;
  attributes?: Record<string, any>;
}

export interface ResourceType {
  type: string;
  description?: string;
  attributes?: Record<string, any>;
  actions: Record<string, ActionProperties>;
}

export interface ResourceTypes {
  resources: ResourceType[];
}
