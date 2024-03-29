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
 * @interface IdentityRead
 */
export interface IdentityRead {
  /**
   * Unique User Id of this identity in the identity provider (including the provider type)
   * @type {string}
   * @memberof IdentityRead
   */
  user_id: string;
  /**
   * The identity provider type this identity came from
   * @type {string}
   * @memberof IdentityRead
   */
  provider: string;
  /**
   * Unique User Id of this identity in the identity provider (NOT including the provider type)
   * @type {string}
   * @memberof IdentityRead
   */
  sub: string;
  /**
   * Email connected to this account identity
   * @type {string}
   * @memberof IdentityRead
   */
  email: string;
  /**
   * Whether this email address connected to this account identity is verified or not. For social providers like \'Login with Google\' this is done automatically, otherwise we will send the user a verification link in email.
   * @type {boolean}
   * @memberof IdentityRead
   */
  email_verified: boolean;
  /**
   * Raw user info json coming from our identity provider and matching a specific account identity
   * @type {object}
   * @memberof IdentityRead
   */
  auth0_info: object;
}
