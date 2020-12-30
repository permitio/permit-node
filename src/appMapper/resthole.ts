import _ from 'lodash';
import { KEY_DELIMITER, PATH_DELIMITER } from './mapExpress/mapExpressApp';

import { MappedEndpoint } from './types';

/**
 *
 * @param a path
 * @param b path
 * @param pathDelim delimiter
 * @returns the mutual path shared by both a and b
 */
function getPathsSharedBase(a: string, b: string, pathDelim = PATH_DELIMITER) {
  const aParts = a.split(pathDelim);
  const bParts = b.split(pathDelim);
  const sharedBase = [];
  for (let i = 0; i <= Math.min(aParts.length, bParts.length); ++i) {
    if (aParts[i] !== bParts[i]) {
      break;
    }
    sharedBase.push(aParts[i]);
  }
  return _.join(sharedBase, pathDelim);
}

export function groupRestHoleEndpoints(
  endpoints: MappedEndpoint[]
): Record<string, MappedEndpoint[]> {
  const groups: Record<string, MappedEndpoint[]> = {};

  // Get all EP that have only a single method (REST-HOLE pattern), and sort them longest first
  const singleMethodEndpoints = _.reverse(
    _.sortBy(
      _.filter(endpoints, (e) => e?.methods.length === 1),
      'path.length'
    )
  );

  for (const a of singleMethodEndpoints) {
    for (const b of singleMethodEndpoints) {
      if (a.path !== b.path) {
        const shared = getPathsSharedBase(a.path, b.path);
        if (shared.length > 0) {
          const group: MappedEndpoint[] = _.get(groups, shared, []);
          group.push(a);
          groups[shared] = group;
          // Place only in one group (the longest - most specific)
          break;
        }
      }
    }
  }
  return groups;
}

/**
 *
 * @param path route path
 * @param groups groups of endpoints
 * @returns the group the path belongs to, or undefined if not found
 */
export function findGroupForPath(
  path: string,
  groups: Record<string, MappedEndpoint[]>
) {
  for (const [name, endpoints] of _.toPairs(groups)) {
    const paths = _.map(endpoints, 'path');
    // If the endpoint is part of a group
    if (_.includes(paths, path)) {
      // mark it
      return { endpoints, name };
    }
  }
  return undefined;
}
/**
 *
 * Heuristic to rename endpoint methods for REST-HOLE; based on last route part
 * update groups in place
 * @returns groups (updated)
 */
export function nameEndpointsInRestHoleGroups(
  groups: Record<string, MappedEndpoint[]>
) {
  _.forEach(groups, (eps, groupPath) =>
    _.forEach(eps, (ep) => {
      const uniqueParts: string = _.trim(
        ep.path.slice(groupPath.length),
        PATH_DELIMITER
      );
      // Ignore key/id URL parts
      const nameParts: string = _.trim(
        _.join(
          _.reject(uniqueParts.split(PATH_DELIMITER), (i) =>
            i.startsWith(KEY_DELIMITER)
          ),
          ' '
        )
      );
      // If the last part starts with a verb- we consider it the action name
      if (nameParts.length > 0 && ep?.methods.length > 0) {
        ep.namedMethods[ep.methods[0]] = nameParts;
      }
    })
  );
  return groups;
}
