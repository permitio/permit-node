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
 * @interface EnvironmentUpdate
 */
export interface EnvironmentUpdate {
  /**
   * A URL-friendly name of the environment (i.e: slug). You will be able to query later using this key instead of the id (UUID) of the environment.
   * @type {string}
   * @memberof EnvironmentUpdate
   */
  key?: string;
  /**
   * The name of the environment
   * @type {string}
   * @memberof EnvironmentUpdate
   */
  name?: string;
  /**
   * an optional longer description of the environment
   * @type {string}
   * @memberof EnvironmentUpdate
   */
  description?: string;
}