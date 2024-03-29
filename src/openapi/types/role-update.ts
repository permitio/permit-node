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
import { GrantedTo1 } from './granted-to1';

/**
 *
 * @export
 * @interface RoleUpdate
 */
export interface RoleUpdate {
  /**
   * The name of the role
   * @type {string}
   * @memberof RoleUpdate
   */
  name?: string;
  /**
   * optional description string explaining what this role represents, or what permissions are granted to it.
   * @type {string}
   * @memberof RoleUpdate
   */
  description?: string;
  /**
   * list of action keys that define what actions this resource role is permitted to do
   * @type {Array<string>}
   * @memberof RoleUpdate
   */
  permissions?: Array<string>;
  /**
   * optional dictionary of key-value pairs that can be used to store arbitrary metadata about this role. This metadata can be used to filter role using query parameters with attr_ prefix, currently supports only \'equals\' operator
   * @type {object}
   * @memberof RoleUpdate
   */
  attributes?: object;
  /**
   *
   * @type {GrantedTo1}
   * @memberof RoleUpdate
   */
  granted_to?: GrantedTo1;
}
