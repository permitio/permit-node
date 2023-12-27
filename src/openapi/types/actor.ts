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
import { AuthnMeAPIKeyRead } from './authn-me-apikey-read';
// May contain unused imports in some cases
// @ts-ignore
import { AuthnMeMemberRead } from './authn-me-member-read';
// May contain unused imports in some cases
// @ts-ignore
import { AuthnMeUserRead } from './authn-me-user-read';
// May contain unused imports in some cases
// @ts-ignore
import { MemberAccessObj } from './member-access-obj';

/**
 * @type Actor
 * @export
 */
export type Actor =
  | ({ actor_type: 'api_key' } & AuthnMeAPIKeyRead)
  | ({ actor_type: 'member' } & AuthnMeMemberRead)
  | ({ actor_type: 'user' } & AuthnMeUserRead);