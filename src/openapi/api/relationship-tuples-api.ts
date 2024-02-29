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
import { RelationshipTupleCreate } from '../types';
// @ts-ignore
import { RelationshipTupleCreateBulkOperation } from '../types';
// @ts-ignore
import { RelationshipTupleDelete } from '../types';
// @ts-ignore
import { RelationshipTupleDeleteBulkOperation } from '../types';
// @ts-ignore
import { RelationshipTupleRead } from '../types';
/**
 * RelationshipTuplesApi - axios parameter creator
 * @export
 */
export const RelationshipTuplesApiAxiosParamCreator = function (configuration?: Configuration) {
  return {
    /**
     *
     * @summary Bulk create relationship tuples(EAP)
     * @param {any} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {any} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleCreateBulkOperation} relationshipTupleCreateBulkOperation
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    bulkCreateRelationshipTuples: async (
      projId: any,
      envId: any,
      relationshipTupleCreateBulkOperation: RelationshipTupleCreateBulkOperation,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('bulkCreateRelationshipTuples', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('bulkCreateRelationshipTuples', 'envId', envId);
      // verify required parameter 'relationshipTupleCreateBulkOperation' is not null or undefined
      assertParamExists(
        'bulkCreateRelationshipTuples',
        'relationshipTupleCreateBulkOperation',
        relationshipTupleCreateBulkOperation,
      );
      const localVarPath = `/v2/facts/{proj_id}/{env_id}/relationship_tuples/bulk`
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
        relationshipTupleCreateBulkOperation,
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
     * @summary Bulk Delete Relationship Tuples
     * @param {any} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {any} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleDeleteBulkOperation} relationshipTupleDeleteBulkOperation
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    bulkDeleteRelationshipTuples: async (
      projId: any,
      envId: any,
      relationshipTupleDeleteBulkOperation: RelationshipTupleDeleteBulkOperation,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('bulkDeleteRelationshipTuples', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('bulkDeleteRelationshipTuples', 'envId', envId);
      // verify required parameter 'relationshipTupleDeleteBulkOperation' is not null or undefined
      assertParamExists(
        'bulkDeleteRelationshipTuples',
        'relationshipTupleDeleteBulkOperation',
        relationshipTupleDeleteBulkOperation,
      );
      const localVarPath = `/v2/facts/{proj_id}/{env_id}/relationship_tuples/bulk`
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
        relationshipTupleDeleteBulkOperation,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Create a relationship between two resource instances using a relation.
     * @summary Create Relationship Tuple
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleCreate} relationshipTupleCreate
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    createRelationshipTuple: async (
      projId: string,
      envId: string,
      relationshipTupleCreate: RelationshipTupleCreate,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('createRelationshipTuple', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('createRelationshipTuple', 'envId', envId);
      // verify required parameter 'relationshipTupleCreate' is not null or undefined
      assertParamExists(
        'createRelationshipTuple',
        'relationshipTupleCreate',
        relationshipTupleCreate,
      );
      const localVarPath = `/v2/facts/{proj_id}/{env_id}/relationship_tuples`
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
        relationshipTupleCreate,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Delete a relationship between two resource instances.
     * @summary Delete Relationship Tuple
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleDelete} relationshipTupleDelete
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    deleteRelationshipTuple: async (
      projId: string,
      envId: string,
      relationshipTupleDelete: RelationshipTupleDelete,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('deleteRelationshipTuple', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('deleteRelationshipTuple', 'envId', envId);
      // verify required parameter 'relationshipTupleDelete' is not null or undefined
      assertParamExists(
        'deleteRelationshipTuple',
        'relationshipTupleDelete',
        relationshipTupleDelete,
      );
      const localVarPath = `/v2/facts/{proj_id}/{env_id}/relationship_tuples`
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
        relationshipTupleDelete,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Lists the relationship tuples defined within an environment.
     * @summary List Relationship Tuples
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {string} [tenant] The tenant key or id to filter by
     * @param {string} [subject] The subject to filter by, accepts either the resource instance id or resource_type:resource_instance
     * @param {string} [relation] The relation id or key to filter by
     * @param {string} [object] The object to filter by, accepts either the resource instance id or resource_type:resource_instance
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listRelationshipTuples: async (
      projId: string,
      envId: string,
      detailed?: any,
      page?: number,
      perPage?: number,
      tenant?: string,
      subject?: string,
      relation?: string,
      object?: string,
      objectType?: string,
      subjectType?: string,
      options: AxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'projId' is not null or undefined
      assertParamExists('listRelationshipTuples', 'projId', projId);
      // verify required parameter 'envId' is not null or undefined
      assertParamExists('listRelationshipTuples', 'envId', envId);
      const localVarPath = `/v2/facts/{proj_id}/{env_id}/relationship_tuples`
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

      if (detailed !== undefined) {
        localVarQueryParameter['detailed'] = detailed;
      }

      if (page !== undefined) {
        localVarQueryParameter['page'] = page;
      }

      if (perPage !== undefined) {
        localVarQueryParameter['per_page'] = perPage;
      }

      if (tenant !== undefined) {
        localVarQueryParameter['tenant'] = tenant;
      }

      if (subject !== undefined) {
        localVarQueryParameter['subject'] = subject;
      }

      if (relation !== undefined) {
        localVarQueryParameter['relation'] = relation;
      }

      if (object !== undefined) {
        localVarQueryParameter['object'] = object;
      }

      if (objectType !== undefined) {
        localVarQueryParameter['object_type'] = objectType;
      }

      if (subjectType !== undefined) {
        localVarQueryParameter['subject_type'] = subjectType;
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
  };
};

/**
 * RelationshipTuplesApi - functional programming interface
 * @export
 */
export const RelationshipTuplesApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = RelationshipTuplesApiAxiosParamCreator(configuration);
  return {
    /**
     *
     * @summary Bulk create relationship tuples(EAP)
     * @param {any} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {any} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleCreateBulkOperation} relationshipTupleCreateBulkOperation
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async bulkCreateRelationshipTuples(
      projId: any,
      envId: any,
      relationshipTupleCreateBulkOperation: RelationshipTupleCreateBulkOperation,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<any>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.bulkCreateRelationshipTuples(
        projId,
        envId,
        relationshipTupleCreateBulkOperation,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     *
     * @summary Bulk Delete Relationship Tuples
     * @param {any} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {any} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleDeleteBulkOperation} relationshipTupleDeleteBulkOperation
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async bulkDeleteRelationshipTuples(
      projId: any,
      envId: any,
      relationshipTupleDeleteBulkOperation: RelationshipTupleDeleteBulkOperation,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<any>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.bulkDeleteRelationshipTuples(
        projId,
        envId,
        relationshipTupleDeleteBulkOperation,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Create a relationship between two resource instances using a relation.
     * @summary Create Relationship Tuple
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleCreate} relationshipTupleCreate
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async createRelationshipTuple(
      projId: string,
      envId: string,
      relationshipTupleCreate: RelationshipTupleCreate,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<RelationshipTupleRead>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.createRelationshipTuple(
        projId,
        envId,
        relationshipTupleCreate,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Delete a relationship between two resource instances.
     * @summary Delete Relationship Tuple
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleDelete} relationshipTupleDelete
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async deleteRelationshipTuple(
      projId: string,
      envId: string,
      relationshipTupleDelete: RelationshipTupleDelete,
      options?: AxiosRequestConfig,
    ): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>> {
      const localVarAxiosArgs = await localVarAxiosParamCreator.deleteRelationshipTuple(
        projId,
        envId,
        relationshipTupleDelete,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
    /**
     * Lists the relationship tuples defined within an environment.
     * @summary List Relationship Tuples
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {string} [tenant] The tenant key or id to filter by
     * @param {string} [subject] The subject to filter by, accepts either the resource instance id or resource_type:resource_instance
     * @param {string} [relation] The relation id or key to filter by
     * @param {string} [object] The object to filter by, accepts either the resource instance id or resource_type:resource_instance
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async listRelationshipTuples(
      projId: string,
      envId: string,
      detailed?: any,
      page?: number,
      perPage?: number,
      tenant?: string,
      subject?: string,
      relation?: string,
      object?: string,
      objectType?: string,
      subjectType?: string,
      options?: AxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<Array<RelationshipTupleRead>>
    > {
      const localVarAxiosArgs = await localVarAxiosParamCreator.listRelationshipTuples(
        projId,
        envId,
        detailed,
        page,
        perPage,
        tenant,
        subject,
        relation,
        object,
        objectType,
        subjectType,
        options,
      );
      return createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration);
    },
  };
};

/**
 * RelationshipTuplesApi - factory interface
 * @export
 */
export const RelationshipTuplesApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = RelationshipTuplesApiFp(configuration);
  return {
    /**
     *
     * @summary Bulk create relationship tuples(EAP)
     * @param {any} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {any} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleCreateBulkOperation} relationshipTupleCreateBulkOperation
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    bulkCreateRelationshipTuples(
      projId: any,
      envId: any,
      relationshipTupleCreateBulkOperation: RelationshipTupleCreateBulkOperation,
      options?: any,
    ): AxiosPromise<any> {
      return localVarFp
        .bulkCreateRelationshipTuples(projId, envId, relationshipTupleCreateBulkOperation, options)
        .then((request) => request(axios, basePath));
    },
    /**
     *
     * @summary Bulk Delete Relationship Tuples
     * @param {any} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {any} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleDeleteBulkOperation} relationshipTupleDeleteBulkOperation
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    bulkDeleteRelationshipTuples(
      projId: any,
      envId: any,
      relationshipTupleDeleteBulkOperation: RelationshipTupleDeleteBulkOperation,
      options?: any,
    ): AxiosPromise<any> {
      return localVarFp
        .bulkDeleteRelationshipTuples(projId, envId, relationshipTupleDeleteBulkOperation, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Create a relationship between two resource instances using a relation.
     * @summary Create Relationship Tuple
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleCreate} relationshipTupleCreate
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    createRelationshipTuple(
      projId: string,
      envId: string,
      relationshipTupleCreate: RelationshipTupleCreate,
      options?: any,
    ): AxiosPromise<RelationshipTupleRead> {
      return localVarFp
        .createRelationshipTuple(projId, envId, relationshipTupleCreate, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Delete a relationship between two resource instances.
     * @summary Delete Relationship Tuple
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {RelationshipTupleDelete} relationshipTupleDelete
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    deleteRelationshipTuple(
      projId: string,
      envId: string,
      relationshipTupleDelete: RelationshipTupleDelete,
      options?: any,
    ): AxiosPromise<void> {
      return localVarFp
        .deleteRelationshipTuple(projId, envId, relationshipTupleDelete, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Lists the relationship tuples defined within an environment.
     * @summary List Relationship Tuples
     * @param {string} projId Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
     * @param {string} envId Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
     * @param {string} [detailed] If true, will return the full subject and object resource instances.
     * @param {number} [page] Page number of the results to fetch, starting at 1.
     * @param {number} [perPage] The number of results per page (max 100).
     * @param {string} [tenant] The tenant key or id to filter by
     * @param {string} [subject] The subject to filter by, accepts either the resource instance id or resource_type:resource_instance
     * @param {string} [relation] The relation id or key to filter by
     * @param {string} [object] The object to filter by, accepts either the resource instance id or resource_type:resource_instance
     * @param {string} [objectType] The object type to filter by, accepts resource type id or key
     * @param {string} [subjectType] The subject type to filter by, accepts resource type id or key
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    listRelationshipTuples(
      projId: string,
      envId: string,
      detailed?: any,
      page?: number,
      perPage?: number,
      tenant?: string,
      subject?: string,
      relation?: string,
      object?: string,
      objectType?: string,
      subjectType?: string,
      options?: any,
    ): AxiosPromise<Array<RelationshipTupleRead>> {
      return localVarFp
        .listRelationshipTuples(
          projId,
          envId,
          detailed,
          page,
          perPage,
          tenant,
          subject,
          relation,
          object,
          objectType,
          subjectType,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * Request parameters for bulkCreateRelationshipTuples operation in RelationshipTuplesApi.
 * @export
 * @interface RelationshipTuplesApiBulkCreateRelationshipTuplesRequest
 */
export interface RelationshipTuplesApiBulkCreateRelationshipTuplesRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {any}
   * @memberof RelationshipTuplesApiBulkCreateRelationshipTuples
   */
  readonly projId: any;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {any}
   * @memberof RelationshipTuplesApiBulkCreateRelationshipTuples
   */
  readonly envId: any;

  /**
   *
   * @type {RelationshipTupleCreateBulkOperation}
   * @memberof RelationshipTuplesApiBulkCreateRelationshipTuples
   */
  readonly relationshipTupleCreateBulkOperation: RelationshipTupleCreateBulkOperation;
}

/**
 * Request parameters for bulkDeleteRelationshipTuples operation in RelationshipTuplesApi.
 * @export
 * @interface RelationshipTuplesApiBulkDeleteRelationshipTuplesRequest
 */
export interface RelationshipTuplesApiBulkDeleteRelationshipTuplesRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {any}
   * @memberof RelationshipTuplesApiBulkDeleteRelationshipTuples
   */
  readonly projId: any;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {any}
   * @memberof RelationshipTuplesApiBulkDeleteRelationshipTuples
   */
  readonly envId: any;

  /**
   *
   * @type {RelationshipTupleDeleteBulkOperation}
   * @memberof RelationshipTuplesApiBulkDeleteRelationshipTuples
   */
  readonly relationshipTupleDeleteBulkOperation: RelationshipTupleDeleteBulkOperation;
}

/**
 * Request parameters for createRelationshipTuple operation in RelationshipTuplesApi.
 * @export
 * @interface RelationshipTuplesApiCreateRelationshipTupleRequest
 */
export interface RelationshipTuplesApiCreateRelationshipTupleRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof RelationshipTuplesApiCreateRelationshipTuple
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof RelationshipTuplesApiCreateRelationshipTuple
   */
  readonly envId: string;

  /**
   *
   * @type {RelationshipTupleCreate}
   * @memberof RelationshipTuplesApiCreateRelationshipTuple
   */
  readonly relationshipTupleCreate: RelationshipTupleCreate;
}

/**
 * Request parameters for deleteRelationshipTuple operation in RelationshipTuplesApi.
 * @export
 * @interface RelationshipTuplesApiDeleteRelationshipTupleRequest
 */
export interface RelationshipTuplesApiDeleteRelationshipTupleRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof RelationshipTuplesApiDeleteRelationshipTuple
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof RelationshipTuplesApiDeleteRelationshipTuple
   */
  readonly envId: string;

  /**
   *
   * @type {RelationshipTupleDelete}
   * @memberof RelationshipTuplesApiDeleteRelationshipTuple
   */
  readonly relationshipTupleDelete: RelationshipTupleDelete;
}

/**
 * Request parameters for listRelationshipTuples operation in RelationshipTuplesApi.
 * @export
 * @interface RelationshipTuplesApiListRelationshipTuplesRequest
 */
export interface RelationshipTuplesApiListRelationshipTuplesRequest {
  /**
   * Either the unique id of the project, or the URL-friendly key of the project (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof RelationshipTuplesApiListRelationshipTuples
   */
  readonly projId: string;

  /**
   * Either the unique id of the environment, or the URL-friendly key of the environment (i.e: the \&quot;slug\&quot;).
   * @type {string}
   * @memberof RelationshipTuplesApiListRelationshipTuples
   */
  readonly envId: string;

  /**
   * If true, will return the full subject and object resource instances.
   * @type {any}
   * @memberof RelationshipTuplesApiListRelationshipTuples
   */
  readonly detailed?: any;

  /**
   * Page number of the results to fetch, starting at 1.
   * @type {number}
   * @memberof RelationshipTuplesApiListRelationshipTuples
   */
  readonly page?: number;

  /**
   * The number of results per page (max 100).
   * @type {number}
   * @memberof RelationshipTuplesApiListRelationshipTuples
   */
  readonly perPage?: number;

  /**
   * The tenant key or id to filter by
   * @type {string}
   * @memberof RelationshipTuplesApiListRelationshipTuples
   */
  readonly tenant?: string;

  /**
   * The subject to filter by, accepts either the resource instance id or resource_type:resource_instance
   * @type {string}
   * @memberof RelationshipTuplesApiListRelationshipTuples
   */
  readonly subject?: string;

  /**
   * The relation id or key to filter by
   * @type {string}
   * @memberof RelationshipTuplesApiListRelationshipTuples
   */
  readonly relation?: string;

  /**
   * The object to filter by, accepts either the resource instance id or resource_type:resource_instance
   * @type {string}
   * @memberof RelationshipTuplesApiListRelationshipTuples
   */
  readonly object?: string;

  /**
   * The object type to filter by, accepts resource type id or key
   * @type {string}
   * @memberof RelationshipTuplesApiListRelationshipTuples
   */
  readonly objectType?: string;

  /**
   * The subject type to filter by, accepts resource type id or key
   * @type {string}
   * @memberof RelationshipTuplesApiListRelationshipTuples
   */
  readonly subjectType?: string;
}

/**
 * RelationshipTuplesApi - object-oriented interface
 * @export
 * @class RelationshipTuplesApi
 * @extends {BaseAPI}
 */
export class RelationshipTuplesApi extends BaseAPI {
  /**
   *
   * @summary Bulk create relationship tuples(EAP)
   * @param {RelationshipTuplesApiBulkCreateRelationshipTuplesRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof RelationshipTuplesApi
   */
  public async bulkCreateRelationshipTuples(
    requestParameters: RelationshipTuplesApiBulkCreateRelationshipTuplesRequest,
    options?: AxiosRequestConfig,
  ) {
    let request = await RelationshipTuplesApiFp(this.configuration).bulkCreateRelationshipTuples(
      requestParameters.projId,
      requestParameters.envId,
      requestParameters.relationshipTupleCreateBulkOperation,
      options,
    );
    return request(this.axios, this.basePath);
  }

  /**
   *
   * @summary Bulk Delete Relationship Tuples
   * @param {RelationshipTuplesApiBulkDeleteRelationshipTuplesRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof RelationshipTuplesApi
   */
  public async bulkDeleteRelationshipTuples(
    requestParameters: RelationshipTuplesApiBulkDeleteRelationshipTuplesRequest,
    options?: AxiosRequestConfig,
  ) {
    let request = await RelationshipTuplesApiFp(this.configuration).bulkDeleteRelationshipTuples(
      requestParameters.projId,
      requestParameters.envId,
      requestParameters.relationshipTupleDeleteBulkOperation,
      options,
    );
    return request(this.axios, this.basePath);
  }

  /**
   * Create a relationship between two resource instances using a relation.
   * @summary Create Relationship Tuple
   * @param {RelationshipTuplesApiCreateRelationshipTupleRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof RelationshipTuplesApi
   */
  public createRelationshipTuple(
    requestParameters: RelationshipTuplesApiCreateRelationshipTupleRequest,
    options?: AxiosRequestConfig,
  ) {
    return RelationshipTuplesApiFp(this.configuration)
      .createRelationshipTuple(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.relationshipTupleCreate,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Delete a relationship between two resource instances.
   * @summary Delete Relationship Tuple
   * @param {RelationshipTuplesApiDeleteRelationshipTupleRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof RelationshipTuplesApi
   */
  public deleteRelationshipTuple(
    requestParameters: RelationshipTuplesApiDeleteRelationshipTupleRequest,
    options?: AxiosRequestConfig,
  ) {
    return RelationshipTuplesApiFp(this.configuration)
      .deleteRelationshipTuple(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.relationshipTupleDelete,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Lists the relationship tuples defined within an environment.
   * @summary List Relationship Tuples
   * @param {RelationshipTuplesApiListRelationshipTuplesRequest} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   * @memberof RelationshipTuplesApi
   */
  public listRelationshipTuples(
    requestParameters: RelationshipTuplesApiListRelationshipTuplesRequest,
    options?: AxiosRequestConfig,
  ) {
    return RelationshipTuplesApiFp(this.configuration)
      .listRelationshipTuples(
        requestParameters.projId,
        requestParameters.envId,
        requestParameters.detailed,
        requestParameters.page,
        requestParameters.perPage,
        requestParameters.tenant,
        requestParameters.subject,
        requestParameters.relation,
        requestParameters.object,
        requestParameters.objectType,
        requestParameters.subjectType,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
