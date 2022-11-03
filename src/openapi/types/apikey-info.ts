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
import { APIKeyOwnerType } from './apikey-owner-type';
// May contain unused imports in some cases
// @ts-ignore
import { MemberAccessLevel } from './member-access-level';
// May contain unused imports in some cases
// @ts-ignore
import { MemberAccessObj } from './member-access-obj';

/**
 *
 * @export
 * @interface APIKeyInfo
 */
export interface APIKeyInfo {
  /**
   *
   * @type {string}
   * @memberof APIKeyInfo
   */
  id: string;
  /**
   *
   * @type {string}
   * @memberof APIKeyInfo
   */
  org_id: string;
  /**
   *
   * @type {string}
   * @memberof APIKeyInfo
   */
  project_id?: string;
  /**
   *
   * @type {string}
   * @memberof APIKeyInfo
   */
  env_id?: string;
  /**
   *
   * @type {MemberAccessLevel}
   * @memberof APIKeyInfo
   */
  access_level: MemberAccessLevel;
  /**
   *
   * @type {MemberAccessObj}
   * @memberof APIKeyInfo
   */
  object_type: MemberAccessObj;
  /**
   *
   * @type {APIKeyOwnerType}
   * @memberof APIKeyInfo
   */
  owner_type: APIKeyOwnerType;
}