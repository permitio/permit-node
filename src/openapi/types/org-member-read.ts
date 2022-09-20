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
import { OnboardingStep } from './onboarding-step';

/**
 *
 * @export
 * @interface OrgMemberRead
 */
export interface OrgMemberRead {
  /**
   * Unique id of the account member
   * @type {string}
   * @memberof OrgMemberRead
   */
  id: string;
  /**
   * Email of the user controlling this account
   * @type {string}
   * @memberof OrgMemberRead
   */
  email: string;
  /**
   * Whether this email address is verified or not. For social providers like \'Login with Google\' this is done automatically, otherwise we will send the user a verification link in email.
   * @type {boolean}
   * @memberof OrgMemberRead
   */
  email_verified: boolean;
  /**
   * Name of this user
   * @type {string}
   * @memberof OrgMemberRead
   */
  name?: string;
  /**
   * First name of the user
   * @type {string}
   * @memberof OrgMemberRead
   */
  given_name?: string;
  /**
   * Last name of the user
   * @type {string}
   * @memberof OrgMemberRead
   */
  family_name?: string;
  /**
   * URL to picture, photo, or avatar of the user that controls this account.
   * @type {string}
   * @memberof OrgMemberRead
   */
  picture?: string;
  /**
   * Whether or not this user has special access to permit.io organizations
   * @type {boolean}
   * @memberof OrgMemberRead
   */
  is_superuser: boolean;
  /**
   * Whether or not this user is currently onboarding, needs to be replaced by a user journey object
   * @type {boolean}
   * @memberof OrgMemberRead
   */
  is_onboarding: boolean;
  /**
   * the step the user is currently going through in onboarding
   * @type {OnboardingStep}
   * @memberof OrgMemberRead
   */
  onboarding_step: OnboardingStep;
  /**
   * Date and time when the account member was created (ISO_8601 format).
   * @type {string}
   * @memberof OrgMemberRead
   */
  created_at: string;
  /**
   * Last date and time this user logged in (ISO_8601 format).
   * @type {string}
   * @memberof OrgMemberRead
   */
  last_login?: string;
  /**
   * Last IP address from which this user logged in.
   * @type {string}
   * @memberof OrgMemberRead
   */
  last_ip?: string;
  /**
   * Total number of logins this user has performed.
   * @type {number}
   * @memberof OrgMemberRead
   */
  logins_count?: number;
  /**
   *
   * @type {Array<IdentityRead>}
   * @memberof OrgMemberRead
   */
  identities: Array<IdentityRead>;
  /**
   * Custom permit.io dashboard settings, such as preferred theme, etc.
   * @type {object}
   * @memberof OrgMemberRead
   */
  settings: object;
}
