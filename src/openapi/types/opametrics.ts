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
 * @interface OPAMetrics
 */
export interface OPAMetrics {
  /**
   *
   * @type {number}
   * @memberof OPAMetrics
   */
  timer_rego_input_parse_ns?: number;
  /**
   *
   * @type {number}
   * @memberof OPAMetrics
   */
  timer_rego_query_parse_ns?: number;
  /**
   *
   * @type {number}
   * @memberof OPAMetrics
   */
  timer_rego_query_compile_ns?: number;
  /**
   *
   * @type {number}
   * @memberof OPAMetrics
   */
  timer_rego_query_eval_ns?: number;
  /**
   *
   * @type {number}
   * @memberof OPAMetrics
   */
  timer_rego_module_parse_ns?: number;
  /**
   *
   * @type {number}
   * @memberof OPAMetrics
   */
  timer_rego_module_compile_ns?: number;
  /**
   *
   * @type {number}
   * @memberof OPAMetrics
   */
  timer_server_handler_ns?: number;
}
