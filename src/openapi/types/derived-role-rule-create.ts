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

import { PermitBackendSchemasSchemaDerivedRoleDerivedRoleSettings } from './permit-backend-schemas-schema-derived-role-derived-role-settings';

/**
 *
 * @export
 * @interface DerivedRoleRuleCreate
 */
export interface DerivedRoleRuleCreate {
  /**
   * the role key that needs to exist on the related resource (from the relation)
   * @type {string}
   * @memberof DerivedRoleRuleCreate
   */
  role: string;
  /**
   * the resource key that needs to exist on the related role (from the relation)
   * @type {string}
   * @memberof DerivedRoleRuleCreate
   */
  on_resource: string;
  /**
   * the relation key that needs to exist between the resource and the related resource
   * @type {string}
   * @memberof DerivedRoleRuleCreate
   */
  linked_by_relation: string;
  /**
   * condition for the rule to be applied
   * @type {PermitBackendSchemasSchemaDerivedRoleDerivedRoleSettings}
   */
  when?: PermitBackendSchemasSchemaDerivedRoleDerivedRoleSettings;
}
