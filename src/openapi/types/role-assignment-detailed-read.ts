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
import { RoleAssignmentResourceInstance } from './role-assignment-resource-instance';
// @ts-ignore
import { RoleAssignmentRole } from './role-assignment-role';
// @ts-ignore
import { RoleAssignmentTenant } from './role-assignment-tenant';
// @ts-ignore
import { RoleAssignmentUser } from './role-assignment-user';

/**
 *
 * @export
 * @interface RoleAssignmentDetailedRead
 */
export interface RoleAssignmentDetailedRead {
  /**
   * Unique id of the role assignment
   * @type {string}
   * @memberof RoleAssignmentDetailedRead
   */
  id: string;
  /**
   * the role that is assigned
   * @type {RoleAssignmentRole}
   * @memberof RoleAssignmentDetailedRead
   */
  role: RoleAssignmentRole;
  /**
   * the user the role is assigned to
   * @type {RoleAssignmentUser}
   * @memberof RoleAssignmentDetailedRead
   */
  user: RoleAssignmentUser;
  /**
   * the tenant the role is associated with
   * @type {RoleAssignmentTenant}
   * @memberof RoleAssignmentDetailedRead
   */
  tenant: RoleAssignmentTenant;
  /**
   *
   * @type {RoleAssignmentResourceInstance}
   * @memberof RoleAssignmentDetailedRead
   */
  resource_instance?: RoleAssignmentResourceInstance;
  /**
   * Unique id of the organization that the role assignment belongs to.
   * @type {string}
   * @memberof RoleAssignmentDetailedRead
   */
  organization_id: string;
  /**
   * Unique id of the project that the role assignment belongs to.
   * @type {string}
   * @memberof RoleAssignmentDetailedRead
   */
  project_id: string;
  /**
   * Unique id of the environment that the role assignment belongs to.
   * @type {string}
   * @memberof RoleAssignmentDetailedRead
   */
  environment_id: string;
  /**
   * Date and time when the role assignment was created (ISO_8601 format).
   * @type {string}
   * @memberof RoleAssignmentDetailedRead
   */
  created_at: string;
}
