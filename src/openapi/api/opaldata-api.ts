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
import { FullData } from '../types';
// @ts-ignore
import { HTTPValidationError } from '../types';
// @ts-ignore
import { RoleData } from '../types';
// @ts-ignore
import { UserData } from '../types';
/**
 * OPALDataApi - axios parameter creator
 * @export
 */
export const OPALDataApiAxiosParamCreator = function (configuration?: Configuration) {
  return {
    /**
     *
     * @summary Get All Data
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getAllData: async (
      orgId: string,
      projId: string,
      envId: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'orgId' is not null or undefined
      assertParamExists('getAllData', 'orgId', orgId);
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('getAllData', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('getAllData', 'envId', envId);
      const localVarPath = `/v2/internal/opal_data/{org_id}/{proj_id}/{env_id}`
        .replace(`{${'org_id'}}`, encodeURIComponent(String(orgId)))
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
    /**
     *
     * @summary Get Data For Role
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} roleId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getDataForRole: async (
      orgId: string,
      projId: string,
      envId: string,
      roleId: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'orgId' is not null or undefined
      assertParamExists('getDataForRole', 'orgId', orgId);
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('getDataForRole', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('getDataForRole', 'envId', envId);
      // verify required parameter 'roleId' is not null or undefined
      assertParamExists('getDataForRole', 'roleId', roleId);
      const localVarPath = `/v2/internal/opal_data/{org_id}/{proj_id}/{env_id}/roles/{role_id}`
        .replace(`{${'org_id'}}`, encodeURIComponent(String(orgId)))
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)))
        .replace(`{${'role_id'}}`, encodeURIComponent(String(roleId)));
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
    /**
     * return permission assignment data between user sets and resource sets (i.e: condition set rules data)
     * @summary Get Data For Set Rule
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} userSetId
     * @param {string} resourceSetId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getDataForSetRule: async (
      orgId: string,
      projId: string,
      envId: string,
      userSetId: string,
      resourceSetId: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'orgId' is not null or undefined
      assertParamExists('getDataForSetRule', 'orgId', orgId);
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('getDataForSetRule', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('getDataForSetRule', 'envId', envId);
      // verify required parameter 'userSetId' is not null or undefined
      assertParamExists('getDataForSetRule', 'userSetId', userSetId);
      // verify required parameter 'resourceSetId' is not null or undefined
      assertParamExists('getDataForSetRule', 'resourceSetId', resourceSetId);
      const localVarPath =
        `/v2/internal/opal_data/{org_id}/{proj_id}/{env_id}/condition_set_rules/{user_set_id}/{resource_set_id}`
          .replace(`{${'org_id'}}`, encodeURIComponent(String(orgId)))
          .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
          .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)))
          .replace(`{${'user_set_id'}}`, encodeURIComponent(String(userSetId)))
          .replace(`{${'resource_set_id'}}`, encodeURIComponent(String(resourceSetId)));
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
    /**
     *
     * @summary Get Data For User
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} userId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getDataForUser: async (
      orgId: string,
      projId: string,
      envId: string,
      userId: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'orgId' is not null or undefined
      assertParamExists('getDataForUser', 'orgId', orgId);
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('getDataForUser', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('getDataForUser', 'envId', envId);
      // verify required parameter 'userId' is not null or undefined
      assertParamExists('getDataForUser', 'userId', userId);
      const localVarPath = `/v2/internal/opal_data/{org_id}/{proj_id}/{env_id}/users/{user_id}`
        .replace(`{${'org_id'}}`, encodeURIComponent(String(orgId)))
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)))
        .replace(`{${'user_id'}}`, encodeURIComponent(String(userId)));
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
 * OPALDataApi - functional programming interface
 * @export
 */
export const OPALDataApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = OPALDataApiAxiosParamCreator(configuration);
  return {
    /**
     *
     * @summary Get All Data
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async getAllData(
      orgId: string,
      projId: string,
      envId: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<FullData>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.getAllData(
        orgId,
        projId,
        envId,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     *
     * @summary Get Data For Role
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} roleId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async getDataForRole(
      orgId: string,
      projId: string,
      envId: string,
      roleId: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<RoleData>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.getDataForRole(
        orgId,
        projId,
        envId,
        roleId,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * return permission assignment data between user sets and resource sets (i.e: condition set rules data)
     * @summary Get Data For Set Rule
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} userSetId
     * @param {string} resourceSetId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async getDataForSetRule(
      orgId: string,
      projId: string,
      envId: string,
      userSetId: string,
      resourceSetId: string,
      options?: AxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<{ [key: string]: Array<string> }>
    > {
      const localVarAxiosArgs = await localVarAxiosParamCreator.getDataForSetRule(
        orgId,
        projId,
        envId,
        userSetId,
        resourceSetId,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     *
     * @summary Get Data For User
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} userId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async getDataForUser(
      orgId: string,
      projId: string,
      envId: string,
      userId: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<UserData>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.getDataForUser(
        orgId,
        projId,
        envId,
        userId,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
  };
};

/**
 * OPALDataApi - factory interface
 * @export
 */
export const OPALDataApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = OPALDataApiFp(configuration);
  return {
    /**
     *
     * @summary Get All Data
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getAllData(
      orgId: string,
      projId: string,
      envId: string,
      options?: any,
    ): AxiosPromise<FullData> {
      return localVarFp
        .getAllData(orgId, projId, envId, options)
        .then((request) => request(axios, basePath));
    },
    /**
     *
     * @summary Get Data For Role
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} roleId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getDataForRole(
      orgId: string,
      projId: string,
      envId: string,
      roleId: string,
      options?: any,
    ): AxiosPromise<RoleData> {
      return localVarFp
        .getDataForRole(orgId, projId, envId, roleId, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * return permission assignment data between user sets and resource sets (i.e: condition set rules data)
     * @summary Get Data For Set Rule
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} userSetId
     * @param {string} resourceSetId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getDataForSetRule(
      orgId: string,
      projId: string,
      envId: string,
      userSetId: string,
      resourceSetId: string,
      options?: any,
    ): AxiosPromise<{ [key: string]: Array<string> }> {
      return localVarFp
        .getDataForSetRule(orgId, projId, envId, userSetId, resourceSetId, options)
        .then((request) => request(axios, basePath));
    },
    /**
     *
     * @summary Get Data For User
     * @param {string} orgId Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} userId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getDataForUser(
      orgId: string,
      projId: string,
      envId: string,
      userId: string,
      options?: any,
    ): AxiosPromise<UserData> {
      return localVarFp
        .getDataForUser(orgId, projId, envId, userId, options)
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * Request parameters for getAllData operation in OPALDataApi.
 * @export
 * @interface OPALDataApiGetAllDataRequest
 */
export interface OPALDataApiGetAllDataRequest {
  /**
   * Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetAllData
   */
  readonly orgId: string;

  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetAllData
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetAllData
   */
  readonly envId: string;
}

/**
 * Request parameters for getDataForRole operation in OPALDataApi.
 * @export
 * @interface OPALDataApiGetDataForRoleRequest
 */
export interface OPALDataApiGetDataForRoleRequest {
  /**
   * Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetDataForRole
   */
  readonly orgId: string;

  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetDataForRole
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetDataForRole
   */
  readonly envId: string;

  /**
   *
   * @type {string}
   * @memberof OPALDataApiGetDataForRole
   */
  readonly roleId: string;
}

/**
 * Request parameters for getDataForSetRule operation in OPALDataApi.
 * @export
 * @interface OPALDataApiGetDataForSetRuleRequest
 */
export interface OPALDataApiGetDataForSetRuleRequest {
  /**
   * Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetDataForSetRule
   */
  readonly orgId: string;

  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetDataForSetRule
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetDataForSetRule
   */
  readonly envId: string;

  /**
   *
   * @type {string}
   * @memberof OPALDataApiGetDataForSetRule
   */
  readonly userSetId: string;

  /**
   *
   * @type {string}
   * @memberof OPALDataApiGetDataForSetRule
   */
  readonly resourceSetId: string;
}

/**
 * Request parameters for getDataForUser operation in OPALDataApi.
 * @export
 * @interface OPALDataApiGetDataForUserRequest
 */
export interface OPALDataApiGetDataForUserRequest {
  /**
   * Either the unique id of the organization, or the URL-friendly key of the organization (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetDataForUser
   */
  readonly orgId: string;

  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetDataForUser
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof OPALDataApiGetDataForUser
   */
  readonly envId: string;

  /**
   *
   * @type {string}
   * @memberof OPALDataApiGetDataForUser
   */
  readonly userId: string;
}

/**
 * OPALDataApi - object-oriented interface
 * @export
 * @class OPALDataApi
 * @extends {BaseAPI}
 */
export class OPALDataApi extends BaseAPI {
  /**
   *
   * @summary Get All Data
   * @param {OPALDataApiGetAllDataRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof OPALDataApi
   */
  public getAllData(requestParameters: OPALDataApiGetAllDataRequest, options?: AxiosRequestConfig) {
    return OPALDataApiFp(this.configuration)
      .getAllData(
        requestParameters.orgId,
        requestParameters.projId,
        requestParameters.envId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   *
   * @summary Get Data For Role
   * @param {OPALDataApiGetDataForRoleRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof OPALDataApi
   */
  public getDataForRole(
    requestParameters: OPALDataApiGetDataForRoleRequest,
    options?: AxiosRequestConfig,
  ) {
    return OPALDataApiFp(this.configuration)
      .getDataForRole(
        requestParameters.orgId,
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.roleId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * return permission assignment data between user sets and resource sets (i.e: condition set rules data)
   * @summary Get Data For Set Rule
   * @param {OPALDataApiGetDataForSetRuleRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof OPALDataApi
   */
  public getDataForSetRule(
    requestParameters: OPALDataApiGetDataForSetRuleRequest,
    options?: AxiosRequestConfig,
  ) {
    return OPALDataApiFp(this.configuration)
      .getDataForSetRule(
        requestParameters.orgId,
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.userSetId,
        requestParameters.resourceSetId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   *
   * @summary Get Data For User
   * @param {OPALDataApiGetDataForUserRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof OPALDataApi
   */
  public getDataForUser(
    requestParameters: OPALDataApiGetDataForUserRequest,
    options?: AxiosRequestConfig,
  ) {
    return OPALDataApiFp(this.configuration)
      .getDataForUser(
        requestParameters.orgId,
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.userId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}