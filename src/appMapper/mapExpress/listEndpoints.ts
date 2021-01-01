/**
 * Based on https://github.com/AlbertoFdzM/express-list-endpoints/blob/0b14cc3a5c2a2422d1e3712085203acb4a0b5cfe/src/index.js
 * + additional change to expose the callback function
 */

// File adopted from JS:
/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from 'lodash';

// var debug = require('debug')('express-list-endpoints')
const regexpExpressRegexp = /^\/\^\\\/(?:(:?[\w\\.-]*(?:\\\/:?[\w\\.-]*)*)|(\(\?:\(\[\^\\\/]\+\?\)\)))\\\/.*/;
// var arrayPathItemRegexp = /\^[^^$]*\\\/\?\(\?=\\\/\|\$\)\|?/
// var arrayPathsRegexp = /\(\?:((\^[^^$]*\\\/\?\(\?=\\\/\|\$\)\|?)+)\)\/i?/
const expressRootRegexp = '/^\\/?(?=\\/|$)/i';
const regexpExpressParam = /\(\?:\(\[\^\\\/]\+\?\)\)/g;

const STACK_ITEM_VALID_NAMES = ['router', 'bound dispatch', 'mounted_app'];

/**
 * Returns all the verbs detected for the passed route
 */
const getRouteMethods = function (route: any) {
  const methods = [];

  for (const method in route.methods) {
    if (method === '_all') continue;

    methods.push(method.toUpperCase());
  }

  return methods;
};

/**
 * Returns the names (or anonymous) of all the middleware attached to the
 * passed route
 */
const getRouteMiddleware = function (route: { stack: any[] }) {
  return route.stack.map(function (item: { handle: { name: any } }) {
    return item.handle || undefined;
  });
};

/**
 * Returns true if found regexp related with express params
 */
const hasParams = function (pathRegexp: string) {
  return regexpExpressParam.test(pathRegexp);
};

/**
 * Utility function for parseExpressRoute
 */
function parseSingleRoute(route: any, basePath: string, path: string) {
  const methods = getRouteMethods(route);
  const middleware = getRouteMiddleware(route);
  // Actual functions without middleware (middleware comes first)
  const endFunctions = _.slice(
    middleware,
    _.size(middleware) - _.size(methods)
  );
  return {
    path: basePath + (basePath && path === '/' ? '' : path),
    methods,
    middleware,
    // layer: layer,
    // route: route,
    namedMethods: _.fromPairs(
      _.reject(
        _.zip(methods, _.map(endFunctions, 'name')),
        ([, v]) => v === undefined
      )
    ),
    methodToCallable: _.fromPairs(
      _.zip(methods, endFunctions))
  };
}

/**
 * @param {Object} route Express route object to be parsed
 * @param {string} basePath The basePath the route is on
 * @param {Object} layer The layer that  wraps the route
 * @return {Object[]} Endpoints info
 */
const parseExpressRoute = function (route: any, basePath: any) {
  const endpoints = [];

  if (Array.isArray(route.path)) {
    route.path.forEach(function (path: string) {
      const endpoint = parseSingleRoute(route, basePath, path);
      endpoints.push(endpoint);
    });
  } else {
    const endpoint = parseSingleRoute(route, basePath, route.path);
    endpoints.push(endpoint);
  }

  return endpoints;
};

const parseExpressPath = function (
  expressPathRegexp: string,
  params: { name: string }[]
) {
  let parsedPath: any = regexpExpressRegexp.exec(expressPathRegexp);
  let parsedRegexp = expressPathRegexp;
  let paramIdx = 0;

  while (hasParams(parsedRegexp)) {
    const paramId = ':' + params[paramIdx].name;

    parsedRegexp = parsedRegexp
      .toString()
      .replace(/\(\?:\(\[\^\\\/]\+\?\)\)/, paramId);

    paramIdx++;
  }

  if (parsedRegexp !== expressPathRegexp) {
    parsedPath = regexpExpressRegexp.exec(parsedRegexp);
  }

  parsedPath = parsedPath[1].replace(/\\\//g, '/');

  return parsedPath;
};

const parseEndpoints = function (
  app: { stack: any; _router: { stack: any } },
  basePath?: string | undefined,
  endpoints?: any
) {
  const stack = app.stack || (app._router && app._router.stack);

  endpoints = endpoints || [];
  basePath = basePath || '';

  if (!stack) {
    addEndpoints(endpoints, [
      {
        path: basePath,
        methods: [],
        middleware: [],
      },
    ]);
  } else {
    stack.forEach(function (stackItem: {
      route: any;
      name: string;
      regexp: string;
      keys: any;
      handle: any;
      path: any;
    }) {
      if (stackItem.route) {
        const newEndpoints = parseExpressRoute(stackItem.route, basePath);

        endpoints = addEndpoints(endpoints, newEndpoints);
      } else if (STACK_ITEM_VALID_NAMES.indexOf(stackItem.name) > -1) {
        if (regexpExpressRegexp.test(stackItem.regexp)) {
          const parsedPath = parseExpressPath(stackItem.regexp, stackItem.keys);

          parseEndpoints(
            stackItem.handle,
            basePath + '/' + parsedPath,
            endpoints
          );
        } else if (
          !stackItem.path &&
          stackItem.regexp &&
          stackItem.regexp.toString() !== expressRootRegexp
        ) {
          const regEcpPath = ' RegExp(' + stackItem.regexp + ') ';

          parseEndpoints(
            stackItem.handle,
            basePath + '/' + regEcpPath,
            endpoints
          );
        } else {
          parseEndpoints(stackItem.handle, basePath, endpoints);
        }
      }
    });
  }

  return endpoints;
};

/**
 * Ensures the path of the new endpoints isn't yet in the array.
 * If the path is already in the array merges the endpoints with the existing
 * one, if not, it adds them to the array.
 *
 * @param {Array} endpoints Array of current endpoints
 * @param {Object[]} newEndpoints New endpoints to be added to the array
 * @returns {Array} Updated endpoints array
 */
const addEndpoints = function (endpoints: any[], newEndpoints: any[]) {
  newEndpoints.forEach(function (newEndpoint) {
    const foundEndpointIdx = endpoints.findIndex(function (item) {
      return item.path === newEndpoint.path;
    });

    if (foundEndpointIdx > -1) {
      const foundEndpoint = endpoints[foundEndpointIdx];

      const newMethods = newEndpoint.methods.filter(function (method: any) {
        return foundEndpoint.methods.indexOf(method) === -1;
      });

      const newMiddleware = newEndpoint.middleware.filter(function (
        middleware: any
      ) {
        return foundEndpoint.middleware.indexOf(middleware) === -1;
      });

      foundEndpoint.methods = foundEndpoint.methods.concat(newMethods);
      foundEndpoint.middleware = foundEndpoint.middleware.concat(newMiddleware);
      foundEndpoint.namedMethods = _.assign(
        foundEndpoint.namedMethods,
        newEndpoint.namedMethods
      );
      foundEndpoint.methodToCallable = _.assign(
        foundEndpoint.methodToCallable,
        newEndpoint.methodToCallable
      );
    } else {
      endpoints.push(newEndpoint);
    }
  });

  return endpoints;
};

/**
 * Returns an array of strings with all the detected endpoints
 * @param {Object} app the express/route instance to get the endpoints from
 */
const getEndpoints = function (app: any) {
  const endpoints = parseEndpoints(app);

  return endpoints;
};

export default getEndpoints;
