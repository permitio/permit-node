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
 * @interface RelationRead
 */
export interface RelationRead {
  /**
   * An optional longer description of what this relation respresents in your system
   * @type {string}
   * @memberof RelationRead
   */
  description?: string;
  /**
   * The subject resource ID or key
   * @type {string}
   * @memberof RelationRead
   */
  subject_resource: string;
  /**
   * A URL-friendly name of the relation (i.e: slug). You will be able to query later using this key instead of the id (UUID) of the relation.
   * @type {string}
   * @memberof RelationRead
   */
  key: string;
  /**
   * The name of the relation
   * @type {string}
   * @memberof RelationRead
   */
  name: string;
  /**
   * Unique id of the relation
   * @type {string}
   * @memberof RelationRead
   */
  id: string;
  /**
   * Unique id of the organization that the relation belongs to.
   * @type {string}
   * @memberof RelationRead
   */
  organization_id: string;
  /**
   * Unique id of the project that the relation belongs to.
   * @type {string}
   * @memberof RelationRead
   */
  project_id: string;
  /**
   * Unique id of the environment that the relation belongs to.
   * @type {string}
   * @memberof RelationRead
   */
  environment_id: string;
  /**
   * Date and time when the relation was created (ISO_8601 format).
   * @type {string}
   * @memberof RelationRead
   */
  created_at: string;
  /**
   * Date and time when the relation was last updated/modified (ISO_8601 format).
   * @type {string}
   * @memberof RelationRead
   */
  updated_at: string;
  /**
   * The object resource id
   * @type {string}
   * @memberof RelationRead
   */
  object_resource_id: string;
  /**
   * The object resource key
   * @type {string}
   * @memberof RelationRead
   */
  object_resource: string;
  /**
   * The subject resource id
   * @type {string}
   * @memberof RelationRead
   */
  subject_resource_id: string;
}
