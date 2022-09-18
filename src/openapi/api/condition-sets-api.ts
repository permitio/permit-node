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
import { ConditionSetCreate } from '../types';
// @ts-ignore
import { ConditionSetRead } from '../types';
// @ts-ignore
import { ConditionSetType } from '../types';
// @ts-ignore
import { ConditionSetUpdate } from '../types';
// @ts-ignore
import { HTTPValidationError } from '../types';
/**
 * ConditionSetsApi - axios parameter creator
 * @export
 */
export const ConditionSetsApiAxiosParamCreator = function (configuration?: Configuration) {
  return {
    /**
     * Creates a new condition set (can be either a user set or a resource set).
     * @summary Create Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetCreate} conditionSetCreate
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    createConditionSet: async (
      projId: string,
      envId: string,
      conditionSetCreate: ConditionSetCreate,
      permitSession?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('createConditionSet', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('createConditionSet', 'envId', envId);
      // verify required parameter 'conditionSetCreate' is not null or undefined
      assertParamExists('createConditionSet', 'conditionSetCreate', conditionSetCreate);
      const localVarPath = `/v2/schema/{proj_id}/{env_id}/condition_sets`
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)));
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication HTTPBearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      localVarHeaderParameter['Content-Type'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        conditionSetCreate,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Deletes a condition set and all its related data. This includes any permissions granted to said condition set (i.e: any matching condition set rules).
     * @summary Delete Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} conditionSetId Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    deleteConditionSet: async (
      projId: string,
      envId: string,
      conditionSetId: string,
      permitSession?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('deleteConditionSet', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('deleteConditionSet', 'envId', envId);
      // verify required parameter 'conditionSetId' is not null or undefined
      assertParamExists('deleteConditionSet', 'conditionSetId', conditionSetId);
      const localVarPath = `/v2/schema/{proj_id}/{env_id}/condition_sets/{condition_set_id}`
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)))
        .replace(`{${'condition_set_id'}}`, encodeURIComponent(String(conditionSetId)));
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = { method: 'DELETE', ...baseOptions, ...options };
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
     * Gets a single condition set, if such condition set exists.
     * @summary Get Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} conditionSetId Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getConditionSet: async (
      projId: string,
      envId: string,
      conditionSetId: string,
      permitSession?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('getConditionSet', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('getConditionSet', 'envId', envId);
      // verify required parameter 'conditionSetId' is not null or undefined
      assertParamExists('getConditionSet', 'conditionSetId', conditionSetId);
      const localVarPath = `/v2/schema/{proj_id}/{env_id}/condition_sets/{condition_set_id}`
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)))
        .replace(`{${'condition_set_id'}}`, encodeURIComponent(String(conditionSetId)));
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
     * Lists all condition sets matching a filter.
     * @summary List Condition Sets
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetType} [type] if provided, will return only the condition sets of the specified type. e.g: only user sets.
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listConditionSets: async (
      projId: string,
      envId: string,
      type?: ConditionSetType,
      page?: number,
      perPage?: number,
      permitSession?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('listConditionSets', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('listConditionSets', 'envId', envId);
      const localVarPath = `/v2/schema/{proj_id}/{env_id}/condition_sets`
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

      if (type !== undefined) {
        localVarQueryParameter['type'] = type;
      }

      if (page !== undefined) {
        localVarQueryParameter['page'] = page;
      }

      if (perPage !== undefined) {
        localVarQueryParameter['per_page'] = perPage;
      }

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
     * Partially updates a condition set. Fields that will be provided will be completely overwritten.
     * @summary Update Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} conditionSetId Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetUpdate} conditionSetUpdate
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    updateConditionSet: async (
      projId: string,
      envId: string,
      conditionSetId: string,
      conditionSetUpdate: ConditionSetUpdate,
      permitSession?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('updateConditionSet', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('updateConditionSet', 'envId', envId);
      // verify required parameter 'conditionSetId' is not null or undefined
      assertParamExists('updateConditionSet', 'conditionSetId', conditionSetId);
      // verify required parameter 'conditionSetUpdate' is not null or undefined
      assertParamExists('updateConditionSet', 'conditionSetUpdate', conditionSetUpdate);
      const localVarPath = `/v2/schema/{proj_id}/{env_id}/condition_sets/{condition_set_id}`
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)))
        .replace(`{${'condition_set_id'}}`, encodeURIComponent(String(conditionSetId)));
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = { method: 'PATCH', ...baseOptions, ...options };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication HTTPBearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      localVarHeaderParameter['Content-Type'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        conditionSetUpdate,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
  };
};

/**
 * ConditionSetsApi - functional programming interface
 * @export
 */
export const ConditionSetsApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = ConditionSetsApiAxiosParamCreator(configuration);
  return {
    /**
     * Creates a new condition set (can be either a user set or a resource set).
     * @summary Create Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetCreate} conditionSetCreate
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async createConditionSet(
      projId: string,
      envId: string,
      conditionSetCreate: ConditionSetCreate,
      permitSession?: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ConditionSetRead>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.createConditionSet(
        projId,
        envId,
        conditionSetCreate,
        permitSession,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Deletes a condition set and all its related data. This includes any permissions granted to said condition set (i.e: any matching condition set rules).
     * @summary Delete Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} conditionSetId Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async deleteConditionSet(
      projId: string,
      envId: string,
      conditionSetId: string,
      permitSession?: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.deleteConditionSet(
        projId,
        envId,
        conditionSetId,
        permitSession,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Gets a single condition set, if such condition set exists.
     * @summary Get Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} conditionSetId Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async getConditionSet(
      projId: string,
      envId: string,
      conditionSetId: string,
      permitSession?: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ConditionSetRead>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.getConditionSet(
        projId,
        envId,
        conditionSetId,
        permitSession,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Lists all condition sets matching a filter.
     * @summary List Condition Sets
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetType} [type] if provided, will return only the condition sets of the specified type. e.g: only user sets.
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async listConditionSets(
      projId: string,
      envId: string,
      type?: ConditionSetType,
      page?: number,
      perPage?: number,
      permitSession?: string,
      options?: AxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<Array<ConditionSetRead>>
    > {
      const localVarAxiosArgs = await localVarAxiosParamCreator.listConditionSets(
        projId,
        envId,
        type,
        page,
        perPage,
        permitSession,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Partially updates a condition set. Fields that will be provided will be completely overwritten.
     * @summary Update Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} conditionSetId Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetUpdate} conditionSetUpdate
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async updateConditionSet(
      projId: string,
      envId: string,
      conditionSetId: string,
      conditionSetUpdate: ConditionSetUpdate,
      permitSession?: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ConditionSetRead>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.updateConditionSet(
        projId,
        envId,
        conditionSetId,
        conditionSetUpdate,
        permitSession,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
  };
};

/**
 * ConditionSetsApi - factory interface
 * @export
 */
export const ConditionSetsApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = ConditionSetsApiFp(configuration);
  return {
    /**
     * Creates a new condition set (can be either a user set or a resource set).
     * @summary Create Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetCreate} conditionSetCreate
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    createConditionSet(
      projId: string,
      envId: string,
      conditionSetCreate: ConditionSetCreate,
      permitSession?: string,
      options?: any,
    ): AxiosPromise<ConditionSetRead> {
      return localVarFp
        .createConditionSet(projId, envId, conditionSetCreate, permitSession, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Deletes a condition set and all its related data. This includes any permissions granted to said condition set (i.e: any matching condition set rules).
     * @summary Delete Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} conditionSetId Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    deleteConditionSet(
      projId: string,
      envId: string,
      conditionSetId: string,
      permitSession?: string,
      options?: any,
    ): AxiosPromise<void> {
      return localVarFp
        .deleteConditionSet(projId, envId, conditionSetId, permitSession, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Gets a single condition set, if such condition set exists.
     * @summary Get Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} conditionSetId Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getConditionSet(
      projId: string,
      envId: string,
      conditionSetId: string,
      permitSession?: string,
      options?: any,
    ): AxiosPromise<ConditionSetRead> {
      return localVarFp
        .getConditionSet(projId, envId, conditionSetId, permitSession, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Lists all condition sets matching a filter.
     * @summary List Condition Sets
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetType} [type] if provided, will return only the condition sets of the specified type. e.g: only user sets.
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listConditionSets(
      projId: string,
      envId: string,
      type?: ConditionSetType,
      page?: number,
      perPage?: number,
      permitSession?: string,
      options?: any,
    ): AxiosPromise<Array<ConditionSetRead>> {
      return localVarFp
        .listConditionSets(projId, envId, type, page, perPage, permitSession, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Partially updates a condition set. Fields that will be provided will be completely overwritten.
     * @summary Update Condition Set
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} conditionSetId Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetUpdate} conditionSetUpdate
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    updateConditionSet(
      projId: string,
      envId: string,
      conditionSetId: string,
      conditionSetUpdate: ConditionSetUpdate,
      permitSession?: string,
      options?: any,
    ): AxiosPromise<ConditionSetRead> {
      return localVarFp
        .updateConditionSet(
          projId,
          envId,
          conditionSetId,
          conditionSetUpdate,
          permitSession,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * Request parameters for createConditionSet operation in ConditionSetsApi.
 * @export
 * @interface ConditionSetsApiCreateConditionSetRequest
 */
export interface ConditionSetsApiCreateConditionSetRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiCreateConditionSet
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiCreateConditionSet
   */
  readonly envId: string;

  /**
   *
   * @type {ConditionSetCreate}
   * @memberof ConditionSetsApiCreateConditionSet
   */
  readonly conditionSetCreate: ConditionSetCreate;

  /**
   *
   * @type {string}
   * @memberof ConditionSetsApiCreateConditionSet
   */
  readonly permitSession?: string;
}

/**
 * Request parameters for deleteConditionSet operation in ConditionSetsApi.
 * @export
 * @interface ConditionSetsApiDeleteConditionSetRequest
 */
export interface ConditionSetsApiDeleteConditionSetRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiDeleteConditionSet
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiDeleteConditionSet
   */
  readonly envId: string;

  /**
   * Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiDeleteConditionSet
   */
  readonly conditionSetId: string;

  /**
   *
   * @type {string}
   * @memberof ConditionSetsApiDeleteConditionSet
   */
  readonly permitSession?: string;
}

/**
 * Request parameters for getConditionSet operation in ConditionSetsApi.
 * @export
 * @interface ConditionSetsApiGetConditionSetRequest
 */
export interface ConditionSetsApiGetConditionSetRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiGetConditionSet
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiGetConditionSet
   */
  readonly envId: string;

  /**
   * Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiGetConditionSet
   */
  readonly conditionSetId: string;

  /**
   *
   * @type {string}
   * @memberof ConditionSetsApiGetConditionSet
   */
  readonly permitSession?: string;
}

/**
 * Request parameters for listConditionSets operation in ConditionSetsApi.
 * @export
 * @interface ConditionSetsApiListConditionSetsRequest
 */
export interface ConditionSetsApiListConditionSetsRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiListConditionSets
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiListConditionSets
   */
  readonly envId: string;

  /**
   * if provided, will return only the condition sets of the specified type. e.g: only user sets.
   * @type {ConditionSetType}
   * @memberof ConditionSetsApiListConditionSets
   */
  readonly type?: ConditionSetType;

  /**
   * Page number of the results to fetch, starting at 1.
   * @type {number}
   * @memberof ConditionSetsApiListConditionSets
   */
  readonly page?: number;

  /**
   * The number of results per page (max 100).
   * @type {number}
   * @memberof ConditionSetsApiListConditionSets
   */
  readonly perPage?: number;

  /**
   *
   * @type {string}
   * @memberof ConditionSetsApiListConditionSets
   */
  readonly permitSession?: string;
}

/**
 * Request parameters for updateConditionSet operation in ConditionSetsApi.
 * @export
 * @interface ConditionSetsApiUpdateConditionSetRequest
 */
export interface ConditionSetsApiUpdateConditionSetRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiUpdateConditionSet
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiUpdateConditionSet
   */
  readonly envId: string;

  /**
   * Either the unique id of the condition set, or the URL-friendly key of the condition set (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetsApiUpdateConditionSet
   */
  readonly conditionSetId: string;

  /**
   *
   * @type {ConditionSetUpdate}
   * @memberof ConditionSetsApiUpdateConditionSet
   */
  readonly conditionSetUpdate: ConditionSetUpdate;

  /**
   *
   * @type {string}
   * @memberof ConditionSetsApiUpdateConditionSet
   */
  readonly permitSession?: string;
}

/**
 * ConditionSetsApi - object-oriented interface
 * @export
 * @class ConditionSetsApi
 * @extends {BaseAPI}
 */
export class ConditionSetsApi extends BaseAPI {
  /**
   * Creates a new condition set (can be either a user set or a resource set).
   * @summary Create Condition Set
   * @param {ConditionSetsApiCreateConditionSetRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof ConditionSetsApi
   */
  public createConditionSet(
    requestParameters: ConditionSetsApiCreateConditionSetRequest,
    options?: AxiosRequestConfig,
  ) {
    return ConditionSetsApiFp(this.configuration)
      .createConditionSet(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.conditionSetCreate,
        requestParameters.permitSession,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Deletes a condition set and all its related data. This includes any permissions granted to said condition set (i.e: any matching condition set rules).
   * @summary Delete Condition Set
   * @param {ConditionSetsApiDeleteConditionSetRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof ConditionSetsApi
   */
  public deleteConditionSet(
    requestParameters: ConditionSetsApiDeleteConditionSetRequest,
    options?: AxiosRequestConfig,
  ) {
    return ConditionSetsApiFp(this.configuration)
      .deleteConditionSet(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.conditionSetId,
        requestParameters.permitSession,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Gets a single condition set, if such condition set exists.
   * @summary Get Condition Set
   * @param {ConditionSetsApiGetConditionSetRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof ConditionSetsApi
   */
  public getConditionSet(
    requestParameters: ConditionSetsApiGetConditionSetRequest,
    options?: AxiosRequestConfig,
  ) {
    return ConditionSetsApiFp(this.configuration)
      .getConditionSet(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.conditionSetId,
        requestParameters.permitSession,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Lists all condition sets matching a filter.
   * @summary List Condition Sets
   * @param {ConditionSetsApiListConditionSetsRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof ConditionSetsApi
   */
  public listConditionSets(
    requestParameters: ConditionSetsApiListConditionSetsRequest,
    options?: AxiosRequestConfig,
  ) {
    return ConditionSetsApiFp(this.configuration)
      .listConditionSets(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.type,
        requestParameters.page,
        requestParameters.perPage,
        requestParameters.permitSession,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Partially updates a condition set. Fields that will be provided will be completely overwritten.
   * @summary Update Condition Set
   * @param {ConditionSetsApiUpdateConditionSetRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof ConditionSetsApi
   */
  public updateConditionSet(
    requestParameters: ConditionSetsApiUpdateConditionSetRequest,
    options?: AxiosRequestConfig,
  ) {
    return ConditionSetsApiFp(this.configuration)
      .updateConditionSet(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.conditionSetId,
        requestParameters.conditionSetUpdate,
        requestParameters.permitSession,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
