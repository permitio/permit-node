import _ from 'lodash';

import { ActionConfig, ResourceConfig } from '../resources/interfaces';

type ResourceOptions = Partial<ResourceConfig>;
type ActionOptions = Partial<ActionConfig>;

export interface AllAuthZOptions {
  resource: ResourceOptions;
  action: ActionOptions;
}

export function decorate(target: any, options: AllAuthZOptions) {
  _.set(target, '__authz__.resource', options.resource);
  _.set(target, '__authz__.action', options.action);
  return target;
}

export function getDecorations(target: any): AllAuthZOptions {
  return {
    resource: _.get(target, '__authz__.resource'),
    action: _.get(target, '__authz__.action'),
  };
}
