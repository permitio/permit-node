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
 * @interface TenantData
 */
export interface TenantData {
  /**
   *
   * @type {{ [key: string]: Array<string>; }}
   * @memberof TenantData
   */
  roleAssignments?: { [key: string]: Array<string> };
  /**
   *
   * @type {object}
   * @memberof TenantData
   */
  attributes?: object;
}
