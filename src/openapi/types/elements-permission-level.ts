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

export const ElementsPermissionLevel = {
  Level1: 'LEVEL_1',
  Level2: 'LEVEL_2',
  Level3: 'LEVEL_3',
  Level4: 'LEVEL_4',
  Hidden: 'HIDDEN',
  Unconfigured: 'UNCONFIGURED',
} as const;

export type ElementsPermissionLevel =
  (typeof ElementsPermissionLevel)[keyof typeof ElementsPermissionLevel];
