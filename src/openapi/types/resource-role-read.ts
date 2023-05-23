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
import { RoleDerivation2 } from './role-derivation2';

/**
 *
 * @export
 * @interface ResourceRoleRead
 */
export interface ResourceRoleRead {
  /**
   * The name of the role
   * @type {string}
   * @memberof ResourceRoleRead
   */
  name: string;
  /**
   * optional description string explaining what this role represents, or what permissions are granted to it.
   * @type {string}
   * @memberof ResourceRoleRead
   */
  description?: string;
  /**
   * list of action keys that define what actions this resource role is permitted to do
   * @type {Array<string>}
   * @memberof ResourceRoleRead
   */
  permissions?: Array<string>;
  /**
   * optional dictionary of key-value pairs that can be used to store arbitrary metadata about this role. This metadata can be used to filter role using query parameters with attr_ prefix, currently supports only \'equals\' operator
   * @type {object}
   * @memberof ResourceRoleRead
   */
  attributes?: object;
  /**
   *
   * @type {RoleDerivation2}
   * @memberof ResourceRoleRead
   */
  role_derivation?: RoleDerivation2;
  /**
   * A URL-friendly name of the role (i.e: slug). You will be able to query later using this key instead of the id (UUID) of the role.
   * @type {string}
   * @memberof ResourceRoleRead
   */
  key: string;
  /**
   * Unique id of the role
   * @type {string}
   * @memberof ResourceRoleRead
   */
  id: string;
  /**
   * Unique id of the organization that the role belongs to.
   * @type {string}
   * @memberof ResourceRoleRead
   */
  organization_id: string;
  /**
   * Unique id of the project that the role belongs to.
   * @type {string}
   * @memberof ResourceRoleRead
   */
  project_id: string;
  /**
   * Unique id of the environment that the role belongs to.
   * @type {string}
   * @memberof ResourceRoleRead
   */
  environment_id: string;
  /**
   * Unique id of the resource that the role belongs to.
   * @type {string}
   * @memberof ResourceRoleRead
   */
  resource_id: string;
  /**
   * Date and time when the role was created (ISO_8601 format).
   * @type {string}
   * @memberof ResourceRoleRead
   */
  created_at: string;
  /**
   * Date and time when the role was last updated/modified (ISO_8601 format).
   * @type {string}
   * @memberof ResourceRoleRead
   */
  updated_at: string;
}
