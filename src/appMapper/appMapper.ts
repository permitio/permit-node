import _ from 'lodash';

import { ResourceConfig } from '..';
import { logger } from '../logger';
import { ActionDefinition } from '../registry';

import {
  KEY_DELIMITER,
  mapExpressAppEndpoints,
} from './mapExpress/mapExpressApp';
import { EndpointTree, MappedEndpoint } from './types';

const SIMPLE_REST_NAMING = {
  POST: 'create',
  PUT: 'update',
  DELETE: 'remove',
  GET: 'view',
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
    // New root
    if (
      root === null ||
      !endpoint.path.startsWith(root.path) ||
      (prevAddedId && flat)
    ) {
      junction = root = endpoint;
      tree[root.path] = [root];
      currentTree = tree;
      prev = null;
      // Paths are nested, and no id was added
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
function getMethodName(method: string, endpoint: MappedEndpoint): string {
  // TODO add logic looking at following endpoints to see if a / is followed by a ':/id' and can be it's GET can be called 'list'
  return _.startCase(
    _.get(
      endpoint.namedMethods,
      method,
      _.get(SIMPLE_REST_NAMING, method, method)
    )
  );
}

/**
 * Translate an endpoint to an a resource name
 */
function getResourceName(endpoint: MappedEndpoint): string {
  return _.join(
    _.reject(endpoint.path.split('/'), (i) => i.startsWith(KEY_DELIMITER)),
    ' '
  ).trim();
}

function endpointToActions(endpoint: MappedEndpoint) {
  return _.map(endpoint.methods, (method) => {
    const name = getMethodName(method, endpoint);
    return new ActionDefinition(name, name, undefined, endpoint.path, {
      verb: method,
    });
  });
}

function endpointToResource(
  endpoint: MappedEndpoint,
  children: MappedEndpoint[]
): ResourceConfig {
  const resourceType = 'rest';

  const childActions = _.flatMap(children, (child) => endpointToActions(child));
  const ownActions = endpointToActions(endpoint);

  return {
    name: getResourceName(endpoint),
    type: resourceType,
    path: endpoint.path,
    description: '',
    actions: _.concat(ownActions, childActions),
  };
}

function endpointsToResources(endpoints: MappedEndpoint[]) {
  // Layout as tree to more easily match resources with their actions
  const tree = getNestedEndpointsTree(endpoints, true);

  return _.map(tree, (endpoints) => {
    const [main, ...children] = <MappedEndpoint[]>endpoints;
    return endpointToResource(main, children);
  });
}

function isExpressApp(app: any): boolean {
  // finger printing express
  return (
    app.stack !== undefined || (app._router && app._router.stack !== undefined)
  );
}

export function mapApp(app: any): ResourceConfig[] {
  if (isExpressApp(app)) {
    const resources = endpointsToResources(mapExpressAppEndpoints(app));
    logger.debug('Mapping Express App', { resources });
    return resources;
  } else {
    logger.debug('Unknown app type', { app });
  }
  return [];
}
