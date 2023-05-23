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
 * @interface UserRoleRemove
 */
export interface UserRoleRemove {
  /**
   * the role that will be unassigned (accepts either the role id or the role key)
   * @type {string}
   * @memberof UserRoleRemove
   */
  role: string;
  /**
   * the tenant the role is associated with (accepts either the tenant id or the tenant key)
   * @type {string}
   * @memberof UserRoleRemove
   */
  tenant?: string;
  /**
   * the tenant the role is associated with (accepts either the tenant id or the tenant key)
   * @type {string}
   * @memberof UserRoleRemove
   */
  resource_instance?: string;
}
