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
 * @interface OrganizationRegeneration
 */
export interface OrganizationRegeneration {
  /**
   *
   * @type {string}
   * @memberof OrganizationRegeneration
   */
  scope: OrganizationRegenerationScopeEnum;
  /**
   *
   * @type {string}
   * @memberof OrganizationRegeneration
   */
  org_id: string;
}

export const OrganizationRegenerationScopeEnum = {
  Organization: 'organization',
} as const;

export type OrganizationRegenerationScopeEnum =
  (typeof OrganizationRegenerationScopeEnum)[keyof typeof OrganizationRegenerationScopeEnum];
