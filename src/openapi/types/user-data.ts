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
 * @interface UserData
 */
export interface UserData {
  /**
   *
   * @type {{ [key: string]: Array<string>; }}
   * @memberof UserData
   */
  roleAssignments?: { [key: string]: Array<string> };
  /**
   *
   * @type {object}
   * @memberof UserData
   */
  attributes?: object;
}
