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
import { RoleAssignmentRead } from './role-assignment-read';

/**
 *
 * @export
 * @interface PaginatedResultRoleAssignmentRead
 */
export interface PaginatedResultRoleAssignmentRead {
  /**
   * List of Role Assignments
   * @type {Array<RoleAssignmentRead>}
   * @memberof PaginatedResultRoleAssignmentRead
   */
  data: Array<RoleAssignmentRead>;
  /**
   *
   * @type {number}
   * @memberof PaginatedResultRoleAssignmentRead
   */
  total_count: number;
  /**
   *
   * @type {number}
   * @memberof PaginatedResultRoleAssignmentRead
   */
  page_count?: number;
}
