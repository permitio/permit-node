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
import { AuthMechanism } from './auth-mechanism';
// May contain unused imports in some cases
// @ts-ignore
import { MappingRule } from './mapping-rule';
// May contain unused imports in some cases
// @ts-ignore
import { Secret } from './secret';

/**
 *
 * @export
 * @interface ProxyConfigUpdate
 */
export interface ProxyConfigUpdate {
  /**
   *
   * @type {Secret}
   * @memberof ProxyConfigUpdate
   */
  secret?: Secret;
  /**
   * The name of the proxy config, for example: \'Stripe API\'
   * @type {string}
   * @memberof ProxyConfigUpdate
   */
  name?: string;
  /**
   * Proxy config mapping rules will include the rules that will be used to map the request to the backend service by a URL and a http method.
   * @type {Array<MappingRule>}
   * @memberof ProxyConfigUpdate
   */
  mapping_rules?: Array<MappingRule>;
  /**
   * Proxy config auth mechanism will define the authentication mechanism that will be used to authenticate the request.  Bearer injects the secret into the Authorization header as a Bearer token,  Basic injects the secret into the Authorization header as a Basic user:password,  Headers injects plain headers into the request.
   * @type {AuthMechanism}
   * @memberof ProxyConfigUpdate
   */
  auth_mechanism?: AuthMechanism;
}
