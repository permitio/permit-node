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

import { AllowedResult } from './allowed-result';
import { Labels } from './labels';

/**
 *
 * @export
 * @interface OPADecisionLog
 */
export interface OPADecisionLog {
  /**
   *
   * @type {Labels}
   * @memberof OPADecisionLog
   */
  labels: Labels;
  /**
   *
   * @type {string}
   * @memberof OPADecisionLog
   */
  run_id?: string;
  /**
   *
   * @type {string}
   * @memberof OPADecisionLog
   */
  decision_id: string;
  /**
   *
   * @type {string}
   * @memberof OPADecisionLog
   */
  timestamp: string;
  /**
   *
   * @type {string}
   * @memberof OPADecisionLog
   */
  path?: string;
  /**
   *
   * @type {object}
   * @memberof OPADecisionLog
   */
  input?: object;
  /**
   *
   * @type {AllowedResult}
   * @memberof OPADecisionLog
   */
  result?: AllowedResult;
}
