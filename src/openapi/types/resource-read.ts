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

import { ActionBlockRead } from './action-block-read';
import { AttributeBlockRead } from './attribute-block-read';

/**
 *
 * @export
 * @interface ResourceRead
 */
export interface ResourceRead {
  /**
   * A URL-friendly name of the resource (i.e: slug). You will be able to query later using this key instead of the id (UUID) of the resource.
   * @type {string}
   * @memberof ResourceRead
   */
  key: string;
  /**
   * Unique id of the resource
   * @type {string}
   * @memberof ResourceRead
   */
  id: string;
  /**
   * Unique id of the organization that the resource belongs to.
   * @type {string}
   * @memberof ResourceRead
   */
  organization_id: string;
  /**
   * Unique id of the project that the resource belongs to.
   * @type {string}
   * @memberof ResourceRead
   */
  project_id: string;
  /**
   * Unique id of the environment that the resource belongs to.
   * @type {string}
   * @memberof ResourceRead
   */
  environment_id: string;
  /**
   * Date and time when the resource was created (ISO_8601 format).
   * @type {string}
   * @memberof ResourceRead
   */
  created_at: string;
  /**
   * Date and time when the resource was last updated/modified (ISO_8601 format).
   * @type {string}
   * @memberof ResourceRead
   */
  updated_at: string;
  /**
   * The name of the resource
   * @type {string}
   * @memberof ResourceRead
   */
  name: string;
  /**
   * The [URN](https://en.wikipedia.org/wiki/Uniform_Resource_Name) (Uniform Resource Name) of the resource
   * @type {string}
   * @memberof ResourceRead
   */
  urn?: string;
  /**
   * An optional longer description of what this resource respresents in your system
   * @type {string}
   * @memberof ResourceRead
   */
  description?: string;
  /**
   *          A actions definition block, typically contained within a resource type definition block.         The actions represents the ways you can interact with a protected resource.
   * @type {{ [key: string]: ActionBlockRead; }}
   * @memberof ResourceRead
   */
  actions?: { [key: string]: ActionBlockRead };
  /**
   * Attributes that each resource of this type defines, and can be used in your ABAC policies.
   * @type {{ [key: string]: AttributeBlockRead; }}
   * @memberof ResourceRead
   */
  attributes?: { [key: string]: AttributeBlockRead };
  /**
   * Roles defined on this resource. The key is the role name, and the value contains the role properties such as granted permissions, base roles, etc.
   * @type {object}
   * @memberof ResourceRead
   */
  roles?: object;
  /**
   * Relations to other resources. The key is the relation name, and the value is the destination resource.
   * @type {object}
   * @memberof ResourceRead
   */
  relations?: object;
}
