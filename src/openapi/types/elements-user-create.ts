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

import { UserRoleCreate } from './user-role-create';

/**
 *
 * @export
 * @interface ElementsUserCreate
 */
export interface ElementsUserCreate {
  /**
   * A unique id by which Permit will identify the user for permission checks.
   * @type {string}
   * @memberof ElementsUserCreate
   */
  key: string;
  /**
   * The email of the user. If synced, will be unique inside the environment.
   * @type {string}
   * @memberof ElementsUserCreate
   */
  email?: string;
  /**
   * First name of the user.
   * @type {string}
   * @memberof ElementsUserCreate
   */
  first_name?: string;
  /**
   * Last name of the user.
   * @type {string}
   * @memberof ElementsUserCreate
   */
  last_name?: string;
  /**
   * Arbitrary user attributes that will be used to enforce attribute-based access control policies.
   * @type {object}
   * @memberof ElementsUserCreate
   */
  attributes?: object;
  /**
   * List of roles to assign to the user in the environment.
   * @type {UserRoleCreate[]}
   * @memberof ElementsUserCreate
   */
  role_assignments?: UserRoleCreate[];
  /**
   *
   * @type {string}
   * @memberof ElementsUserCreate
   */
  role?: string;
}
