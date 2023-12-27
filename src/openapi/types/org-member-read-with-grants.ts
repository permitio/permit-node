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
import { IdentityRead } from './identity-read';
// May contain unused imports in some cases
// @ts-ignore
import { InviteRead } from './invite-read';
// May contain unused imports in some cases
// @ts-ignore
import { OnboardingStep } from './onboarding-step';
// May contain unused imports in some cases
// @ts-ignore
import { Permission } from './permission';

/**
 *
 * @export
 * @interface OrgMemberReadWithGrants
 */
export interface OrgMemberReadWithGrants {
  /**
   * Unique id of the account member
   * @type {string}
   * @memberof OrgMemberReadWithGrants
   */
  id: string;
  /**
   * Email of the user controlling this account
   * @type {string}
   * @memberof OrgMemberReadWithGrants
   */
  email: string;
  /**
   * Whether this email address is verified or not. For social providers like \'Login with Google\' this is done automatically, otherwise we will send the user a verification link in email.
   * @type {boolean}
   * @memberof OrgMemberReadWithGrants
   */
  email_verified: boolean;
  /**
   * Name of this user
   * @type {string}
   * @memberof OrgMemberReadWithGrants
   */
  name?: string;
  /**
   * First name of the user
   * @type {string}
   * @memberof OrgMemberReadWithGrants
   */
  given_name?: string;
  /**
   * Last name of the user
   * @type {string}
   * @memberof OrgMemberReadWithGrants
   */
  family_name?: string;
  /**
   * URL to picture, photo, or avatar of the user that controls this account.
   * @type {string}
   * @memberof OrgMemberReadWithGrants
   */
  picture?: string;
  /**
   * Whether or not this user has special access to permit.io organizations
   * @type {boolean}
   * @memberof OrgMemberReadWithGrants
   */
  is_superuser: boolean;
  /**
   * Whether or not this user is currently onboarding, needs to be replaced by a user journey object
   * @type {boolean}
   * @memberof OrgMemberReadWithGrants
   */
  is_onboarding: boolean;
  /**
   * the step the user is currently going through in onboarding
   * @type {OnboardingStep}
   * @memberof OrgMemberReadWithGrants
   */
  onboarding_step: OnboardingStep;
  /**
   * Date and time when the account member was created (ISO_8601 format).
   * @type {string}
   * @memberof OrgMemberReadWithGrants
   */
  created_at: string;
  /**
   * Last date and time this user logged in (ISO_8601 format).
   * @type {string}
   * @memberof OrgMemberReadWithGrants
   */
  last_login?: string;
  /**
   * Last IP address from which this user logged in.
   * @type {string}
   * @memberof OrgMemberReadWithGrants
   */
  last_ip?: string;
  /**
   * Total number of logins this user has performed.
   * @type {number}
   * @memberof OrgMemberReadWithGrants
   */
  logins_count?: number;
  /**
   *
   * @type {Array<IdentityRead>}
   * @memberof OrgMemberReadWithGrants
   */
  identities: Array<IdentityRead>;
  /**
   *
   * @type {InviteRead}
   * @memberof OrgMemberReadWithGrants
   */
  invite?: InviteRead;
  /**
   * Custom permit.io dashboard settings, such as preferred theme, etc.
   * @type {object}
   * @memberof OrgMemberReadWithGrants
   */
  settings: object;
  /**
   *
   * @type {Array<Permission>}
   * @memberof OrgMemberReadWithGrants
   */
  grants: Array<Permission>;
}