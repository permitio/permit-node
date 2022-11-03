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
import { HTTPValidationError } from '../types';
// @ts-ignore
import { LanguageInstructions } from '../types';
/**
 * InstructionsApi - axios parameter creator
 * @export
 */
export const InstructionsApiAxiosParamCreator = function (configuration?: Configuration) {
  return {
    /**
     * Lists pending organization invites
     * @summary List Language Instructions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listLanguageInstructions: async (
      projId: string,
      envId: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('listLanguageInstructions', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('listLanguageInstructions', 'envId', envId);
      const localVarPath = `/v2/{proj_id}/{env_id}/get_instructions`
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)));
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
 * InstructionsApi - functional programming interface
 * @export
 */
export const InstructionsApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = InstructionsApiAxiosParamCreator(configuration);
  return {
    /**
     * Lists pending organization invites
     * @summary List Language Instructions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async listLanguageInstructions(
      projId: string,
      envId: string,
      options?: AxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<Array<LanguageInstructions>>
    > {
      const localVarAxiosArgs = await localVarAxiosParamCreator.listLanguageInstructions(
        projId,
        envId,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
  };
};

/**
 * InstructionsApi - factory interface
 * @export
 */
export const InstructionsApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = InstructionsApiFp(configuration);
  return {
    /**
     * Lists pending organization invites
     * @summary List Language Instructions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listLanguageInstructions(
      projId: string,
      envId: string,
      options?: any,
    ): AxiosPromise<Array<LanguageInstructions>> {
      return localVarFp
        .listLanguageInstructions(projId, envId, options)
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * Request parameters for listLanguageInstructions operation in InstructionsApi.
 * @export
 * @interface InstructionsApiListLanguageInstructionsRequest
 */
export interface InstructionsApiListLanguageInstructionsRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof InstructionsApiListLanguageInstructions
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof InstructionsApiListLanguageInstructions
   */
  readonly envId: string;
}

/**
 * InstructionsApi - object-oriented interface
 * @export
 * @class InstructionsApi
 * @extends {BaseAPI}
 */
export class InstructionsApi extends BaseAPI {
  /**
   * Lists pending organization invites
   * @summary List Language Instructions
   * @param {InstructionsApiListLanguageInstructionsRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof InstructionsApi
   */
  public listLanguageInstructions(
    requestParameters: InstructionsApiListLanguageInstructionsRequest,
    options?: AxiosRequestConfig,
  ) {
    return InstructionsApiFp(this.configuration)
      .listLanguageInstructions(requestParameters.projId, requestParameters.envId, options)
      .then((request) => request(this.axios, this.basePath));
  }
}
