import _ from 'lodash';

import { ResourceConfig } from '../commands';
import { AllAuthZOptions, getDecorations } from '../decorator';
import { logger } from '../logger';
import { ActionDefinition } from '../registry';

import {
  KEY_DELIMITER,
  mapExpressAppEndpoints,
} from './mapExpress/mapExpressApp';
import {
  findGroupForPath,
  groupRestHoleEndpoints,
  nameEndpointsInRestHoleGroups,
} from './resthole';
import { EndpointGroup, EndpointTree, MappedEndpoint } from './types';

const SIMPLE_REST_NAMING = {
  POST: 'create',
  PUT: 'update',
  DELETE: 'remove',
  GET: 'view',
  LIST: 'list',
};

/**
 *
 * @param {MappedEndpoint} endpoints the endpoints of an application
 * @param {boolean} flat should the tree have only one level (instead of nesting resources - putting each resource under the root directly), Defaults to true
 * @returns {EndpointTree} a nested tree structure of endpoints
 *
 * -- Tree Layouts --
 *    Tree Layout (flat=false) :
 *      root-path -> endpoint-group[{endpoint, {sub-tree}}]
 *
 *    Flat Tree Layout (flat=true) :
 *      root-path -> endpoint-group[endpoints]
 *
 *
 */
function getNestedEndpointsTree(
  endpoints: MappedEndpoint[],
  flat = true
): EndpointTree {
  const sortedEndpoints = _.sortBy(endpoints, 'path');

  const tree: EndpointTree = {};
  let currentTree: EndpointTree;

  let prev: MappedEndpoint | null = null;
  let root: MappedEndpoint | null = null;
  let junction: MappedEndpoint;
  let prevAddedId = false;
  //  Scan through endpoints sorted by path
  _.forEach(sortedEndpoints, (endpoint) => {
    // New root (No current root, or previous root is just '/' or we are building a flat tree )
    if (
      root === null ||
      prev?.path === '/' ||
      !endpoint.path.startsWith(root.path) ||
      (prevAddedId && flat)
    ) {
      junction = root = endpoint;
      tree[root.path] = [root];
      currentTree = tree;
      prev = null;
      // Paths are nested,  no id was added
    } else if (
      prev !== null &&
      endpoint.path.startsWith(prev.path) &&
      !prevAddedId
    ) {
      if (flat) {
        tree[root.path].push(endpoint);
      } else {
        currentTree[junction.path].push(endpoint);
      }
      // New path under same root (new junction)
    } else {
      const newSubTree = { [endpoint.path]: [endpoint] };
      tree[root.path].push(newSubTree);
      currentTree = newSubTree;
      junction = endpoint;
    }
    // Prepare for next item
    prevAddedId = prev !== null && endpoint.keys.length > prev.keys.length;
    prev = endpoint;
  });

  return tree;
}

/**
 * Translate a REST HTTP method to an action name
 */
function getMethodName(
  method: string,
  endpoint: MappedEndpoint,
  treatGetAsList = false
): string {
  // if treatGetAsList
  const defactoMethodName =
    treatGetAsList && method === 'GET' ? 'LIST' : method;
  let value = _.get(
    endpoint.namedMethods,
    method,
    _.get(SIMPLE_REST_NAMING, defactoMethodName, defactoMethodName)
  );
  // '' not a valid function name
  value =
    value.length > 0
      ? value
      : _.get(SIMPLE_REST_NAMING, defactoMethodName, defactoMethodName);

  return _.startCase(value);
}

/**
 * Translate an endpoint path to a resource name
 */
function getResourceNameFromPath(path: string): string {
  // Special case
  if (path === '/') {
    return 'index';
  }
  // all other paths
  return _.join(
    _.reject(path.split('/'), (i) => i.startsWith(KEY_DELIMITER)),
    ' '
  ).trim();
}

/**
 * Translate an endpoint to a resource name
 */
function getResourceNameFromEndpoint(endpoint: MappedEndpoint): string {
  return getResourceNameFromPath(endpoint.path);
}

function endpointToActions(endpoint: MappedEndpoint, treatGetAsList = false) {
  return _.map(endpoint.methods, (method) => {
    const func = _.get(endpoint.methodToCallable, method);
    const name = getMethodName(method, endpoint, treatGetAsList);
    const decorations = getDecorations(func);
    const actionDecors = decorations.action || {};
    return new ActionDefinition(
      actionDecors.name || name,
      actionDecors.title || name,
      actionDecors.description,
      endpoint.path,
      {
        verb: method,
      }
    );
  });
}

function extractDecorations(endpoint: MappedEndpoint): AllAuthZOptions {
  const decorations = _.reject(
    _.map(endpoint.middleware, (m) => getDecorations(m)),
    (i) => i === undefined
  );
  return _.merge({}, ...decorations);
}

function renameDuplicateActions(
  actions: ActionDefinition[]
): ActionDefinition[] {
  const actionsByName = _.groupBy(actions, 'name');
  // Check for cases where names repeat then rename subsequent actions
  _.forEach(actionsByName, (actionItems) => {
    if (actionItems.length > 1) {
      // rename in place
      const counter = 1;
      // Rename all but the first
      for (const action of _.slice(actionItems, 1)) {
        const newName = `${action.name}-${counter}`;
        // If title is derived from name update it too
        if (action.name === action.title) {
          action.title = newName;
        }
        action.name = newName;
      }
    }
  });
  return actions;
}

function endpointToResource(
  endpoint: MappedEndpoint,
  children: MappedEndpoint[],
  groupPath?: string
): ResourceConfig {
  const resourceType = 'rest';
  const hasChildWithGet = _.includes(_.flatMap(children, 'methods'), 'GET');
  const childActions = _.flatMap(children, (child) => endpointToActions(child));
  // Map our direct endpoint to actions
  // If we have a child with 'get' method - our own 'get' should be 'list'
  const ownActions = endpointToActions(endpoint, hasChildWithGet);

  const childrenResourceDecorations = _.map(
    children,
    (child) => extractDecorations(child)?.resource
  );
  const resourceDecorations = extractDecorations(endpoint)?.resource;
  const mergedResourceDeco =
    _.merge({}, ...childrenResourceDecorations, resourceDecorations) || {};

  // combine ownActions with child; rename duplicate names (Safety)
  const allActions = renameDuplicateActions(_.concat(ownActions, childActions));

  return {
    name:
      mergedResourceDeco.name ||
      (groupPath
        ? getResourceNameFromPath(groupPath)
        : getResourceNameFromEndpoint(endpoint)),
    type: mergedResourceDeco.type || resourceType,
    path: endpoint.path,
    description: mergedResourceDeco.description || '',
    actions: allActions,
  };
}

/**
 *
 * @param tree Endpoint tree to augment
 * @param endpoints endpoints the tree is based on
 * Groups routes that seem to belong to a REST-hole pattern and set them together in the tree
 * @returns a new updated tree
 */
function augmentEndpointTreeForRestHole(
  tree: EndpointTree,
  endpoints: MappedEndpoint[]
): EndpointTree {
  const newTree: EndpointTree = {};
  // Get rest-hole groups, and attempt to rename their methods
  const groups = nameEndpointsInRestHoleGroups(
    groupRestHoleEndpoints(endpoints)
  );
  // clean every branch of the tree of items moved to a REST-hole group
  _.forEach(tree, (branch, branchPath) => {
    const groupsForBranch: Record<string, MappedEndpoint[]> = {};
    const newBranch: EndpointGroup = _.reject(branch, (ep) => {
      // if It's a regular MappedEndpoint (And not EndpointGroup/EndpointTree)
      if (ep.path) {
        // Check if the EP matches a group
        const matchingGroup = findGroupForPath(
          (ep as MappedEndpoint).path,
          groups
        );
        if (matchingGroup) {
          groupsForBranch[matchingGroup.name] = matchingGroup.endpoints;
          // remove EP
          return true;
        }
      }
      // Keep EP as is
      return false;
    });
    // Save the new branch to the new tree (if it survived the trimming)
    if (newBranch.length > 0) {
      newTree[branchPath] = newBranch;
    }
  });

  _.assign(newTree, groups);
  return newTree;
}
/**
 *
 * @param endpoints Translate endpoints to resources
 */
function endpointsToResources(endpoints: MappedEndpoint[]) {
  // Layout as tree to more easily match resources with their actions
  const tree = augmentEndpointTreeForRestHole(
    getNestedEndpointsTree(endpoints, true),
    endpoints
  );

  return _.map(tree, (endpoints, groupPath) => {
    const [main, ...children] = <MappedEndpoint[]>endpoints;
    return endpointToResource(main, children, groupPath);
  });
}

function isExpressApp(app: any): boolean {
  // finger printing express
  return (
    app.stack !== undefined || (app._router && app._router.stack !== undefined)
  );
}

export function mapApp(
  app: any
): { resources: ResourceConfig[]; endpoints: MappedEndpoint[] } {
  if (isExpressApp(app)) {
    logger.debug('Mapping Express App');
    const endpoints = mapExpressAppEndpoints(app);
    const resources = endpointsToResources(endpoints);
    return { resources, endpoints };
  } else {
    logger.debug('Unknown app type', { app });
  }
  return { resources: [], endpoints: [] };
}
