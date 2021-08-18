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
  const minLength = Math.min(aParts.length, bParts.length);
  // All but last
  for (let i = 0; i <= minLength; ++i) {
    if (aParts[i] !== bParts[i]) {
      break;
    }
    sharedBase.push(aParts[i]);
  }
  // For grouping purposes - paths ending with a key are part of the same path without the key (i.e. '\p\:1' === '\p')
  // drop last path part if it's a key
  const cleanSharedPath = _.join(
    sharedBase.length > 1 &&
      sharedBase[sharedBase.length - 1].startsWith(KEY_DELIMITER)
      ? sharedBase.slice(0, sharedBase.length - 1)
      : sharedBase,
    pathDelim
  );

  return cleanSharedPath;
}

export function groupRestHoleEndpoints(
  endpoints: MappedEndpoint[]
): Record<string, MappedEndpoint[]> {
  const groups: Record<string, Record<string, MappedEndpoint>> = {};

  // Get all EP that have only a single method (REST-HOLE pattern), and sort them longest first
  const singleMethodEndpoints = _.reverse(
    _.sortBy(
      _.filter(endpoints, (e) => e?.methods.length === 1),
      'path.length'
    )
  );

  for (const a of singleMethodEndpoints) {
    const sharedPaths: string[] = [];
    // Find all endpoints that share a mutual base-path
    for (const b of singleMethodEndpoints) {
      if (a.path !== b.path) {
        const shared = getPathsSharedBase(a.path, b.path);
        if (shared.length > 0) {
          sharedPaths.push(shared);
        }
      }
    }
    // Keep only the longest paths that don't overlap
    const longestSharedPaths = _.filter(sharedPaths, (path) => {
      // Paths overlapping with the current path which are longer
      const overlappingAndLonger = _.filter(
        sharedPaths,
        (otherPath) =>
          path !== otherPath &&
          otherPath.startsWith(path) &&
          otherPath.length > path.length
      );
      return overlappingAndLonger.length === 0;
    });
    for (const groupPath of longestSharedPaths) {
      const group: Record<string, MappedEndpoint> = _.get(
        groups,
        groupPath,
        {}
      );

      // storing by path ensures uniqueness
      group[a.path] = a;
      groups[groupPath] = group;
    }
  }
  // Flatten and ensure order (shortest first - likely the root node)
  const flatGroups = _.fromPairs(
    _.map(groups, (group, key) => [key, _.sortBy(_.values(group), 'path')])
  );
  return flatGroups;
}

/**          const group: MappedEndpoint[] = _.get(groups, shared, []);
          group.push(a);
          groups[shared] = group;
          // Place only in one group (the longest - most specific)
          break; */

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
      //
      if (nameParts.length > 0 && ep?.methods.length > 0) {
        ep.namedMethods[ep.methods[0]] = nameParts;
      }
    })
  );
  return groups;
}
