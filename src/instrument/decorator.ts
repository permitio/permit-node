import _ from 'lodash';

import { ActionConfig, ResourceConfig } from '../resources/interfaces';

type ResourceOptions = Partial<ResourceConfig>;
type ActionOptions = Partial<ActionConfig>;

export interface AllAuthZOptions {
  resource: ResourceOptions;
  action: ActionOptions;
}

// eslint-ignore-next-line @typescript-eslint/ban-types
type IDecoratedObject<T extends {}> = T & {
  __authz__: Partial<AllAuthZOptions>;
};

export function decorate<T = any>(
  target: any,
  options: Partial<AllAuthZOptions>,
): IDecoratedObject<T> {
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

export interface IDecoratingObject {
  decorate<T = any>(target: T, options: Partial<AllAuthZOptions>): IDecoratedObject<T>;
}
