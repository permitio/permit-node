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
 * @interface UserFELoginRequestInput
 */
export interface UserFELoginRequestInput {
  /**
   * jwt of the user for whom to generate a token, Note: the sub of this jwt must match the user key that exists in permit database
   * @type {string}
   * @memberof UserFELoginRequestInput
   */
  user_jwt: string;
  /**
   * ID or key of the tenant to which access is requested
   * @type {string}
   * @memberof UserFELoginRequestInput
   */
  tenant_id: string;
}
