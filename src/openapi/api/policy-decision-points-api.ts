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
import { DataUpdateReport } from '../types';
// @ts-ignore
import { HTTPValidationError } from '../types';
// @ts-ignore
import { PDPConfigRead } from '../types';
// @ts-ignore
import { PDPStateUpdate } from '../types';
// @ts-ignore
import { RemoteConfig } from '../types';
/**
 * PolicyDecisionPointsApi - axios parameter creator
 * @export
 */
export const PolicyDecisionPointsApiAxiosParamCreator = function (configuration?: Configuration) {
  return {
    /**
     * Gets the configuration values for the currently authenticated PDP container.  The PDP authenticates with an API key scoped to a given Permit.io environment. The system identifies the PDP via its API key and then returns all the configuration values required for the container to run correctly.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
     * @summary Get connected PDP configuration and push state
     * @param {PDPStateUpdate} pDPStateUpdate
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getAuthenticatingPdpConfigValues: async (
      pDPStateUpdate: PDPStateUpdate,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'pDPStateUpdate' is not null or undefined
      assertParamExists('getAuthenticatingPdpConfigValues', 'pDPStateUpdate', pDPStateUpdate);
      const localVarPath = `/v2/pdps/me/config`;
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
        pDPStateUpdate,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Gets the configuration values for the currently authenticated PDP container.  The PDP authenticates with an API key scoped to a given Permit.io environment. The system identifies the PDP via its API key and then returns all the configuration values required for the container to run correctly.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
     * @summary Get connected PDP configuration
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getAuthenticatingPdpConfigValuesLegacy: async (
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v2/pdps/me/config`;
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
     * Gets the configuration values for the PDP container with id `pdp_id`.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
     * @summary Get PDP configuration
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} pdpId The unique id of the pdp
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getPdpConfigValues: async (
      projId: string,
      envId: string,
      pdpId: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('getPdpConfigValues', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('getPdpConfigValues', 'envId', envId);
      // verify required parameter 'pdpId' is not null or undefined
      assertParamExists('getPdpConfigValues', 'pdpId', pdpId);
      const localVarPath = `/v2/pdps/{proj_id}/{env_id}/configs/{pdp_id}/values`
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)))
        .replace(`{${'pdp_id'}}`, encodeURIComponent(String(pdpId)));
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
     * @summary List PDP configurations
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listPdpConfigs: async (
      projId: string,
      envId: string,
      page?: number,
      perPage?: number,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('listPdpConfigs', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('listPdpConfigs', 'envId', envId);
      const localVarPath = `/v2/pdps/{proj_id}/{env_id}/configs`
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
     *
     * @summary Accept a PDP data callback
     * @param {string} xPermitInstanceId
     * @param {DataUpdateReport} dataUpdateReport
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    opalDataCallback: async (
      xPermitInstanceId: string,
      dataUpdateReport: DataUpdateReport,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'xPermitInstanceId' is not null or undefined
      assertParamExists('opalDataCallback', 'xPermitInstanceId', xPermitInstanceId);
      // verify required parameter 'dataUpdateReport' is not null or undefined
      assertParamExists('opalDataCallback', 'dataUpdateReport', dataUpdateReport);
      const localVarPath = `/v2/pdps/me/opal_data_callback`;
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

      if (xPermitInstanceId != null) {
        localVarHeaderParameter['x-permit-instance-id'] = String(xPermitInstanceId);
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
        dataUpdateReport,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Push a PDP state update.
     * @summary Push PDP state
     * @param {PDPStateUpdate} pDPStateUpdate
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    pushPdpState: async (
      pDPStateUpdate: PDPStateUpdate,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'pDPStateUpdate' is not null or undefined
      assertParamExists('pushPdpState', 'pDPStateUpdate', pDPStateUpdate);
      const localVarPath = `/v2/pdps/me/state`;
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
        pDPStateUpdate,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Rotates the API key of the PDP container with id `pdp_id`.  The rotation of the API key revokes the old API key and issues a new API key to the PDP.
     * @summary Rotate PDP API Key
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} pdpId The unique id of the pdp
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    rotatePdpApiKey: async (
      projId: string,
      envId: string,
      pdpId: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('rotatePdpApiKey', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('rotatePdpApiKey', 'envId', envId);
      // verify required parameter 'pdpId' is not null or undefined
      assertParamExists('rotatePdpApiKey', 'pdpId', pdpId);
      const localVarPath = `/v2/pdps/{proj_id}/{env_id}/configs/{pdp_id}/rotate-api-key`
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)))
        .replace(`{${'pdp_id'}}`, encodeURIComponent(String(pdpId)));
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
 * PolicyDecisionPointsApi - functional programming interface
 * @export
 */
export const PolicyDecisionPointsApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = PolicyDecisionPointsApiAxiosParamCreator(configuration);
  return {
    /**
     * Gets the configuration values for the currently authenticated PDP container.  The PDP authenticates with an API key scoped to a given Permit.io environment. The system identifies the PDP via its API key and then returns all the configuration values required for the container to run correctly.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
     * @summary Get connected PDP configuration and push state
     * @param {PDPStateUpdate} pDPStateUpdate
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async getAuthenticatingPdpConfigValues(
      pDPStateUpdate: PDPStateUpdate,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<RemoteConfig>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.getAuthenticatingPdpConfigValues(
        pDPStateUpdate,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Gets the configuration values for the currently authenticated PDP container.  The PDP authenticates with an API key scoped to a given Permit.io environment. The system identifies the PDP via its API key and then returns all the configuration values required for the container to run correctly.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
     * @summary Get connected PDP configuration
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async getAuthenticatingPdpConfigValuesLegacy(
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<RemoteConfig>> {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.getAuthenticatingPdpConfigValuesLegacy(options);
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Gets the configuration values for the PDP container with id `pdp_id`.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
     * @summary Get PDP configuration
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} pdpId The unique id of the pdp
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async getPdpConfigValues(
      projId: string,
      envId: string,
      pdpId: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<RemoteConfig>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.getPdpConfigValues(
        projId,
        envId,
        pdpId,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     *
     * @summary List PDP configurations
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async listPdpConfigs(
      projId: string,
      envId: string,
      page?: number,
      perPage?: number,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<Array<PDPConfigRead>>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.listPdpConfigs(
        projId,
        envId,
        page,
        perPage,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     *
     * @summary Accept a PDP data callback
     * @param {string} xPermitInstanceId
     * @param {DataUpdateReport} dataUpdateReport
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async opalDataCallback(
      xPermitInstanceId: string,
      dataUpdateReport: DataUpdateReport,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.opalDataCallback(
        xPermitInstanceId,
        dataUpdateReport,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Push a PDP state update.
     * @summary Push PDP state
     * @param {PDPStateUpdate} pDPStateUpdate
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async pushPdpState(
      pDPStateUpdate: PDPStateUpdate,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.pushPdpState(
        pDPStateUpdate,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Rotates the API key of the PDP container with id `pdp_id`.  The rotation of the API key revokes the old API key and issues a new API key to the PDP.
     * @summary Rotate PDP API Key
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} pdpId The unique id of the pdp
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async rotatePdpApiKey(
      projId: string,
      envId: string,
      pdpId: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<PDPConfigRead>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.rotatePdpApiKey(
        projId,
        envId,
        pdpId,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
  };
};

/**
 * PolicyDecisionPointsApi - factory interface
 * @export
 */
export const PolicyDecisionPointsApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = PolicyDecisionPointsApiFp(configuration);
  return {
    /**
     * Gets the configuration values for the currently authenticated PDP container.  The PDP authenticates with an API key scoped to a given Permit.io environment. The system identifies the PDP via its API key and then returns all the configuration values required for the container to run correctly.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
     * @summary Get connected PDP configuration and push state
     * @param {PDPStateUpdate} pDPStateUpdate
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getAuthenticatingPdpConfigValues(
      pDPStateUpdate: PDPStateUpdate,
      options?: any,
    ): AxiosPromise<RemoteConfig> {
      return localVarFp
        .getAuthenticatingPdpConfigValues(pDPStateUpdate, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Gets the configuration values for the currently authenticated PDP container.  The PDP authenticates with an API key scoped to a given Permit.io environment. The system identifies the PDP via its API key and then returns all the configuration values required for the container to run correctly.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
     * @summary Get connected PDP configuration
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getAuthenticatingPdpConfigValuesLegacy(options?: any): AxiosPromise<RemoteConfig> {
      return localVarFp
        .getAuthenticatingPdpConfigValuesLegacy(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Gets the configuration values for the PDP container with id `pdp_id`.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
     * @summary Get PDP configuration
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} pdpId The unique id of the pdp
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    getPdpConfigValues(
      projId: string,
      envId: string,
      pdpId: string,
      options?: any,
    ): AxiosPromise<RemoteConfig> {
      return localVarFp
        .getPdpConfigValues(projId, envId, pdpId, options)
        .then((request) => request(axios, basePath));
    },
    /**
     *
     * @summary List PDP configurations
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listPdpConfigs(
      projId: string,
      envId: string,
      page?: number,
      perPage?: number,
      options?: any,
    ): AxiosPromise<Array<PDPConfigRead>> {
      return localVarFp
        .listPdpConfigs(projId, envId, page, perPage, options)
        .then((request) => request(axios, basePath));
    },
    /**
     *
     * @summary Accept a PDP data callback
     * @param {string} xPermitInstanceId
     * @param {DataUpdateReport} dataUpdateReport
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    opalDataCallback(
      xPermitInstanceId: string,
      dataUpdateReport: DataUpdateReport,
      options?: any,
    ): AxiosPromise<void> {
      return localVarFp
        .opalDataCallback(xPermitInstanceId, dataUpdateReport, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Push a PDP state update.
     * @summary Push PDP state
     * @param {PDPStateUpdate} pDPStateUpdate
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    pushPdpState(pDPStateUpdate: PDPStateUpdate, options?: any): AxiosPromise<void> {
      return localVarFp
        .pushPdpState(pDPStateUpdate, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Rotates the API key of the PDP container with id `pdp_id`.  The rotation of the API key revokes the old API key and issues a new API key to the PDP.
     * @summary Rotate PDP API Key
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} pdpId The unique id of the pdp
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    rotatePdpApiKey(
      projId: string,
      envId: string,
      pdpId: string,
      options?: any,
    ): AxiosPromise<PDPConfigRead> {
      return localVarFp
        .rotatePdpApiKey(projId, envId, pdpId, options)
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * Request parameters for getAuthenticatingPdpConfigValues operation in PolicyDecisionPointsApi.
 * @export
 * @interface PolicyDecisionPointsApiGetAuthenticatingPdpConfigValuesRequest
 */
export interface PolicyDecisionPointsApiGetAuthenticatingPdpConfigValuesRequest {
  /**
   *
   * @type {PDPStateUpdate}
   * @memberof PolicyDecisionPointsApiGetAuthenticatingPdpConfigValues
   */
  readonly pDPStateUpdate: PDPStateUpdate;
}

/**
 * Request parameters for getPdpConfigValues operation in PolicyDecisionPointsApi.
 * @export
 * @interface PolicyDecisionPointsApiGetPdpConfigValuesRequest
 */
export interface PolicyDecisionPointsApiGetPdpConfigValuesRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof PolicyDecisionPointsApiGetPdpConfigValues
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof PolicyDecisionPointsApiGetPdpConfigValues
   */
  readonly envId: string;

  /**
   * The unique id of the pdp
   * @type {string}
   * @memberof PolicyDecisionPointsApiGetPdpConfigValues
   */
  readonly pdpId: string;
}

/**
 * Request parameters for listPdpConfigs operation in PolicyDecisionPointsApi.
 * @export
 * @interface PolicyDecisionPointsApiListPdpConfigsRequest
 */
export interface PolicyDecisionPointsApiListPdpConfigsRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof PolicyDecisionPointsApiListPdpConfigs
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof PolicyDecisionPointsApiListPdpConfigs
   */
  readonly envId: string;

  /**
   * Page number of the results to fetch, starting at 1.
   * @type {number}
   * @memberof PolicyDecisionPointsApiListPdpConfigs
   */
  readonly page?: number;

  /**
   * The number of results per page (max 100).
   * @type {number}
   * @memberof PolicyDecisionPointsApiListPdpConfigs
   */
  readonly perPage?: number;
}

/**
 * Request parameters for opalDataCallback operation in PolicyDecisionPointsApi.
 * @export
 * @interface PolicyDecisionPointsApiOpalDataCallbackRequest
 */
export interface PolicyDecisionPointsApiOpalDataCallbackRequest {
  /**
   *
   * @type {string}
   * @memberof PolicyDecisionPointsApiOpalDataCallback
   */
  readonly xPermitInstanceId: string;

  /**
   *
   * @type {DataUpdateReport}
   * @memberof PolicyDecisionPointsApiOpalDataCallback
   */
  readonly dataUpdateReport: DataUpdateReport;
}

/**
 * Request parameters for pushPdpState operation in PolicyDecisionPointsApi.
 * @export
 * @interface PolicyDecisionPointsApiPushPdpStateRequest
 */
export interface PolicyDecisionPointsApiPushPdpStateRequest {
  /**
   *
   * @type {PDPStateUpdate}
   * @memberof PolicyDecisionPointsApiPushPdpState
   */
  readonly pDPStateUpdate: PDPStateUpdate;
}

/**
 * Request parameters for rotatePdpApiKey operation in PolicyDecisionPointsApi.
 * @export
 * @interface PolicyDecisionPointsApiRotatePdpApiKeyRequest
 */
export interface PolicyDecisionPointsApiRotatePdpApiKeyRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof PolicyDecisionPointsApiRotatePdpApiKey
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof PolicyDecisionPointsApiRotatePdpApiKey
   */
  readonly envId: string;

  /**
   * The unique id of the pdp
   * @type {string}
   * @memberof PolicyDecisionPointsApiRotatePdpApiKey
   */
  readonly pdpId: string;
}

/**
 * PolicyDecisionPointsApi - object-oriented interface
 * @export
 * @class PolicyDecisionPointsApi
 * @extends {BaseAPI}
 */
export class PolicyDecisionPointsApi extends BaseAPI {
  /**
   * Gets the configuration values for the currently authenticated PDP container.  The PDP authenticates with an API key scoped to a given Permit.io environment. The system identifies the PDP via its API key and then returns all the configuration values required for the container to run correctly.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
   * @summary Get connected PDP configuration and push state
   * @param {PolicyDecisionPointsApiGetAuthenticatingPdpConfigValuesRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof PolicyDecisionPointsApi
   */
  public getAuthenticatingPdpConfigValues(
    requestParameters: PolicyDecisionPointsApiGetAuthenticatingPdpConfigValuesRequest,
    options?: AxiosRequestConfig,
  ) {
    return PolicyDecisionPointsApiFp(this.configuration)
      .getAuthenticatingPdpConfigValues(requestParameters.pDPStateUpdate, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Gets the configuration values for the currently authenticated PDP container.  The PDP authenticates with an API key scoped to a given Permit.io environment. The system identifies the PDP via its API key and then returns all the configuration values required for the container to run correctly.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
   * @summary Get connected PDP configuration
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof PolicyDecisionPointsApi
   */
  public getAuthenticatingPdpConfigValuesLegacy(options?: AxiosRequestConfig) {
    return PolicyDecisionPointsApiFp(this.configuration)
      .getAuthenticatingPdpConfigValuesLegacy(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Gets the configuration values for the PDP container with id `pdp_id`.  The config values returned are considered \"overrides\", meaning they are overriding any default values given to the container by the user.
   * @summary Get PDP configuration
   * @param {PolicyDecisionPointsApiGetPdpConfigValuesRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof PolicyDecisionPointsApi
   */
  public getPdpConfigValues(
    requestParameters: PolicyDecisionPointsApiGetPdpConfigValuesRequest,
    options?: AxiosRequestConfig,
  ) {
    return PolicyDecisionPointsApiFp(this.configuration)
      .getPdpConfigValues(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.pdpId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   *
   * @summary List PDP configurations
   * @param {PolicyDecisionPointsApiListPdpConfigsRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof PolicyDecisionPointsApi
   */
  public listPdpConfigs(
    requestParameters: PolicyDecisionPointsApiListPdpConfigsRequest,
    options?: AxiosRequestConfig,
  ) {
    return PolicyDecisionPointsApiFp(this.configuration)
      .listPdpConfigs(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.page,
        requestParameters.perPage,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   *
   * @summary Accept a PDP data callback
   * @param {PolicyDecisionPointsApiOpalDataCallbackRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof PolicyDecisionPointsApi
   */
  public opalDataCallback(
    requestParameters: PolicyDecisionPointsApiOpalDataCallbackRequest,
    options?: AxiosRequestConfig,
  ) {
    return PolicyDecisionPointsApiFp(this.configuration)
      .opalDataCallback(
        requestParameters.xPermitInstanceId,
        requestParameters.dataUpdateReport,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Push a PDP state update.
   * @summary Push PDP state
   * @param {PolicyDecisionPointsApiPushPdpStateRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof PolicyDecisionPointsApi
   */
  public pushPdpState(
    requestParameters: PolicyDecisionPointsApiPushPdpStateRequest,
    options?: AxiosRequestConfig,
  ) {
    return PolicyDecisionPointsApiFp(this.configuration)
      .pushPdpState(requestParameters.pDPStateUpdate, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Rotates the API key of the PDP container with id `pdp_id`.  The rotation of the API key revokes the old API key and issues a new API key to the PDP.
   * @summary Rotate PDP API Key
   * @param {PolicyDecisionPointsApiRotatePdpApiKeyRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof PolicyDecisionPointsApi
   */
  public rotatePdpApiKey(
    requestParameters: PolicyDecisionPointsApiRotatePdpApiKeyRequest,
    options?: AxiosRequestConfig,
  ) {
    return PolicyDecisionPointsApiFp(this.configuration)
      .rotatePdpApiKey(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.pdpId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
