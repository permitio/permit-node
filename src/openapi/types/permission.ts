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
import { MemberAccessLevel } from './member-access-level';
// May contain unused imports in some cases
// @ts-ignore
import { MemberAccessObj } from './member-access-obj';

/**
 *
 * @export
 * @interface Permission
 */
export interface Permission {
  /**
   *
   * @type {string}
   * @memberof Permission
   */
  organization_id: string;
  /**
   *
   * @type {string}
   * @memberof Permission
   */
  project_id?: string;
  /**
   *
   * @type {string}
   * @memberof Permission
   */
  environment_id?: string;
  /**
   *
   * @type {MemberAccessObj}
   * @memberof Permission
   */
  object_type: MemberAccessObj;
  /**
   *
   * @type {MemberAccessLevel}
   * @memberof Permission
   */
  access_level: MemberAccessLevel;
  /**
   *
   * @type {string}
   * @memberof Permission
   */
  organization_key?: string;
  /**
   *
   * @type {string}
   * @memberof Permission
   */
  project_key?: string;
  /**
   *
   * @type {string}
   * @memberof Permission
   */
  environment_key?: string;
  /**
   *
   * @type {string}
   * @memberof Permission
   */
  organization_name?: string;
  /**
   *
   * @type {string}
   * @memberof Permission
   */
  project_name?: string;
  /**
   *
   * @type {string}
   * @memberof Permission
   */
  environment_name?: string;
}
