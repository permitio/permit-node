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
 * @interface PDPConfigRead
 */
export interface PDPConfigRead {
  /**
   *
   * @type {string}
   * @memberof PDPConfigRead
   */
  id: string;
  /**
   *
   * @type {string}
   * @memberof PDPConfigRead
   */
  name?: string;
  /**
   * Unique id of the organization that the pdp_config belongs to.
   * @type {string}
   * @memberof PDPConfigRead
   */
  organization_id: string;
  /**
   * Unique id of the project that the pdp_config belongs to.
   * @type {string}
   * @memberof PDPConfigRead
   */
  project_id: string;
  /**
   * Unique id of the environment that the pdp_config belongs to.
   * @type {string}
   * @memberof PDPConfigRead
   */
  environment_id: string;
  /**
   *
   * @type {string}
   * @memberof PDPConfigRead
   */
  client_secret: string;
}
