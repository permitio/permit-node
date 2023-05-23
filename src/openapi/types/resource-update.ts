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

// May contain unused imports in some cases
// @ts-ignore
import { ActionBlockEditable } from './action-block-editable';
// May contain unused imports in some cases
// @ts-ignore
import { AttributeBlockEditable } from './attribute-block-editable';

/**
 *
 * @export
 * @interface ResourceUpdate
 */
export interface ResourceUpdate {
  /**
   * The name of the resource
   * @type {string}
   * @memberof ResourceUpdate
   */
  name?: string;
  /**
   * The [URN](https://en.wikipedia.org/wiki/Uniform_Resource_Name) (Uniform Resource Name) of the resource
   * @type {string}
   * @memberof ResourceUpdate
   */
  urn?: string;
  /**
   * An optional longer description of what this resource respresents in your system
   * @type {string}
   * @memberof ResourceUpdate
   */
  description?: string;
  /**
   *          A actions definition block, typically contained within a resource type definition block.         The actions represents the ways you can interact with a protected resource.
   * @type {{ [key: string]: ActionBlockEditable; }}
   * @memberof ResourceUpdate
   */
  actions?: { [key: string]: ActionBlockEditable };
  /**
   * Attributes that each resource of this type defines, and can be used in your ABAC policies.
   * @type {{ [key: string]: AttributeBlockEditable; }}
   * @memberof ResourceUpdate
   */
  attributes?: { [key: string]: AttributeBlockEditable };
  /**
   * Roles defined on this resource. The key is the role name, and the value contains the role properties such as granted permissions, base roles, etc.
   * @type {object}
   * @memberof ResourceUpdate
   */
  roles?: object;
  /**
   * Relations to other resources. The key is the relation name, and the value is the related resource.
   * @type {object}
   * @memberof ResourceUpdate
   */
  relations?: object;
}
