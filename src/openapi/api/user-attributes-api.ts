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
import { ResourceAttributeCreate } from '../types';
// @ts-ignore
import { ResourceAttributeRead } from '../types';
// @ts-ignore
import { ResourceAttributeUpdate } from '../types';
/**
 * UserAttributesApi - axios parameter creator
 * @export
 */
export const UserAttributesApiAxiosParamCreator = function (configuration?: Configuration) {
  return {
    /**
     * Creates a new attribute for the User resource.
     * @summary Create User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ResourceAttributeCreate} resourceAttributeCreate
     * @param {string} [resourceId]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    createUserAttribute: async (
      projId: string,
      envId: string,
      resourceAttributeCreate: ResourceAttributeCreate,
      resourceId?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('createUserAttribute', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('createUserAttribute', 'envId', envId);
      // verify required parameter 'resourceAttributeCreate' is not null or undefined
      assertParamExists('createUserAttribute', 'resourceAttributeCreate', resourceAttributeCreate);
      const localVarPath = `/v2/schema/{proj_id}/{env_id}/users/attributes`
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

      if (resourceId !== undefined) {
        localVarQueryParameter['resource_id'] = resourceId;
      }

      localVarHeaderParameter['Content-Type'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        resourceAttributeCreate,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Deletes the attribute and all its related data.  Note: If the attribute is used by policies, removing it will cause the attribute to evaluate as `undefined`.
     * @summary Delete User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} attributeId Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
     * @param {string} [resourceId]
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    deleteUserAttribute: async (
      projId: string,
      envId: string,
      attributeId: string,
      resourceId?: string,
      page?: number,
      perPage?: number,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('deleteUserAttribute', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('deleteUserAttribute', 'envId', envId);
      // verify required parameter 'attributeId' is not null or undefined
      assertParamExists('deleteUserAttribute', 'attributeId', attributeId);
      const localVarPath = `/v2/schema/{proj_id}/{env_id}/users/attributes/{attribute_id}`
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)))
        .replace(`{${'attribute_id'}}`, encodeURIComponent(String(attributeId)));
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

      if (resourceId !== undefined) {
        localVarQueryParameter['resource_id'] = resourceId;
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
     * Gets a single attribute defined on the User resource, if such attribute exists.
     * @summary Get User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} attributeId Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
     * @param {string} [resourceId]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getUserAttribute: async (
      projId: string,
      envId: string,
      attributeId: string,
      resourceId?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('getUserAttribute', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('getUserAttribute', 'envId', envId);
      // verify required parameter 'attributeId' is not null or undefined
      assertParamExists('getUserAttribute', 'attributeId', attributeId);
      const localVarPath = `/v2/schema/{proj_id}/{env_id}/users/attributes/{attribute_id}`
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)))
        .replace(`{${'attribute_id'}}`, encodeURIComponent(String(attributeId)));
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

      if (resourceId !== undefined) {
        localVarQueryParameter['resource_id'] = resourceId;
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
     * Lists all the attributes defined on the User resource.
     * @summary List User Attributes
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} [resourceId]
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listUserAttributes: async (
      projId: string,
      envId: string,
      resourceId?: string,
      page?: number,
      perPage?: number,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('listUserAttributes', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('listUserAttributes', 'envId', envId);
      const localVarPath = `/v2/schema/{proj_id}/{env_id}/users/attributes`
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

      if (resourceId !== undefined) {
        localVarQueryParameter['resource_id'] = resourceId;
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
     * Partially updates the attribute defined on the User resource. Fields that will be provided will be completely overwritten.
     * @summary Update User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} attributeId Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
     * @param {ResourceAttributeUpdate} resourceAttributeUpdate
     * @param {string} [resourceId]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    updateUserAttribute: async (
      projId: string,
      envId: string,
      attributeId: string,
      resourceAttributeUpdate: ResourceAttributeUpdate,
      resourceId?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('updateUserAttribute', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('updateUserAttribute', 'envId', envId);
      // verify required parameter 'attributeId' is not null or undefined
      assertParamExists('updateUserAttribute', 'attributeId', attributeId);
      // verify required parameter 'resourceAttributeUpdate' is not null or undefined
      assertParamExists('updateUserAttribute', 'resourceAttributeUpdate', resourceAttributeUpdate);
      const localVarPath = `/v2/schema/{proj_id}/{env_id}/users/attributes/{attribute_id}`
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)))
        .replace(`{${'attribute_id'}}`, encodeURIComponent(String(attributeId)));
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

      if (resourceId !== undefined) {
        localVarQueryParameter['resource_id'] = resourceId;
      }

      localVarHeaderParameter['Content-Type'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        resourceAttributeUpdate,
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
 * UserAttributesApi - functional programming interface
 * @export
 */
export const UserAttributesApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = UserAttributesApiAxiosParamCreator(configuration);
  return {
    /**
     * Creates a new attribute for the User resource.
     * @summary Create User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ResourceAttributeCreate} resourceAttributeCreate
     * @param {string} [resourceId]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async createUserAttribute(
      projId: string,
      envId: string,
      resourceAttributeCreate: ResourceAttributeCreate,
      resourceId?: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ResourceAttributeRead>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.createUserAttribute(
        projId,
        envId,
        resourceAttributeCreate,
        resourceId,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Deletes the attribute and all its related data.  Note: If the attribute is used by policies, removing it will cause the attribute to evaluate as `undefined`.
     * @summary Delete User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} attributeId Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
     * @param {string} [resourceId]
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async deleteUserAttribute(
      projId: string,
      envId: string,
      attributeId: string,
      resourceId?: string,
      page?: number,
      perPage?: number,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.deleteUserAttribute(
        projId,
        envId,
        attributeId,
        resourceId,
        page,
        perPage,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Gets a single attribute defined on the User resource, if such attribute exists.
     * @summary Get User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} attributeId Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
     * @param {string} [resourceId]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async getUserAttribute(
      projId: string,
      envId: string,
      attributeId: string,
      resourceId?: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ResourceAttributeRead>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.getUserAttribute(
        projId,
        envId,
        attributeId,
        resourceId,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Lists all the attributes defined on the User resource.
     * @summary List User Attributes
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} [resourceId]
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async listUserAttributes(
      projId: string,
      envId: string,
      resourceId?: string,
      page?: number,
      perPage?: number,
      options?: AxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<Array<ResourceAttributeRead>>
    > {
      const localVarAxiosArgs = await localVarAxiosParamCreator.listUserAttributes(
        projId,
        envId,
        resourceId,
        page,
        perPage,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Partially updates the attribute defined on the User resource. Fields that will be provided will be completely overwritten.
     * @summary Update User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} attributeId Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
     * @param {ResourceAttributeUpdate} resourceAttributeUpdate
     * @param {string} [resourceId]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async updateUserAttribute(
      projId: string,
      envId: string,
      attributeId: string,
      resourceAttributeUpdate: ResourceAttributeUpdate,
      resourceId?: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ResourceAttributeRead>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.updateUserAttribute(
        projId,
        envId,
        attributeId,
        resourceAttributeUpdate,
        resourceId,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
  };
};

/**
 * UserAttributesApi - factory interface
 * @export
 */
export const UserAttributesApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = UserAttributesApiFp(configuration);
  return {
    /**
     * Creates a new attribute for the User resource.
     * @summary Create User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ResourceAttributeCreate} resourceAttributeCreate
     * @param {string} [resourceId]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    createUserAttribute(
      projId: string,
      envId: string,
      resourceAttributeCreate: ResourceAttributeCreate,
      resourceId?: string,
      options?: any,
    ): AxiosPromise<ResourceAttributeRead> {
      return localVarFp
        .createUserAttribute(projId, envId, resourceAttributeCreate, resourceId, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Deletes the attribute and all its related data.  Note: If the attribute is used by policies, removing it will cause the attribute to evaluate as `undefined`.
     * @summary Delete User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} attributeId Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
     * @param {string} [resourceId]
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    deleteUserAttribute(
      projId: string,
      envId: string,
      attributeId: string,
      resourceId?: string,
      page?: number,
      perPage?: number,
      options?: any,
    ): AxiosPromise<void> {
      return localVarFp
        .deleteUserAttribute(projId, envId, attributeId, resourceId, page, perPage, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Gets a single attribute defined on the User resource, if such attribute exists.
     * @summary Get User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} attributeId Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
     * @param {string} [resourceId]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getUserAttribute(
      projId: string,
      envId: string,
      attributeId: string,
      resourceId?: string,
      options?: any,
    ): AxiosPromise<ResourceAttributeRead> {
      return localVarFp
        .getUserAttribute(projId, envId, attributeId, resourceId, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Lists all the attributes defined on the User resource.
     * @summary List User Attributes
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} [resourceId]
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listUserAttributes(
      projId: string,
      envId: string,
      resourceId?: string,
      page?: number,
      perPage?: number,
      options?: any,
    ): AxiosPromise<Array<ResourceAttributeRead>> {
      return localVarFp
        .listUserAttributes(projId, envId, resourceId, page, perPage, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Partially updates the attribute defined on the User resource. Fields that will be provided will be completely overwritten.
     * @summary Update User Attribute
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} attributeId Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
     * @param {ResourceAttributeUpdate} resourceAttributeUpdate
     * @param {string} [resourceId]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    updateUserAttribute(
      projId: string,
      envId: string,
      attributeId: string,
      resourceAttributeUpdate: ResourceAttributeUpdate,
      resourceId?: string,
      options?: any,
    ): AxiosPromise<ResourceAttributeRead> {
      return localVarFp
        .updateUserAttribute(
          projId,
          envId,
          attributeId,
          resourceAttributeUpdate,
          resourceId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * Request parameters for createUserAttribute operation in UserAttributesApi.
 * @export
 * @interface UserAttributesApiCreateUserAttributeRequest
 */
export interface UserAttributesApiCreateUserAttributeRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiCreateUserAttribute
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiCreateUserAttribute
   */
  readonly envId: string;

  /**
   *
   * @type {ResourceAttributeCreate}
   * @memberof UserAttributesApiCreateUserAttribute
   */
  readonly resourceAttributeCreate: ResourceAttributeCreate;

  /**
   *
   * @type {string}
   * @memberof UserAttributesApiCreateUserAttribute
   */
  readonly resourceId?: string;
}

/**
 * Request parameters for deleteUserAttribute operation in UserAttributesApi.
 * @export
 * @interface UserAttributesApiDeleteUserAttributeRequest
 */
export interface UserAttributesApiDeleteUserAttributeRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiDeleteUserAttribute
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiDeleteUserAttribute
   */
  readonly envId: string;

  /**
   * Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiDeleteUserAttribute
   */
  readonly attributeId: string;

  /**
   *
   * @type {string}
   * @memberof UserAttributesApiDeleteUserAttribute
   */
  readonly resourceId?: string;

  /**
   * Page number of the results to fetch, starting at 1.
   * @type {number}
   * @memberof UserAttributesApiDeleteUserAttribute
   */
  readonly page?: number;

  /**
   * The number of results per page (max 100).
   * @type {number}
   * @memberof UserAttributesApiDeleteUserAttribute
   */
  readonly perPage?: number;
}

/**
 * Request parameters for getUserAttribute operation in UserAttributesApi.
 * @export
 * @interface UserAttributesApiGetUserAttributeRequest
 */
export interface UserAttributesApiGetUserAttributeRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiGetUserAttribute
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiGetUserAttribute
   */
  readonly envId: string;

  /**
   * Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiGetUserAttribute
   */
  readonly attributeId: string;

  /**
   *
   * @type {string}
   * @memberof UserAttributesApiGetUserAttribute
   */
  readonly resourceId?: string;
}

/**
 * Request parameters for listUserAttributes operation in UserAttributesApi.
 * @export
 * @interface UserAttributesApiListUserAttributesRequest
 */
export interface UserAttributesApiListUserAttributesRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiListUserAttributes
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiListUserAttributes
   */
  readonly envId: string;

  /**
   *
   * @type {string}
   * @memberof UserAttributesApiListUserAttributes
   */
  readonly resourceId?: string;

  /**
   * Page number of the results to fetch, starting at 1.
   * @type {number}
   * @memberof UserAttributesApiListUserAttributes
   */
  readonly page?: number;

  /**
   * The number of results per page (max 100).
   * @type {number}
   * @memberof UserAttributesApiListUserAttributes
   */
  readonly perPage?: number;
}

/**
 * Request parameters for updateUserAttribute operation in UserAttributesApi.
 * @export
 * @interface UserAttributesApiUpdateUserAttributeRequest
 */
export interface UserAttributesApiUpdateUserAttributeRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiUpdateUserAttribute
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiUpdateUserAttribute
   */
  readonly envId: string;

  /**
   * Either the unique id of the attribute, or the URL-friendly key of the attribute (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof UserAttributesApiUpdateUserAttribute
   */
  readonly attributeId: string;

  /**
   *
   * @type {ResourceAttributeUpdate}
   * @memberof UserAttributesApiUpdateUserAttribute
   */
  readonly resourceAttributeUpdate: ResourceAttributeUpdate;

  /**
   *
   * @type {string}
   * @memberof UserAttributesApiUpdateUserAttribute
   */
  readonly resourceId?: string;
}

/**
 * UserAttributesApi - object-oriented interface
 * @export
 * @class UserAttributesApi
 * @extends {BaseAPI}
 */
export class UserAttributesApi extends BaseAPI {
  /**
   * Creates a new attribute for the User resource.
   * @summary Create User Attribute
   * @param {UserAttributesApiCreateUserAttributeRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof UserAttributesApi
   */
  public createUserAttribute(
    requestParameters: UserAttributesApiCreateUserAttributeRequest,
    options?: AxiosRequestConfig,
  ) {
    return UserAttributesApiFp(this.configuration)
      .createUserAttribute(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.resourceAttributeCreate,
        requestParameters.resourceId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Deletes the attribute and all its related data.  Note: If the attribute is used by policies, removing it will cause the attribute to evaluate as `undefined`.
   * @summary Delete User Attribute
   * @param {UserAttributesApiDeleteUserAttributeRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof UserAttributesApi
   */
  public deleteUserAttribute(
    requestParameters: UserAttributesApiDeleteUserAttributeRequest,
    options?: AxiosRequestConfig,
  ) {
    return UserAttributesApiFp(this.configuration)
      .deleteUserAttribute(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.attributeId,
        requestParameters.resourceId,
        requestParameters.page,
        requestParameters.perPage,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Gets a single attribute defined on the User resource, if such attribute exists.
   * @summary Get User Attribute
   * @param {UserAttributesApiGetUserAttributeRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof UserAttributesApi
   */
  public getUserAttribute(
    requestParameters: UserAttributesApiGetUserAttributeRequest,
    options?: AxiosRequestConfig,
  ) {
    return UserAttributesApiFp(this.configuration)
      .getUserAttribute(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.attributeId,
        requestParameters.resourceId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Lists all the attributes defined on the User resource.
   * @summary List User Attributes
   * @param {UserAttributesApiListUserAttributesRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof UserAttributesApi
   */
  public listUserAttributes(
    requestParameters: UserAttributesApiListUserAttributesRequest,
    options?: AxiosRequestConfig,
  ) {
    return UserAttributesApiFp(this.configuration)
      .listUserAttributes(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.resourceId,
        requestParameters.page,
        requestParameters.perPage,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Partially updates the attribute defined on the User resource. Fields that will be provided will be completely overwritten.
   * @summary Update User Attribute
   * @param {UserAttributesApiUpdateUserAttributeRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof UserAttributesApi
   */
  public updateUserAttribute(
    requestParameters: UserAttributesApiUpdateUserAttributeRequest,
    options?: AxiosRequestConfig,
  ) {
    return UserAttributesApiFp(this.configuration)
      .updateUserAttribute(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.attributeId,
        requestParameters.resourceAttributeUpdate,
        requestParameters.resourceId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
