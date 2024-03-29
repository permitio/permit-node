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
 * @interface APIHistoryEventRead
 */
export interface APIHistoryEventRead {
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  timestamp: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  method: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  path: string;
  /**
   *
   * @type {boolean}
   * @memberof APIHistoryEventRead
   */
  success: boolean;
  /**
   *
   * @type {number}
   * @memberof APIHistoryEventRead
   */
  status: number;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  request_id?: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  client_ip: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  actor_type: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  actor_id: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  actor_display_name?: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  org_id?: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  project_key?: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  project_id?: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  env_key?: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  env_id?: string;
  /**
   *
   * @type {string}
   * @memberof APIHistoryEventRead
   */
  id: string;
}
