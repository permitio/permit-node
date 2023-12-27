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
 * @interface ActivityDetailsObject
 */
export interface ActivityDetailsObject {
  /**
   *
   * @type {string}
   * @memberof ActivityDetailsObject
   */
  id?: string;
  /**
   *
   * @type {string}
   * @memberof ActivityDetailsObject
   */
  key?: string;
  /**
   *
   * @type {string}
   * @memberof ActivityDetailsObject
   */
  kind?: ActivityDetailsObjectKindEnum;
  /**
   *
   * @type {string}
   * @memberof ActivityDetailsObject
   */
  type: string;
}

export const ActivityDetailsObjectKindEnum = {
  Object: 'object',
} as const;

export type ActivityDetailsObjectKindEnum =
  typeof ActivityDetailsObjectKindEnum[keyof typeof ActivityDetailsObjectKindEnum];