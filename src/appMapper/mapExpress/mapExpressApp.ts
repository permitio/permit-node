import express from 'express';
import _ from 'lodash';
import { pathToRegexp } from 'path-to-regexp';

import { MappedEndpoint } from '../types';

import listEndpoints from './listEndpoints';

export const KEY_DELIMITER = ":"

export function mapExpressAppEndpoints(app: express.Express): MappedEndpoint[] {
  return _.map(listEndpoints(app), (endpoint:MappedEndpoint) => {
    const regEx = pathToRegexp(endpoint.path);
    const keys = _.map(_.slice(regEx.exec(endpoint.path), 1), (key) => _.trimStart(key, KEY_DELIMITER)
    );
    return {
      ...endpoint,
      regEx,
      keys: keys,
      endsWithKey: keys.length > 0 ? endpoint.path.endsWith(`${KEY_DELIMITER}${keys[keys.length-1]}`) : false
    };
  });
}
