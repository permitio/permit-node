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
 * @interface ResourceActionRead
 */
export interface ResourceActionRead {
  /**
   * The name of the action
   * @type {string}
   * @memberof ResourceActionRead
   */
  name: string;
  /**
   * An optional longer description of what this action respresents in your system
   * @type {string}
   * @memberof ResourceActionRead
   */
  description?: string;
  /**
   * optional dictionary of key-value pairs that can be used to store arbitrary metadata about this action. This metadata can be used to filter actions using query parameters with attr_ prefix
   * @type {object}
   * @memberof ResourceActionRead
   */
  attributes?: object;
  /**
   * A URL-friendly name of the action (i.e: slug). You will be able to query later using this key instead of the id (UUID) of the action.
   * @type {string}
   * @memberof ResourceActionRead
   */
  key: string;
  /**
   * Unique id of the action
   * @type {string}
   * @memberof ResourceActionRead
   */
  id: string;
  /**
   * The name of the action, prefixed by the resource the action is acting upon.
   * @type {string}
   * @memberof ResourceActionRead
   */
  permission_name: string;
  /**
   * Unique id of the organization that the action belongs to.
   * @type {string}
   * @memberof ResourceActionRead
   */
  organization_id: string;
  /**
   * Unique id of the project that the action belongs to.
   * @type {string}
   * @memberof ResourceActionRead
   */
  project_id: string;
  /**
   * Unique id of the environment that the action belongs to.
   * @type {string}
   * @memberof ResourceActionRead
   */
  environment_id: string;
  /**
   * Unique id of the resource that the action belongs to.
   * @type {string}
   * @memberof ResourceActionRead
   */
  resource_id: string;
  /**
   * Date and time when the action was created (ISO_8601 format).
   * @type {string}
   * @memberof ResourceActionRead
   */
  created_at: string;
  /**
   * Date and time when the action was last updated/modified (ISO_8601 format).
   * @type {string}
   * @memberof ResourceActionRead
   */
  updated_at: string;
}
