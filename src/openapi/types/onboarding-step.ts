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
 * An enumeration.
 * @export
 * @enum {string}
 */

export const OnboardingStep = {
  CreateOrganization: 'create_organization',
  CreateProject: 'create_project',
  CreateResource: 'create_resource',
  CreateActions: 'create_actions',
  AssignPermissions: 'assign_permissions',
  AssignUserRoles: 'assign_user_roles',
  ConnectSdk: 'connect_sdk',
  Done: 'done',
} as const;

export type OnboardingStep = typeof OnboardingStep[keyof typeof OnboardingStep];
