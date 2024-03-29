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
 * @interface ResourceActionUpdate
 */
export interface ResourceActionUpdate {
  /**
   * The name of the action
   * @type {string}
   * @memberof ResourceActionUpdate
   */
  name?: string;
  /**
   * An optional longer description of what this action respresents in your system
   * @type {string}
   * @memberof ResourceActionUpdate
   */
  description?: string;
  /**
   * optional dictionary of key-value pairs that can be used to store arbitrary metadata about this action. This metadata can be used to filter actions using query parameters with attr_ prefix
   * @type {object}
   * @memberof ResourceActionUpdate
   */
  attributes?: object;
}
