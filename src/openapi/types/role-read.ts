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

/**
 *
 * @export
 * @interface RoleRead
 */
export interface RoleRead {
  /**
   * The name of the role
   * @type {string}
   * @memberof RoleRead
   */
  name: string;
  /**
   * optional description string explaining what this role represents, or what permissions are granted to it.
   * @type {string}
   * @memberof RoleRead
   */
  description?: string;
  /**
   * list of action keys that define what actions this resource role is permitted to do
   * @type {Array<string>}
   * @memberof RoleRead
   */
  permissions?: Array<string>;
  /**
   * list of role keys that define what roles this role extends. In other words: this role will automatically inherit all the permissions of the given roles in this list.
   * @type {Array<string>}
   * @memberof RoleRead
   */
  extends?: Array<string>;
  /**
   * A URL-friendly name of the role (i.e: slug). You will be able to query later using this key instead of the id (UUID) of the role.
   * @type {string}
   * @memberof RoleRead
   */
  key: string;
  /**
   * Unique id of the role
   * @type {string}
   * @memberof RoleRead
   */
  id: string;
  /**
   * Unique id of the organization that the role belongs to.
   * @type {string}
   * @memberof RoleRead
   */
  organization_id: string;
  /**
   * Unique id of the project that the role belongs to.
   * @type {string}
   * @memberof RoleRead
   */
  project_id: string;
  /**
   * Unique id of the environment that the role belongs to.
   * @type {string}
   * @memberof RoleRead
   */
  environment_id: string;
  /**
   * Date and time when the role was created (ISO_8601 format).
   * @type {string}
   * @memberof RoleRead
   */
  created_at: string;
  /**
   * Date and time when the role was last updated/modified (ISO_8601 format).
   * @type {string}
   * @memberof RoleRead
   */
  updated_at: string;
}
