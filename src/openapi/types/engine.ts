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

export const Engine = {
  Opa: 'OPA',
  Avp: 'AVP',
} as const;

export type Engine = (typeof Engine)[keyof typeof Engine];
