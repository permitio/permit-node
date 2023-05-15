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
import { EnvironmentRegeneration } from './environment-regeneration';
// May contain unused imports in some cases
// @ts-ignore
import { FullRegeneration } from './full-regeneration';
// May contain unused imports in some cases
// @ts-ignore
import { OrganizationRegeneration } from './organization-regeneration';
// May contain unused imports in some cases
// @ts-ignore
import { ProjectRegeneration } from './project-regeneration';

/**
 * @type Payload
 * @export
 */
export type Payload =
  | ({ scope: 'environment' } & EnvironmentRegeneration)
  | ({ scope: 'full' } & FullRegeneration)
  | ({ scope: 'organization' } & OrganizationRegeneration)
  | ({ scope: 'project' } & ProjectRegeneration);