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
import { ConditionSetData } from './condition-set-data';
// May contain unused imports in some cases
// @ts-ignore
import { ConditionSetType } from './condition-set-type';

/**
 *
 * @export
 * @interface ResponseGetDataForConditionSetV2InternalOpalDataOrgIdProjIdEnvIdConditionSetsConditionSetIdGet
 */
export interface ResponseGetDataForConditionSetV2InternalOpalDataOrgIdProjIdEnvIdConditionSetsConditionSetIdGet {
  /**
   *
   * @type {ConditionSetType}
   * @memberof ResponseGetDataForConditionSetV2InternalOpalDataOrgIdProjIdEnvIdConditionSetsConditionSetIdGet
   */
  type: ConditionSetType;
  /**
   *
   * @type {string}
   * @memberof ResponseGetDataForConditionSetV2InternalOpalDataOrgIdProjIdEnvIdConditionSetsConditionSetIdGet
   */
  key: string;
}
