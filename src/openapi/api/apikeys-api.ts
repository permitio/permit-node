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

import globalAxios, { AxiosPromise, AxiosInstance, AxiosRequestConfig } from 'axios';
import { Configuration } from '../configuration';
// Some imports not used depending on template conditions
// @ts-ignore
import {
  DUMMY_BASE_URL,
  assertParamExists,
  setApiKeyToObject,
  setBasicAuthToObject,
  setBearerAuthToObject,
  setOAuthToObject,
  setSearchParams,
  serializeDataIfNeeded,
  toPathString,
  createRequestFunction,
} from '../common';
// @ts-ignore
import { BASE_PATH, COLLECTION_FORMATS, RequestArgs, BaseAPI, RequiredError } from '../base';
// @ts-ignore
import { APIKeyScopeRead } from '../types';
// @ts-ignore
import { HTTPValidationError } from '../types';
/**
 * APIKeysApi - axios parameter creator
 * @export
 */
export const APIKeysApiAxiosParamCreator = function (configuration?: Configuration) {
  return {
    /**
     *
     * @summary Get Api Key Scope
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getApiKeyScope: async (
      permitSession?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v2/api-key/scope`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = { method: 'GET', ...baseOptions, ...options };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication HTTPBearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
  };
};

/**
 * APIKeysApi - functional programming interface
 * @export
 */
export const APIKeysApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = APIKeysApiAxiosParamCreator(configuration);
  return {
    /**
     *
     * @summary Get Api Key Scope
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async getApiKeyScope(
      permitSession?: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<APIKeyScopeRead>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.getApiKeyScope(
        permitSession,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
  };
};

/**
 * APIKeysApi - factory interface
 * @export
 */
export const APIKeysApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = APIKeysApiFp(configuration);
  return {
    /**
     *
     * @summary Get Api Key Scope
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getApiKeyScope(permitSession?: string, options?: any): AxiosPromise<APIKeyScopeRead> {
      return localVarFp
        .getApiKeyScope(permitSession, options)
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * Request parameters for getApiKeyScope operation in APIKeysApi.
 * @export
 * @interface APIKeysApiGetApiKeyScopeRequest
 */
export interface APIKeysApiGetApiKeyScopeRequest {
  /**
   *
   * @type {string}
   * @memberof APIKeysApiGetApiKeyScope
   */
  readonly permitSession?: string;
}

/**
 * APIKeysApi - object-oriented interface
 * @export
 * @class APIKeysApi
 * @extends {BaseAPI}
 */
export class APIKeysApi extends BaseAPI {
  /**
   *
   * @summary Get Api Key Scope
   * @param {APIKeysApiGetApiKeyScopeRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof APIKeysApi
   */
  public getApiKeyScope(
    requestParameters: APIKeysApiGetApiKeyScopeRequest = {},
    options?: AxiosRequestConfig,
  ) {
    return APIKeysApiFp(this.configuration)
      .getApiKeyScope(requestParameters.permitSession, options)
      .then((request) => request(this.axios, this.basePath));
  }
}
