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
 * @interface DerivedRoleRuleRead
 */
export interface DerivedRoleRuleRead {
  /**
   * the role id that needs to exist on the related resource (from the relation)
   * @type {string}
   * @memberof DerivedRoleRuleRead
   */
  role_id: string;
  /**
   * the resource id that needs to exist on the related role (from the relation)
   * @type {string}
   * @memberof DerivedRoleRuleRead
   */
  resource_id: string;
  /**
   * the relation id that needs to exist between the resource and the related resource
   * @type {string}
   * @memberof DerivedRoleRuleRead
   */
  relation_id: string;
  /**
   * the role key that needs to exist on the related resource (from the relation)
   * @type {string}
   * @memberof DerivedRoleRuleRead
   */
  role: string;
  /**
   * the resource key that needs to exist on the related role (from the relation)
   * @type {string}
   * @memberof DerivedRoleRuleRead
   */
  on_resource: string;
  /**
   * the relation key that needs to exist between the resource and the related resource
   * @type {string}
   * @memberof DerivedRoleRuleRead
   */
  linked_by_relation: string;
}
