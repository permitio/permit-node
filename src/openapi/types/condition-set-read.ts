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
import { ConditionSetType } from './condition-set-type';
// May contain unused imports in some cases
// @ts-ignore
import { ParentId } from './parent-id';
// May contain unused imports in some cases
// @ts-ignore
import { ResourceId } from './resource-id';
// May contain unused imports in some cases
// @ts-ignore
import { ResourceRead } from './resource-read';

/**
 *
 * @export
 * @interface ConditionSetRead
 */
export interface ConditionSetRead {
  /**
   * A unique id by which Permit will identify the condition set. The key will be used as the generated rego rule name.
   * @type {string}
   * @memberof ConditionSetRead
   */
  key: string;
  /**
   * the type of the set: UserSet or ResourceSet
   * @type {ConditionSetType}
   * @memberof ConditionSetRead
   */
  type?: ConditionSetType;
  /**
   * whether the set was autogenerated by the system.
   * @type {boolean}
   * @memberof ConditionSetRead
   */
  autogenerated?: boolean;
  /**
   *
   * @type {ResourceId}
   * @memberof ConditionSetRead
   */
  resource_id?: ResourceId;
  /**
   * Unique id of the condition set
   * @type {string}
   * @memberof ConditionSetRead
   */
  id: string;
  /**
   * Unique id of the organization that the condition set belongs to.
   * @type {string}
   * @memberof ConditionSetRead
   */
  organization_id: string;
  /**
   * Unique id of the project that the condition set belongs to.
   * @type {string}
   * @memberof ConditionSetRead
   */
  project_id: string;
  /**
   * Unique id of the environment that the condition set belongs to.
   * @type {string}
   * @memberof ConditionSetRead
   */
  environment_id: string;
  /**
   * Date and time when the condition set was created (ISO_8601 format).
   * @type {string}
   * @memberof ConditionSetRead
   */
  created_at: string;
  /**
   * Date and time when the condition set was last updated/modified (ISO_8601 format).
   * @type {string}
   * @memberof ConditionSetRead
   */
  updated_at: string;
  /**
   *
   * @type {ResourceRead}
   * @memberof ConditionSetRead
   */
  resource?: ResourceRead;
  /**
   * A descriptive name for the set, i.e: \'US based employees\' or \'Users behind VPN\'
   * @type {string}
   * @memberof ConditionSetRead
   */
  name: string;
  /**
   * an optional longer description of the set
   * @type {string}
   * @memberof ConditionSetRead
   */
  description?: string;
  /**
   * a boolean expression that consists of multiple conditions, with and/or logic.
   * @type {object}
   * @memberof ConditionSetRead
   */
  conditions?: object;
  /**
   *
   * @type {ParentId}
   * @memberof ConditionSetRead
   */
  parent_id?: ParentId;
}
