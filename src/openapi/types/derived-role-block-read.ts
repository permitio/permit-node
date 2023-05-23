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
import { DerivedRoleRuleRead } from './derived-role-rule-read';
// May contain unused imports in some cases
// @ts-ignore
import { Settings } from './settings';

/**
 *
 * @export
 * @interface DerivedRoleBlockRead
 */
export interface DerivedRoleBlockRead {
  /**
   *
   * @type {Settings}
   * @memberof DerivedRoleBlockRead
   */
  settings?: Settings;
  /**
   * the conditions of the derived role
   * @type {string}
   * @memberof DerivedRoleBlockRead
   */
  conditions?: string;
  /**
   * The unique id of the derived_role
   * @type {string}
   * @memberof DerivedRoleBlockRead
   */
  id: string;
  /**
   * the rules of the derived role
   * @type {Array<DerivedRoleRuleRead>}
   * @memberof DerivedRoleBlockRead
   */
  rules?: Array<DerivedRoleRuleRead>;
  /**
   * this derived role will grant a role to the resource id specified here, depending on the derivation rules
   * @type {string}
   * @memberof DerivedRoleBlockRead
   */
  granted_resource_id: string;
}
