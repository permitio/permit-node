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
 * @interface DerivedRoleRule
 */
export interface DerivedRoleRule {
  /**
   *
   * @type {string}
   * @memberof DerivedRoleRule
   */
  relation: string;
  /**
   *
   * @type {string}
   * @memberof DerivedRoleRule
   */
  related_resource: string;
  /**
   *
   * @type {string}
   * @memberof DerivedRoleRule
   */
  related_role: string;
}