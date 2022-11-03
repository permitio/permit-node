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
 * @interface ConditionSetRuleRead
 */
export interface ConditionSetRuleRead {
  /**
   * Unique id of the condition set rule
   * @type {string}
   * @memberof ConditionSetRuleRead
   */
  id: string;
  /**
   * A unique id by which Permit will identify this condition set rule.
   * @type {string}
   * @memberof ConditionSetRuleRead
   */
  key: string;
  /**
   * the userset that is currently granted permissions, i.e: all the users matching this rule are granted the permission on the resourceset
   * @type {string}
   * @memberof ConditionSetRuleRead
   */
  user_set: string;
  /**
   * a permission that is currently granted to the userset *on* the resourceset.
   * @type {string}
   * @memberof ConditionSetRuleRead
   */
  permission: string;
  /**
   * the resourceset that represents the resources that are currently granted for access, i.e: all the resources matching this rule can be accessed by the userset to perform the granted *permission*
   * @type {string}
   * @memberof ConditionSetRuleRead
   */
  resource_set: string;
  /**
   * Unique id of the organization that the condition set rule belongs to.
   * @type {string}
   * @memberof ConditionSetRuleRead
   */
  organization_id: string;
  /**
   * Unique id of the project that the condition set rule belongs to.
   * @type {string}
   * @memberof ConditionSetRuleRead
   */
  project_id: string;
  /**
   * Unique id of the environment that the condition set rule belongs to.
   * @type {string}
   * @memberof ConditionSetRuleRead
   */
  environment_id: string;
  /**
   * Date and time when the condition set rule was created (ISO_8601 format).
   * @type {string}
   * @memberof ConditionSetRuleRead
   */
  created_at: string;
  /**
   * Date and time when the condition set rule was last updated/modified (ISO_8601 format).
   * @type {string}
   * @memberof ConditionSetRuleRead
   */
  updated_at: string;
}