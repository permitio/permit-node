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
 * @interface EnvironmentRead
 */
export interface EnvironmentRead {
  /**
   * A URL-friendly name of the environment (i.e: slug). You will be able to query later using this key instead of the id (UUID) of the environment.
   * @type {string}
   * @memberof EnvironmentRead
   */
  key: string;
  /**
   * Unique id of the environment
   * @type {string}
   * @memberof EnvironmentRead
   */
  id: string;
  /**
   * Unique id of the organization that the environment belongs to.
   * @type {string}
   * @memberof EnvironmentRead
   */
  organization_id: string;
  /**
   * Unique id of the project that the environment belongs to.
   * @type {string}
   * @memberof EnvironmentRead
   */
  project_id: string;
  /**
   * Date and time when the environment was created (ISO_8601 format).
   * @type {string}
   * @memberof EnvironmentRead
   */
  created_at: string;
  /**
   * Date and time when the environment was last updated/modified (ISO_8601 format).
   * @type {string}
   * @memberof EnvironmentRead
   */
  updated_at: string;
  /**
   * The name of the environment
   * @type {string}
   * @memberof EnvironmentRead
   */
  name: string;
  /**
   * an optional longer description of the environment
   * @type {string}
   * @memberof EnvironmentRead
   */
  description?: string;
  /**
   * when using gitops feature, an optional branch name for the environment
   * @type {string}
   * @memberof EnvironmentRead
   */
  custom_branch_name?: string;
}
