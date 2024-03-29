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
import { Entry } from './entry';

/**
 * A report of the processing of a single DataSourceEntry.
 * @export
 * @interface DataEntryReport
 */
export interface DataEntryReport {
  /**
   *
   * @type {Entry}
   * @memberof DataEntryReport
   */
  entry: Entry;
  /**
   *
   * @type {boolean}
   * @memberof DataEntryReport
   */
  fetched?: boolean;
  /**
   *
   * @type {boolean}
   * @memberof DataEntryReport
   */
  saved?: boolean;
  /**
   *
   * @type {string}
   * @memberof DataEntryReport
   */
  hash?: string;
}
