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
import { AuthnMeRead } from '../types';
// @ts-ignore
import { DevLogin } from '../types';
// @ts-ignore
import { EmbeddedLoginRequestOutput } from '../types';
// @ts-ignore
import { HTTPValidationError } from '../types';
// @ts-ignore
import { LoginResult } from '../types';
// @ts-ignore
import { UserFELoginRequestInput } from '../types';
// @ts-ignore
import { UserLoginRequestInput } from '../types';
/**
 * AuthenticationApi - axios parameter creator
 * @export
 */
export const AuthenticationApiAxiosParamCreator = function (configuration?: Configuration) {
  return {
    /**
     * The dev-login endpoints allows a developer inside permit.io to log in with an email address.  THIS IS ONLY AVAILABLE IN DEV MODE.
     * @summary (DEV MODE) Login
     * @param {DevLogin} devLogin
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    devLogin: async (
      devLogin: DevLogin,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'devLogin' is not null or undefined
      assertParamExists('devLogin', 'devLogin', devLogin);
      const localVarPath = `/v2/auth/devlogin`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      localVarHeaderParameter['Content-Type'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        devLogin,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     *
     * @summary Elements Fe Login As
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {UserFELoginRequestInput} userFELoginRequestInput
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    elementsFeLoginAs: async (
      envId: string,
      userFELoginRequestInput: UserFELoginRequestInput,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('elementsFeLoginAs', 'envId', envId);
      // verify required parameter 'userFELoginRequestInput' is not null or undefined
      assertParamExists('elementsFeLoginAs', 'userFELoginRequestInput', userFELoginRequestInput);
      const localVarPath = `/v2/auth/{env_id}/elements_fe_login_as`.replace(
        `{${'env_id'}}`,
        encodeURIComponent(String(envId)),
      );
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      localVarHeaderParameter['Content-Type'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        userFELoginRequestInput,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     *
     * @summary Elements Login As
     * @param {UserLoginRequestInput} userLoginRequestInput
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    elementsLoginAs: async (
      userLoginRequestInput: UserLoginRequestInput,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'userLoginRequestInput' is not null or undefined
      assertParamExists('elementsLoginAs', 'userLoginRequestInput', userLoginRequestInput);
      const localVarPath = `/v2/auth/elements_login_as`;
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
        userLoginRequestInput,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * The login endpoint allows the frontend app to exchange a user JWT with a user session. The user session is stored on an httpOnly + secure cookie.
     * @summary Login
     * @param {string} [inviteCode] An optional invite code to an existing organization. If the invite code is provided and is valid, the member will gain access to that organization.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    login: async (inviteCode?: string, options: AxiosRequestConfig = {}): Promise<RequestArgs> => {
      const localVarPath = `/v2/auth/login`;
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

      if (inviteCode !== undefined) {
        localVarQueryParameter['invite_code'] = inviteCode;
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
     * The login endpoint allows the frontend app to exchange a user JWT with a user session. The user session is stored on an httpOnly + secure cookie.
     * @summary Login Elements
     * @param {string} token
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    loginElements: async (
      token: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'token' is not null or undefined
      assertParamExists('loginElements', 'token', token);
      const localVarPath = `/v2/auth/login_elements`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = { method: 'GET', ...baseOptions, ...options };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      if (token !== undefined) {
        localVarQueryParameter['token'] = token;
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
     * The logout endpoint deletes the session cookie of a logged in user and invalidates cached VCs.
     * @summary Logout Get
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    logoutGet: async (options: AxiosRequestConfig = {}): Promise<RequestArgs> => {
      const localVarPath = `/v2/auth/logout`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = { method: 'GET', ...baseOptions, ...options };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

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
     * The logout endpoint deletes the session cookie of a logged in user and invalidates cached VCs.
     * @summary Logout Post
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    logoutPost: async (options: AxiosRequestConfig = {}): Promise<RequestArgs> => {
      const localVarPath = `/v2/auth/logout`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

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
     * @summary Me
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    me: async (options: AxiosRequestConfig = {}): Promise<RequestArgs> => {
      const localVarPath = `/v2/auth/me`;
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
     * Allows the user to switch his active organization (manipulates the user\'s login session).  This route will return a new login cookie to the user.
     * @summary Switch Organization
     * @param {string} orgId the organization id the user wishes to switch to as the active org on the session
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    switchOrganization: async (
      orgId: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'orgId' is not null or undefined
      assertParamExists('switchOrganization', 'orgId', orgId);
      const localVarPath = `/v2/auth/switch_org/{org_id}`.replace(
        `{${'org_id'}}`,
        encodeURIComponent(String(orgId)),
      );
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

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
 * AuthenticationApi - functional programming interface
 * @export
 */
export const AuthenticationApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = AuthenticationApiAxiosParamCreator(configuration);
  return {
    /**
     * The dev-login endpoints allows a developer inside permit.io to log in with an email address.  THIS IS ONLY AVAILABLE IN DEV MODE.
     * @summary (DEV MODE) Login
     * @param {DevLogin} devLogin
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async devLogin(
      devLogin: DevLogin,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.devLogin(devLogin, options);
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     *
     * @summary Elements Fe Login As
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {UserFELoginRequestInput} userFELoginRequestInput
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async elementsFeLoginAs(
      envId: string,
      userFELoginRequestInput: UserFELoginRequestInput,
      options?: AxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<EmbeddedLoginRequestOutput>
    > {
      const localVarAxiosArgs = await localVarAxiosParamCreator.elementsFeLoginAs(
        envId,
        userFELoginRequestInput,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     *
     * @summary Elements Login As
     * @param {UserLoginRequestInput} userLoginRequestInput
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async elementsLoginAs(
      userLoginRequestInput: UserLoginRequestInput,
      options?: AxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<EmbeddedLoginRequestOutput>
    > {
      const localVarAxiosArgs = await localVarAxiosParamCreator.elementsLoginAs(
        userLoginRequestInput,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * The login endpoint allows the frontend app to exchange a user JWT with a user session. The user session is stored on an httpOnly + secure cookie.
     * @summary Login
     * @param {string} [inviteCode] An optional invite code to an existing organization. If the invite code is provided and is valid, the member will gain access to that organization.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async login(
      inviteCode?: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<LoginResult>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.login(inviteCode, options);
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * The login endpoint allows the frontend app to exchange a user JWT with a user session. The user session is stored on an httpOnly + secure cookie.
     * @summary Login Elements
     * @param {string} token
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async loginElements(
      token: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<LoginResult>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.loginElements(token, options);
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * The logout endpoint deletes the session cookie of a logged in user and invalidates cached VCs.
     * @summary Logout Get
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async logoutGet(
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.logoutGet(options);
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * The logout endpoint deletes the session cookie of a logged in user and invalidates cached VCs.
     * @summary Logout Post
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async logoutPost(
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.logoutPost(options);
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     *
     * @summary Me
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async me(
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<AuthnMeRead>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.me(options);
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Allows the user to switch his active organization (manipulates the user\'s login session).  This route will return a new login cookie to the user.
     * @summary Switch Organization
     * @param {string} orgId the organization id the user wishes to switch to as the active org on the session
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async switchOrganization(
      orgId: string,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<LoginResult>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.switchOrganization(orgId, options);
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
  };
};

/**
 * AuthenticationApi - factory interface
 * @export
 */
export const AuthenticationApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = AuthenticationApiFp(configuration);
  return {
    /**
     * The dev-login endpoints allows a developer inside permit.io to log in with an email address.  THIS IS ONLY AVAILABLE IN DEV MODE.
     * @summary (DEV MODE) Login
     * @param {DevLogin} devLogin
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    devLogin(devLogin: DevLogin, options?: any): AxiosPromise<void> {
      return localVarFp.devLogin(devLogin, options).then((request) => request(axios, basePath));
    },
    /**
     *
     * @summary Elements Fe Login As
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {UserFELoginRequestInput} userFELoginRequestInput
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    elementsFeLoginAs(
      envId: string,
      userFELoginRequestInput: UserFELoginRequestInput,
      options?: any,
    ): AxiosPromise<EmbeddedLoginRequestOutput> {
      return localVarFp
        .elementsFeLoginAs(envId, userFELoginRequestInput, options)
        .then((request) => request(axios, basePath));
    },
    /**
     *
     * @summary Elements Login As
     * @param {UserLoginRequestInput} userLoginRequestInput
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    elementsLoginAs(
      userLoginRequestInput: UserLoginRequestInput,
      options?: any,
    ): AxiosPromise<EmbeddedLoginRequestOutput> {
      return localVarFp
        .elementsLoginAs(userLoginRequestInput, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * The login endpoint allows the frontend app to exchange a user JWT with a user session. The user session is stored on an httpOnly + secure cookie.
     * @summary Login
     * @param {string} [inviteCode] An optional invite code to an existing organization. If the invite code is provided and is valid, the member will gain access to that organization.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    login(inviteCode?: string, options?: any): AxiosPromise<LoginResult> {
      return localVarFp.login(inviteCode, options).then((request) => request(axios, basePath));
    },
    /**
     * The login endpoint allows the frontend app to exchange a user JWT with a user session. The user session is stored on an httpOnly + secure cookie.
     * @summary Login Elements
     * @param {string} token
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    loginElements(token: string, options?: any): AxiosPromise<LoginResult> {
      return localVarFp.loginElements(token, options).then((request) => request(axios, basePath));
    },
    /**
     * The logout endpoint deletes the session cookie of a logged in user and invalidates cached VCs.
     * @summary Logout Get
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    logoutGet(options?: any): AxiosPromise<void> {
      return localVarFp.logoutGet(options).then((request) => request(axios, basePath));
    },
    /**
     * The logout endpoint deletes the session cookie of a logged in user and invalidates cached VCs.
     * @summary Logout Post
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    logoutPost(options?: any): AxiosPromise<void> {
      return localVarFp.logoutPost(options).then((request) => request(axios, basePath));
    },
    /**
     *
     * @summary Me
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    me(options?: any): AxiosPromise<AuthnMeRead> {
      return localVarFp.me(options).then((request) => request(axios, basePath));
    },
    /**
     * Allows the user to switch his active organization (manipulates the user\'s login session).  This route will return a new login cookie to the user.
     * @summary Switch Organization
     * @param {string} orgId the organization id the user wishes to switch to as the active org on the session
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    switchOrganization(orgId: string, options?: any): AxiosPromise<LoginResult> {
      return localVarFp
        .switchOrganization(orgId, options)
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * Request parameters for devLogin operation in AuthenticationApi.
 * @export
 * @interface AuthenticationApiDevLoginRequest
 */
export interface AuthenticationApiDevLoginRequest {
  /**
   *
   * @type {DevLogin}
   * @memberof AuthenticationApiDevLogin
   */
  readonly devLogin: DevLogin;
}

/**
 * Request parameters for elementsFeLoginAs operation in AuthenticationApi.
 * @export
 * @interface AuthenticationApiElementsFeLoginAsRequest
 */
export interface AuthenticationApiElementsFeLoginAsRequest {
  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof AuthenticationApiElementsFeLoginAs
   */
  readonly envId: string;

  /**
   *
   * @type {UserFELoginRequestInput}
   * @memberof AuthenticationApiElementsFeLoginAs
   */
  readonly userFELoginRequestInput: UserFELoginRequestInput;
}

/**
 * Request parameters for elementsLoginAs operation in AuthenticationApi.
 * @export
 * @interface AuthenticationApiElementsLoginAsRequest
 */
export interface AuthenticationApiElementsLoginAsRequest {
  /**
   *
   * @type {UserLoginRequestInput}
   * @memberof AuthenticationApiElementsLoginAs
   */
  readonly userLoginRequestInput: UserLoginRequestInput;
}

/**
 * Request parameters for login operation in AuthenticationApi.
 * @export
 * @interface AuthenticationApiLoginRequest
 */
export interface AuthenticationApiLoginRequest {
  /**
   * An optional invite code to an existing organization. If the invite code is provided and is valid, the member will gain access to that organization.
   * @type {string}
   * @memberof AuthenticationApiLogin
   */
  readonly inviteCode?: string;
}

/**
 * Request parameters for loginElements operation in AuthenticationApi.
 * @export
 * @interface AuthenticationApiLoginElementsRequest
 */
export interface AuthenticationApiLoginElementsRequest {
  /**
   *
   * @type {string}
   * @memberof AuthenticationApiLoginElements
   */
  readonly token: string;
}

/**
 * Request parameters for switchOrganization operation in AuthenticationApi.
 * @export
 * @interface AuthenticationApiSwitchOrganizationRequest
 */
export interface AuthenticationApiSwitchOrganizationRequest {
  /**
   * the organization id the user wishes to switch to as the active org on the session
   * @type {string}
   * @memberof AuthenticationApiSwitchOrganization
   */
  readonly orgId: string;
}

/**
 * AuthenticationApi - object-oriented interface
 * @export
 * @class AuthenticationApi
 * @extends {BaseAPI}
 */
export class AuthenticationApi extends BaseAPI {
  /**
   * The dev-login endpoints allows a developer inside permit.io to log in with an email address.  THIS IS ONLY AVAILABLE IN DEV MODE.
   * @summary (DEV MODE) Login
   * @param {AuthenticationApiDevLoginRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof AuthenticationApi
   */
  public devLogin(
    requestParameters: AuthenticationApiDevLoginRequest,
    options?: AxiosRequestConfig,
  ) {
    return AuthenticationApiFp(this.configuration)
      .devLogin(requestParameters.devLogin, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   *
   * @summary Elements Fe Login As
   * @param {AuthenticationApiElementsFeLoginAsRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof AuthenticationApi
   */
  public elementsFeLoginAs(
    requestParameters: AuthenticationApiElementsFeLoginAsRequest,
    options?: AxiosRequestConfig,
  ) {
    return AuthenticationApiFp(this.configuration)
      .elementsFeLoginAs(
        requestParameters.envId,
        requestParameters.userFELoginRequestInput,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   *
   * @summary Elements Login As
   * @param {AuthenticationApiElementsLoginAsRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof AuthenticationApi
   */
  public elementsLoginAs(
    requestParameters: AuthenticationApiElementsLoginAsRequest,
    options?: AxiosRequestConfig,
  ) {
    return AuthenticationApiFp(this.configuration)
      .elementsLoginAs(requestParameters.userLoginRequestInput, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The login endpoint allows the frontend app to exchange a user JWT with a user session. The user session is stored on an httpOnly + secure cookie.
   * @summary Login
   * @param {AuthenticationApiLoginRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof AuthenticationApi
   */
  public login(
    requestParameters: AuthenticationApiLoginRequest = {},
    options?: AxiosRequestConfig,
  ) {
    return AuthenticationApiFp(this.configuration)
      .login(requestParameters.inviteCode, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The login endpoint allows the frontend app to exchange a user JWT with a user session. The user session is stored on an httpOnly + secure cookie.
   * @summary Login Elements
   * @param {AuthenticationApiLoginElementsRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof AuthenticationApi
   */
  public loginElements(
    requestParameters: AuthenticationApiLoginElementsRequest,
    options?: AxiosRequestConfig,
  ) {
    return AuthenticationApiFp(this.configuration)
      .loginElements(requestParameters.token, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The logout endpoint deletes the session cookie of a logged in user and invalidates cached VCs.
   * @summary Logout Get
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof AuthenticationApi
   */
  public logoutGet(options?: AxiosRequestConfig) {
    return AuthenticationApiFp(this.configuration)
      .logoutGet(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The logout endpoint deletes the session cookie of a logged in user and invalidates cached VCs.
   * @summary Logout Post
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof AuthenticationApi
   */
  public logoutPost(options?: AxiosRequestConfig) {
    return AuthenticationApiFp(this.configuration)
      .logoutPost(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   *
   * @summary Me
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof AuthenticationApi
   */
  public me(options?: AxiosRequestConfig) {
    return AuthenticationApiFp(this.configuration)
      .me(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Allows the user to switch his active organization (manipulates the user\'s login session).  This route will return a new login cookie to the user.
   * @summary Switch Organization
   * @param {AuthenticationApiSwitchOrganizationRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof AuthenticationApi
   */
  public switchOrganization(
    requestParameters: AuthenticationApiSwitchOrganizationRequest,
    options?: AxiosRequestConfig,
  ) {
    return AuthenticationApiFp(this.configuration)
      .switchOrganization(requestParameters.orgId, options)
      .then((request) => request(this.axios, this.basePath));
  }
}
