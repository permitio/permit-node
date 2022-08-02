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
 * @interface RoleAssignmentCreate
 */
export interface RoleAssignmentCreate {
  /**
   * the role that will be assigned (accepts either the role id or the role key)
   * @type {string}
   * @memberof RoleAssignmentCreate
   */
  role: string;
  /**
   * the tenant the role is associated with (accepts either the tenant id or the tenant key)
   * @type {string}
   * @memberof RoleAssignmentCreate
   */
  tenant: string;
  /**
   * the user the role will be assigned to (accepts either the user id or the user key)
   * @type {string}
   * @memberof RoleAssignmentCreate
   */
  user: string;
}
