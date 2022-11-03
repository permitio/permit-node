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
import { ResourceId } from './resource-id';

/**
 *
 * @export
 * @interface ConditionSetCreate
 */
export interface ConditionSetCreate {
  /**
   * A unique id by which Permit will identify the condition set. The key will be used as the generated rego rule name.
   * @type {string}
   * @memberof ConditionSetCreate
   */
  key: string;
  /**
   * the type of the set: UserSet or ResourceSet
   * @type {ConditionSetType}
   * @memberof ConditionSetCreate
   */
  type?: ConditionSetType;
  /**
   * whether the set was autogenerated by the system.
   * @type {boolean}
   * @memberof ConditionSetCreate
   */
  autogenerated?: boolean;
  /**
   *
   * @type {ResourceId}
   * @memberof ConditionSetCreate
   */
  resource_id?: ResourceId;
  /**
   * A descriptive name for the set, i.e: \'US based employees\' or \'Users behind VPN\'
   * @type {string}
   * @memberof ConditionSetCreate
   */
  name: string;
  /**
   * an optional longer description of the set
   * @type {string}
   * @memberof ConditionSetCreate
   */
  description?: string;
  /**
   * a boolean expression that consists of multiple conditions, with and/or logic.
   * @type {object}
   * @memberof ConditionSetCreate
   */
  conditions?: object;
}