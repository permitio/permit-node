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
import { ConditionSetRuleCreate } from '../types';
// @ts-ignore
import { ConditionSetRuleRead } from '../types';
// @ts-ignore
import { ConditionSetRuleRemove } from '../types';
// @ts-ignore
import { HTTPValidationError } from '../types';
/**
 * ConditionSetRulesApi - axios parameter creator
 * @export
 */
export const ConditionSetRulesApiAxiosParamCreator = function (configuration?: Configuration) {
  return {
    /**
     * Grant permissions to a user set *on* a resource set.  If the permission is already granted, it is skipped.
     * @summary Assign Set Permissions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetRuleCreate} conditionSetRuleCreate
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    assignSetPermissions: async (
      projId: string,
      envId: string,
      conditionSetRuleCreate: ConditionSetRuleCreate,
      permitSession?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('assignSetPermissions', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('assignSetPermissions', 'envId', envId);
      // verify required parameter 'conditionSetRuleCreate' is not null or undefined
      assertParamExists('assignSetPermissions', 'conditionSetRuleCreate', conditionSetRuleCreate);
      const localVarPath = `/v2/facts/{proj_id}/{env_id}/set_rules`
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
        conditionSetRuleCreate,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Lists the condition set rules matching the filter. - If the `user_set` filter is present, will only return the permissions set of that user set. - If the `permission` filter is present, will only return the permissions sets that equals to the queried permission. - If the `resource_set` filter is present, will only return the permissions set of that resource set.
     * @summary List Set Permissions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} [userSet] optional user set filter, will only return rules where the permission is granted to this user set
     * @param {string} [permission] optional permission filter, will only return condition set rules granting this permission
     * @param {string} [resourceSet] optional resource set filter, will only return rules where the permission is granted on this resource set
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listSetPermissions: async (
      projId: string,
      envId: string,
      userSet?: string,
      permission?: string,
      resourceSet?: string,
      page?: number,
      perPage?: number,
      permitSession?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('listSetPermissions', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('listSetPermissions', 'envId', envId);
      const localVarPath = `/v2/facts/{proj_id}/{env_id}/set_rules`
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

      if (userSet !== undefined) {
        localVarQueryParameter['user_set'] = userSet;
      }

      if (permission !== undefined) {
        localVarQueryParameter['permission'] = permission;
      }

      if (resourceSet !== undefined) {
        localVarQueryParameter['resource_set'] = resourceSet;
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
     * Revokes permissions to a user set *on* a resource set.  If the permission is not granted, it is skipped.
     * @summary Unassign Set Permissions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetRuleRemove} conditionSetRuleRemove
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    unassignSetPermissions: async (
      projId: string,
      envId: string,
      conditionSetRuleRemove: ConditionSetRuleRemove,
      permitSession?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('unassignSetPermissions', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('unassignSetPermissions', 'envId', envId);
      // verify required parameter 'conditionSetRuleRemove' is not null or undefined
      assertParamExists('unassignSetPermissions', 'conditionSetRuleRemove', conditionSetRuleRemove);
      const localVarPath = `/v2/facts/{proj_id}/{env_id}/set_rules`
        .replace(`{${'proj_id'}}`, encodeURIComponent(String(projId)))
        .replace(`{${'env_id'}}`, encodeURIComponent(String(envId)));
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

      localVarHeaderParameter['Content-Type'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        conditionSetRuleRemove,
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
 * ConditionSetRulesApi - functional programming interface
 * @export
 */
export const ConditionSetRulesApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = ConditionSetRulesApiAxiosParamCreator(configuration);
  return {
    /**
     * Grant permissions to a user set *on* a resource set.  If the permission is already granted, it is skipped.
     * @summary Assign Set Permissions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetRuleCreate} conditionSetRuleCreate
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async assignSetPermissions(
      projId: string,
      envId: string,
      conditionSetRuleCreate: ConditionSetRuleCreate,
      permitSession?: string,
      options?: AxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<Array<ConditionSetRuleRead>>
    > {
      const localVarAxiosArgs = await localVarAxiosParamCreator.assignSetPermissions(
        projId,
        envId,
        conditionSetRuleCreate,
        permitSession,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Lists the condition set rules matching the filter. - If the `user_set` filter is present, will only return the permissions set of that user set. - If the `permission` filter is present, will only return the permissions sets that equals to the queried permission. - If the `resource_set` filter is present, will only return the permissions set of that resource set.
     * @summary List Set Permissions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} [userSet] optional user set filter, will only return rules where the permission is granted to this user set
     * @param {string} [permission] optional permission filter, will only return condition set rules granting this permission
     * @param {string} [resourceSet] optional resource set filter, will only return rules where the permission is granted on this resource set
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async listSetPermissions(
      projId: string,
      envId: string,
      userSet?: string,
      permission?: string,
      resourceSet?: string,
      page?: number,
      perPage?: number,
      permitSession?: string,
      options?: AxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<Array<ConditionSetRuleRead>>
    > {
      const localVarAxiosArgs = await localVarAxiosParamCreator.listSetPermissions(
        projId,
        envId,
        userSet,
        permission,
        resourceSet,
        page,
        perPage,
        permitSession,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Revokes permissions to a user set *on* a resource set.  If the permission is not granted, it is skipped.
     * @summary Unassign Set Permissions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetRuleRemove} conditionSetRuleRemove
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async unassignSetPermissions(
      projId: string,
      envId: string,
      conditionSetRuleRemove: ConditionSetRuleRemove,
      permitSession?: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.unassignSetPermissions(
        projId,
        envId,
        conditionSetRuleRemove,
        permitSession,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
  };
};

/**
 * ConditionSetRulesApi - factory interface
 * @export
 */
export const ConditionSetRulesApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = ConditionSetRulesApiFp(configuration);
  return {
    /**
     * Grant permissions to a user set *on* a resource set.  If the permission is already granted, it is skipped.
     * @summary Assign Set Permissions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetRuleCreate} conditionSetRuleCreate
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    assignSetPermissions(
      projId: string,
      envId: string,
      conditionSetRuleCreate: ConditionSetRuleCreate,
      permitSession?: string,
      options?: any,
    ): AxiosPromise<Array<ConditionSetRuleRead>> {
      return localVarFp
        .assignSetPermissions(projId, envId, conditionSetRuleCreate, permitSession, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Lists the condition set rules matching the filter. - If the `user_set` filter is present, will only return the permissions set of that user set. - If the `permission` filter is present, will only return the permissions sets that equals to the queried permission. - If the `resource_set` filter is present, will only return the permissions set of that resource set.
     * @summary List Set Permissions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} [userSet] optional user set filter, will only return rules where the permission is granted to this user set
     * @param {string} [permission] optional permission filter, will only return condition set rules granting this permission
     * @param {string} [resourceSet] optional resource set filter, will only return rules where the permission is granted on this resource set
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listSetPermissions(
      projId: string,
      envId: string,
      userSet?: string,
      permission?: string,
      resourceSet?: string,
      page?: number,
      perPage?: number,
      permitSession?: string,
      options?: any,
    ): AxiosPromise<Array<ConditionSetRuleRead>> {
      return localVarFp
        .listSetPermissions(
          projId,
          envId,
          userSet,
          permission,
          resourceSet,
          page,
          perPage,
          permitSession,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Revokes permissions to a user set *on* a resource set.  If the permission is not granted, it is skipped.
     * @summary Unassign Set Permissions
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {ConditionSetRuleRemove} conditionSetRuleRemove
     * @param {string} [permitSession]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    unassignSetPermissions(
      projId: string,
      envId: string,
      conditionSetRuleRemove: ConditionSetRuleRemove,
      permitSession?: string,
      options?: any,
    ): AxiosPromise<void> {
      return localVarFp
        .unassignSetPermissions(projId, envId, conditionSetRuleRemove, permitSession, options)
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * Request parameters for assignSetPermissions operation in ConditionSetRulesApi.
 * @export
 * @interface ConditionSetRulesApiAssignSetPermissionsRequest
 */
export interface ConditionSetRulesApiAssignSetPermissionsRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetRulesApiAssignSetPermissions
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetRulesApiAssignSetPermissions
   */
  readonly envId: string;

  /**
   *
   * @type {ConditionSetRuleCreate}
   * @memberof ConditionSetRulesApiAssignSetPermissions
   */
  readonly conditionSetRuleCreate: ConditionSetRuleCreate;

  /**
   *
   * @type {string}
   * @memberof ConditionSetRulesApiAssignSetPermissions
   */
  readonly permitSession?: string;
}

/**
 * Request parameters for listSetPermissions operation in ConditionSetRulesApi.
 * @export
 * @interface ConditionSetRulesApiListSetPermissionsRequest
 */
export interface ConditionSetRulesApiListSetPermissionsRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetRulesApiListSetPermissions
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetRulesApiListSetPermissions
   */
  readonly envId: string;

  /**
   * optional user set filter, will only return rules where the permission is granted to this user set
   * @type {string}
   * @memberof ConditionSetRulesApiListSetPermissions
   */
  readonly userSet?: string;

  /**
   * optional permission filter, will only return condition set rules granting this permission
   * @type {string}
   * @memberof ConditionSetRulesApiListSetPermissions
   */
  readonly permission?: string;

  /**
   * optional resource set filter, will only return rules where the permission is granted on this resource set
   * @type {string}
   * @memberof ConditionSetRulesApiListSetPermissions
   */
  readonly resourceSet?: string;

  /**
   * Page number of the results to fetch, starting at 1.
   * @type {number}
   * @memberof ConditionSetRulesApiListSetPermissions
   */
  readonly page?: number;

  /**
   * The number of results per page (max 100).
   * @type {number}
   * @memberof ConditionSetRulesApiListSetPermissions
   */
  readonly perPage?: number;

  /**
   *
   * @type {string}
   * @memberof ConditionSetRulesApiListSetPermissions
   */
  readonly permitSession?: string;
}

/**
 * Request parameters for unassignSetPermissions operation in ConditionSetRulesApi.
 * @export
 * @interface ConditionSetRulesApiUnassignSetPermissionsRequest
 */
export interface ConditionSetRulesApiUnassignSetPermissionsRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetRulesApiUnassignSetPermissions
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof ConditionSetRulesApiUnassignSetPermissions
   */
  readonly envId: string;

  /**
   *
   * @type {ConditionSetRuleRemove}
   * @memberof ConditionSetRulesApiUnassignSetPermissions
   */
  readonly conditionSetRuleRemove: ConditionSetRuleRemove;

  /**
   *
   * @type {string}
   * @memberof ConditionSetRulesApiUnassignSetPermissions
   */
  readonly permitSession?: string;
}

/**
 * ConditionSetRulesApi - object-oriented interface
 * @export
 * @class ConditionSetRulesApi
 * @extends {BaseAPI}
 */
export class ConditionSetRulesApi extends BaseAPI {
  /**
   * Grant permissions to a user set *on* a resource set.  If the permission is already granted, it is skipped.
   * @summary Assign Set Permissions
   * @param {ConditionSetRulesApiAssignSetPermissionsRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof ConditionSetRulesApi
   */
  public assignSetPermissions(
    requestParameters: ConditionSetRulesApiAssignSetPermissionsRequest,
    options?: AxiosRequestConfig,
  ) {
    return ConditionSetRulesApiFp(this.configuration)
      .assignSetPermissions(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.conditionSetRuleCreate,
        requestParameters.permitSession,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Lists the condition set rules matching the filter. - If the `user_set` filter is present, will only return the permissions set of that user set. - If the `permission` filter is present, will only return the permissions sets that equals to the queried permission. - If the `resource_set` filter is present, will only return the permissions set of that resource set.
   * @summary List Set Permissions
   * @param {ConditionSetRulesApiListSetPermissionsRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof ConditionSetRulesApi
   */
  public listSetPermissions(
    requestParameters: ConditionSetRulesApiListSetPermissionsRequest,
    options?: AxiosRequestConfig,
  ) {
    return ConditionSetRulesApiFp(this.configuration)
      .listSetPermissions(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.userSet,
        requestParameters.permission,
        requestParameters.resourceSet,
        requestParameters.page,
        requestParameters.perPage,
        requestParameters.permitSession,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Revokes permissions to a user set *on* a resource set.  If the permission is not granted, it is skipped.
   * @summary Unassign Set Permissions
   * @param {ConditionSetRulesApiUnassignSetPermissionsRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof ConditionSetRulesApi
   */
  public unassignSetPermissions(
    requestParameters: ConditionSetRulesApiUnassignSetPermissionsRequest,
    options?: AxiosRequestConfig,
  ) {
    return ConditionSetRulesApiFp(this.configuration)
      .unassignSetPermissions(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.conditionSetRuleRemove,
        requestParameters.permitSession,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
