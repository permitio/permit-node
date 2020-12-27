import express from 'express';
import _ from 'lodash';
import { pathToRegexp } from 'path-to-regexp';

import listEndpoints from './listEndpoints';

export function mapExpressApp(app: express.Express) {
  return _.map(listEndpoints(app), (endpoint) => {
    const regEx = pathToRegexp(endpoint.path);
    return {
      ...endpoint,
      regEx,
      keys: _.map(_.slice(regEx.exec(endpoint.path), 1), (key) =>
        _.trimStart(key, ':')
      ),
    };
  });
}
