/* tslint:disable */
/* eslint-disable */
/**
 * Permit.io API
 *  Authorization as a service
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

// May contain unused imports in some cases
// @ts-ignore
import { New } from './new';

/**
 *
 * @export
 * @interface EnvironmentCopyTarget
 */
export interface EnvironmentCopyTarget {
  /**
   * Identifier of an existing environment to copy into
   * @type {string}
   * @memberof EnvironmentCopyTarget
   */
  existing?: string;
  /**
   *
   * @type {New}
   * @memberof EnvironmentCopyTarget
   */
  new?: New;
}
