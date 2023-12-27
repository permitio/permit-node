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
import { ElementsType } from './elements-type';
// May contain unused imports in some cases
// @ts-ignore
import { Settings } from './settings';
// May contain unused imports in some cases
// @ts-ignore
import { WebhookUpdate } from './webhook-update';

/**
 *
 * @export
 * @interface ElementsConfigUpdate
 */
export interface ElementsConfigUpdate {
  /**
   * The name of the elements_config
   * @type {string}
   * @memberof ElementsConfigUpdate
   */
  name?: string;
  /**
   * The type of the elements interface, e.g: user management
   * @type {ElementsType}
   * @memberof ElementsConfigUpdate
   */
  elements_type?: ElementsType;
  /**
   * Obj with the options of the elements interface, e.g: primary color
   * @type {{ [key: string]: Settings; }}
   * @memberof ElementsConfigUpdate
   */
  settings?: { [key: string]: Settings };
  /**
   * Obj with levels as keys and role ids as values
   * @type {{ [key: string]: Array<string>; }}
   * @memberof ElementsConfigUpdate
   */
  roles_to_levels: { [key: string]: Array<string> };
  /**
   *
   * @type {WebhookUpdate}
   * @memberof ElementsConfigUpdate
   */
  webhook?: WebhookUpdate;
}