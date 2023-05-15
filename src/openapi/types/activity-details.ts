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
import { ActivityDetailsList } from './activity-details-list';
// May contain unused imports in some cases
// @ts-ignore
import { ActivityDetailsObject } from './activity-details-object';
// May contain unused imports in some cases
// @ts-ignore
import { ActivityDetailsObjectData } from './activity-details-object-data';

/**
 * @type ActivityDetails
 * @export
 */
export type ActivityDetails =
  | ({ kind: 'list' } & ActivityDetailsList)
  | ({ kind: 'object' } & ActivityDetailsObject);