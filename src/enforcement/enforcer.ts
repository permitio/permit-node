import axios, { AxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import { type Logger } from 'pino';

import { type IPermitConfig } from '#src/config';
import {
  type CheckConfig,
  type CheckUrlConfig,
  type Context,
  type GetUserPermissionsConfig,
  ContextStore,
} from '#src/utils/context';
import { createOwnedTransport } from '#src/utils/http-transport';
import {
  diagnosticAxiosError,
  diagnosticBody,
  diagnosticCause,
  diagnosticErrorSecrets,
  diagnosticMetadata,
  diagnosticStatus,
  diagnosticText,
  diagnosticUrl,
} from '#src/utils/diagnostics';
import { resolveRetryConfig } from '#src/utils/retry';

import {
  type IAction,
  type IAuthorizedUsersResult,
  type IFilterObject,
  type ICheckInput,
  type ICheckUrlInput,
  type ICheckOpaInput,
  type ICheckQuery,
  type IResource,
  type IUser,
  type IUserPermissions,
  type TenantDetails,
} from '#src/enforcement/interfaces';

import {
  parseAllTenantsResponse,
  parseAuthorizedUsersResponse,
  parseUserTenantsResponse,
  parseBulkResponse,
  parseCheckResponse,
  parseCheckUrlResponse,
  parsePermissionsResponse,
} from '#src/enforcement/responses';

const RESOURCE_DELIMITER = ':';

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

export class PermitError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    const privacy = diagnosticErrorSecrets(options?.cause);
    const cause = options?.cause === undefined ? undefined : diagnosticCause(options.cause);
    super(diagnosticText(message, privacy), cause === undefined ? undefined : { cause });
    this.name = 'PermitError';
  }
}

export class PermitConnectionError extends PermitError {
  public readonly code: string | undefined;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PermitConnectionError';
    this.code = diagnosticMetadata(this.cause).code;
  }
}

export class PermitPDPStatusError extends PermitConnectionError {
  public readonly responseBody: unknown;
  public readonly statusCode?: number;

  /**
   * Creates an error for an unexpected HTTP status code or response body from the PDP.
   *
   * @param message - Description of the failed operation.
   * @param statusCode - HTTP status code, supplied for errors raised by the SDK.
   * @param responseBody - Body reduced to bounded error-description fields.
   * @param options - Optional cause; only safe message, status and code metadata are retained.
   */
  constructor(
    message: string,
    statusCode?: number,
    responseBody?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PermitPDPStatusError';
    const status = diagnosticStatus(statusCode);
    if (status !== undefined) this.statusCode = status;
    this.responseBody = diagnosticBody(responseBody, diagnosticErrorSecrets(options?.cause));
  }
}

export interface IEnforcer {
  /**
   * Checks if a `user` is authorized to perform an `action` on a `resource` within the specified context.
   *
   * @param user     - The user object representing the user.
   * @param action   - The action to be performed on the resource.
   * @param resource - The resource object representing the resource.
   * @param context  - The context object representing the context in which the action is performed.
   * @returns `true` if the user is authorized, `false` otherwise.
   * @throws {@link PermitConnectionError} if an error occurs while sending the authorization request to the PDP.
   * @throws {@link PermitPDPStatusError} if the PDP's status code or response body is unexpected.
   */
  check(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context?: Context,
    config?: CheckConfig,
  ): Promise<boolean>;

  /** Checks a full URL on a compatible container PDP; invalid or unavailable decisions reject. */
  checkUrl(
    user: IUser | string,
    httpMethod: string,
    url: string,
    config?: CheckUrlConfig,
  ): Promise<boolean>;

  /**
   * Checks multiple requests within the specified context.
   *
   * @param checks   - The check requests.
   * @param context  - The context object representing the context in which the action is performed.
   * @returns array containing `true` if the user is authorized, `false` otherwise for each check request.
   * @throws {@link PermitConnectionError} if an error occurs while sending the authorization request to the PDP.
   * @throws {@link PermitPDPStatusError} if the PDP's status code or response body is unexpected.
   */
  bulkCheck(
    checks: Array<ICheckQuery>,
    context?: Context,
    config?: CheckConfig,
  ): Promise<Array<boolean>>;

  /**
   * Get all permissions for the specified user.
   *
   * @param user     - The user object representing the user.
   * @param tenants  - The list of tenants to filter the permissions on ( given by roles ).
   * @param resources - The list of resources to filter the permissions on ( given by resource roles ).
   * @param resource_types - The list of resource types to filter the permissions on ( given by resource roles ).
   * @param config - Timeout/error policy and request context overriding existing global context.
   * @returns object with key as the resource identifier and value as the resource details and permissions.
   * @throws {@link PermitConnectionError} if an error occurs while sending the authorization request to the PDP.
   * @throws {@link PermitPDPStatusError} if the PDP's status code or response body is unexpected.
   */
  getUserPermissions(
    user: IUser | string,
    tenants?: string[],
    resources?: string[],
    resource_types?: string[],
    config?: GetUserPermissionsConfig,
  ): Promise<IUserPermissions>;

  /** Queries the full authorized-user envelope; unsupported OPA queries always reject. */
  getAuthorizedUsers(
    action: IAction,
    resource: IResource | string,
    context?: Context,
    config?: CheckConfig,
  ): Promise<IAuthorizedUsersResult>;

  /** Queries container PDP role-derived tenants; an unavailable endpoint always rejects. */
  getUserTenants(
    user: IUser | string,
    context?: Context,
    config?: CheckConfig,
  ): Promise<TenantDetails[]>;

  /** Filters a stable snapshot of objects through positional bulk authorization decisions. */
  filterObjects<T extends IFilterObject>(
    user: IUser | string,
    action: IAction,
    objects: readonly T[],
    context?: Context,
    config?: CheckConfig,
  ): Promise<T[]>;

  /**
   * Get all tenants available in the system.
   * @returns An array of TenantDetails representing all tenants.
   */
  checkAllTenants(
    user: IUser | string,
    action: string,
    resource: IResource | string,
    context: Context | undefined,
    sdk: string | undefined,
  ): Promise<TenantDetails[]>;
}

/**
 * Builds the OPA client base URL from the configured PDP URL by forcing the OPA
 * port (8181) and appending the OPA data path, using the native WHATWG `URL`
 * (Node >= 10) in place of the previous `url-parse` dependency (#106).
 *
 * @param pdp - The configured PDP base URL (e.g. `http://localhost:7766`).
 * @returns The OPA base URL (e.g. `http://localhost:8181/v1/data/permit/`). A PDP
 *   path with no trailing slash is glued to the data path (`/prefix` ->
 *   `/prefixv1/data/permit/`), preserved from `url-parse` and locked by a test.
 * @throws {PermitError} on input without a scheme (e.g. `localhost`); a `host:port`
 *   value like `localhost:7766` is misparsed, not rejected — pass a full URL. The
 *   error omits the configured value because it may carry credentials.
 */
export function buildOpaBaseUrl(pdp: string): string {
  let opaBaseUrl: URL;
  try {
    opaBaseUrl = new URL(pdp);
  } catch {
    throw new PermitError(
      'Invalid PDP URL in the "pdp" option: expected an absolute http(s) URL, ' +
        'e.g. "http://localhost:7766".',
    );
  }
  opaBaseUrl.port = '8181';
  opaBaseUrl.pathname = `${opaBaseUrl.pathname}v1/data/permit/`;
  return opaBaseUrl.toString();
}

/**
 * The {@link Enforcer} class is responsible for performing permission checks against the PDP.
 * It implements the {@link IEnforcer} interface.
 */
export class Enforcer implements IEnforcer {
  public contextStore: ContextStore; // cross-query context (global context)
  private client: AxiosInstance;
  private opaClient: AxiosInstance;

  /**
   * Creates an instance of the Enforcer class.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(
    private config: IPermitConfig,
    private logger: Logger,
  ) {
    const opaBaseUrl = buildOpaBaseUrl(this.config.pdp);
    const version = process.env['npm_package_version'] ?? 'unknown';
    const resolvedRetry = resolveRetryConfig(
      config.pdpRetry === undefined ? config.retry : config.pdpRetry,
    );
    const retry = {
      ...resolvedRetry,
      retryMethods: [...new Set([...resolvedRetry.retryMethods, 'POST'])],
    };
    const headers = {
      'X-Permit-SDK-Version': `node:${version}`,
      'Content-Type': 'application/json',
    };
    this.client = createOwnedTransport({
      caller: axios.create(),
      logger: this.logger,
      retry,
      name: 'PDP',
      defaults: { baseURL: `${this.config.pdp}/`, headers },
    });
    this.opaClient = createOwnedTransport({
      caller: config.opaAxiosInstance ?? axios.create(),
      logger: this.logger,
      retry,
      name: 'OPA',
      defaults: { baseURL: opaBaseUrl, headers },
    });

    this.contextStore = new ContextStore();
  }

  public async getUserPermissions(
    user: IUser | string,
    tenants?: string[],
    resources?: string[],
    resource_types?: string[],
    config: GetUserPermissionsConfig = {},
  ): Promise<IUserPermissions> {
    return await this.getUserPermissionsWithExceptions(
      user,
      tenants,
      resources,
      resource_types,
      config,
    ).catch((err) => {
      const shouldThrow =
        config.throwOnError === undefined ? this.config.throwOnError : config.throwOnError;
      if (shouldThrow) {
        throw err;
      } else {
        this.logger.error(
          { err: diagnosticCause(err, [this.config.token]) },
          'Permit authorization failed',
        );
        return {};
      }
    });
  }

  private async getUserPermissionsWithExceptions(
    user: IUser | string,
    tenants?: string[],
    resources?: string[],
    resource_types?: string[],
    config: GetUserPermissionsConfig = {},
  ): Promise<IUserPermissions> {
    const checkTimeout = config.timeout ?? this.config.timeout;
    if (config.useOpa) {
      throw new PermitError('The useOpa option is supported only by permit.check()');
    }
    const input = {
      user: isString(user) ? { key: user } : user,
      tenants,
      resources,
      resource_types,
      context: this.contextStore.getDerivedContext(config.context ?? {}),
    };
    return await this.client
      .post<unknown>('user-permissions', this.serializeInput(input, 'getUserPermissions'), {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
        },
        ...(checkTimeout !== undefined && { timeout: checkTimeout }),
      })
      .then((response) => {
        if (response.status !== 200) {
          throw this.pdpStatusError('getUserPermissions', response);
        }
        const permissions = this.parsePdpResponse(
          'getUserPermissions',
          response,
          parsePermissionsResponse,
        );
        this.logger.info(
          { operation: 'getUserPermissions' },
          'permit.getUserPermissions() succeeded',
        );
        return permissions;
      })
      .catch((error: unknown) => {
        return this.handlePDPError(error, 'getUserPermissions');
      });
  }

  /**
   * Queries the users authorized for a resource using the PDP's complete result envelope.
   *
   * @param action - Action to evaluate.
   * @param resource - Resource type, type:key string or resource attributes and tenant.
   * @param context - Request context overriding the existing global context.
   * @param config - Timeout and error policy; useOpa:true is unsupported and always rejects.
   * @returns The full result, or a normalized empty result in explicit non-throwing mode.
   * @throws {PermitError} For unsupported OPA, invalid resource strings, or non-JSON inputs.
   * @throws {PermitConnectionError} On operational failure in throwing mode.
   * @throws {PermitPDPStatusError} On a rejected or malformed PDP response in throwing mode.
   */
  public async getAuthorizedUsers(
    action: IAction,
    resource: IResource | string,
    context: Context = {},
    config: CheckConfig = {},
  ): Promise<IAuthorizedUsersResult> {
    if (config.useOpa) {
      throw new PermitError('The useOpa option is supported only by permit.check()');
    }
    const normalized = this.normalizeResource(
      isString(resource) ? Enforcer.resourceFromString(resource) : resource,
    );
    const empty: IAuthorizedUsersResult = {
      resource: `${normalized.type}:${normalized.key ?? '*'}`,
      tenant: normalized.tenant || 'default',
      users: {},
    };
    return await this.getAuthorizedUsersWithExceptions(action, normalized, context, config).catch(
      (error: unknown) => {
        if (config.throwOnError ?? this.config.throwOnError) throw error;
        this.logger.error(
          { err: diagnosticCause(error, [this.config.token]) },
          'Permit authorization failed',
        );
        return empty;
      },
    );
  }

  private async getAuthorizedUsersWithExceptions(
    action: IAction,
    resource: IResource,
    context: Context,
    config: CheckConfig,
  ): Promise<IAuthorizedUsersResult> {
    const input = { action, resource, context: this.contextStore.getDerivedContext(context) };
    const timeout = config.timeout ?? this.config.timeout;
    return await this.client
      .post<unknown>('authorized_users', this.serializeInput(input, 'getAuthorizedUsers'), {
        headers: { Authorization: `Bearer ${this.config.token}` },
        ...(timeout !== undefined && { timeout }),
      })
      .then((response) => {
        if (response.status !== 200) throw this.pdpStatusError('getAuthorizedUsers', response);
        return this.parsePdpResponse('getAuthorizedUsers', response, parseAuthorizedUsersResponse);
      })
      .catch((error: unknown) => this.handlePDPError(error, 'getAuthorizedUsers'));
  }

  /**
   * Queries role-derived tenants for a user on a compatible container PDP.
   *
   * @param user - User key or attributes to query.
   * @param context - Request context overriding the existing global context.
   * @param config - Timeout and error policy; useOpa:true is unsupported and always rejects.
   * @returns All tenants, or [] on operational failure in explicit non-throwing mode.
   * @throws {PermitError} For unsupported OPA or non-JSON input in throwing mode.
   * @throws {PermitPDPStatusError} If the endpoint is unavailable (including cloud PDPs), even
   *   in non-throwing mode; also on rejected or malformed responses in throwing mode.
   * @throws {PermitConnectionError} On operational failure in throwing mode.
   */
  public async getUserTenants(
    user: IUser | string,
    context: Context = {},
    config: CheckConfig = {},
  ): Promise<TenantDetails[]> {
    if (config.useOpa) {
      throw new PermitError('The useOpa option is supported only by permit.check()');
    }
    return await this.getUserTenantsWithExceptions(user, context, config).catch(
      (error: unknown) => {
        if (
          (error instanceof PermitPDPStatusError && error.statusCode === 404) ||
          (config.throwOnError ?? this.config.throwOnError)
        ) {
          throw error;
        }
        this.logger.error(
          { err: diagnosticCause(error, [this.config.token]) },
          'Permit authorization failed',
        );
        return [];
      },
    );
  }

  private async getUserTenantsWithExceptions(
    user: IUser | string,
    context: Context,
    config: CheckConfig,
  ): Promise<TenantDetails[]> {
    const input = {
      user: isString(user) ? { key: user } : user,
      context: this.contextStore.getDerivedContext(context),
    };
    const timeout = config.timeout ?? this.config.timeout;
    return await this.client
      .post<unknown>('user-tenants', this.serializeInput(input, 'getUserTenants'), {
        headers: { Authorization: `Bearer ${this.config.token}` },
        ...(timeout !== undefined && { timeout }),
      })
      .then((response) => {
        if (response.status !== 200) throw this.pdpStatusError('getUserTenants', response);
        return this.parsePdpResponse('getUserTenants', response, parseUserTenantsResponse);
      })
      .catch((error: unknown) => this.handlePDPError(error, 'getUserTenants'));
  }

  /**
   * Keeps objects authorized for an action, preserving original references and input order.
   *
   * @param user - User key or user attributes.
   * @param action - Action to evaluate for every object.
   * @param objects - Readonly dense array; only known resource fields are sent to the PDP.
   * @param context - Shared context, overridden by each object's request context.
   * @param config - Bulk timeout/error policy; unsupported OPA queries always reject.
   * @returns The authorized subset of a synchronous array snapshot, including duplicates.
   * @throws {PermitError} For unsupported OPA/invalid slots, or non-JSON inputs in throwing mode.
   * @throws {PermitConnectionError} On operational failure in throwing mode.
   * @throws {PermitPDPStatusError} On rejected or malformed bulk results in throwing mode.
   */
  public async filterObjects<T extends IFilterObject>(
    user: IUser | string,
    action: IAction,
    objects: readonly T[],
    context: Context = {},
    config: CheckConfig = {},
  ): Promise<T[]> {
    if (config.useOpa) {
      throw new PermitError('The useOpa option is supported only by permit.check()');
    }
    const snapshot = [...objects];
    const checks: ICheckQuery[] = [];
    for (const object of snapshot) {
      if (object === undefined || object === null || typeof object.type !== 'string') {
        throw new PermitError('permit.filterObjects() requires a resource at every array position');
      }
      const resource: IResource = {
        type: object.type,
        ...(object.key !== undefined && { key: object.key }),
        ...(object.tenant !== undefined && { tenant: object.tenant }),
        ...(object.attributes !== undefined && { attributes: object.attributes }),
      };
      checks.push({
        user,
        action,
        resource,
        ...(object.context !== undefined && {
          context: object.context,
        }),
      });
    }
    if (snapshot.length === 0) return [];
    const allowed = await this.bulkCheck(checks, context, config);
    return snapshot.filter((_object, index) => allowed[index] === true);
  }

  public async bulkCheck(
    checks: Array<ICheckQuery>,
    context: Context = {}, // context provided specifically for this query
    config: CheckConfig = {},
  ): Promise<Array<boolean>> {
    const checkCount = checks.length;
    return await this.bulkCheckWithExceptions(checks, context, config).catch((err) => {
      const shouldThrow =
        config.throwOnError === undefined ? this.config.throwOnError : config.throwOnError;
      if (shouldThrow) {
        throw err;
      } else {
        this.logger.error(
          { err: diagnosticCause(err, [this.config.token]) },
          'Permit authorization failed',
        );
        return Array.from({ length: checkCount }, () => false);
      }
    });
  }

  private buildCheckInput(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context: Context = {}, // context provided specifically for this query
  ): ICheckInput {
    const normalizedUser: IUser = isString(user) ? { key: user } : user;

    const resourceObj = isString(resource) ? Enforcer.resourceFromString(resource) : resource;
    const normalizedResource: IResource = this.normalizeResource(resourceObj);

    const queryContext = this.contextStore.getDerivedContext(context);

    return {
      user: normalizedUser,
      action: action,
      resource: normalizedResource,
      context: queryContext,
    };
  }

  private async bulkCheckWithExceptions(
    checks: Array<ICheckQuery>,
    context: Context = {}, // context provided specifically for this query
    config: CheckConfig = {},
  ): Promise<Array<boolean>> {
    const checkTimeout = config.timeout ?? this.config.timeout;
    if (config.useOpa) {
      throw new PermitError('The useOpa option is supported only by permit.check()');
    }
    const inputs: Array<ICheckInput> = [];
    for (const check of checks) {
      if (check === undefined) {
        throw new PermitError('permit.bulkCheck() requires a check at every array position');
      }
      const input = this.buildCheckInput(check.user, check.action, check.resource, {
        ...context,
        ...check.context,
      });
      inputs.push(input);
    }

    return await this.client
      .post<unknown>('allowed/bulk', this.serializeInput(inputs, 'bulkCheck'), {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
        },
        ...(checkTimeout !== undefined && { timeout: checkTimeout }),
      })
      .then((response) => {
        if (response.status !== 200) {
          throw this.pdpStatusError('bulkCheck', response);
        }
        const decisions = this.parsePdpResponse('bulkCheck', response, (data) =>
          parseBulkResponse(data, inputs.length),
        );
        this.logger.info(
          { operation: 'bulkCheck', count: inputs.length },
          'permit.bulkCheck() succeeded',
        );
        return decisions;
      })
      .catch((error: unknown) => {
        return this.handlePDPError(error, 'bulkCheck');
      });
  }

  public async checkAllTenants(
    user: IUser | string,
    action: string,
    resource: IResource | string,
    context: Context = {}, // default to empty context if not provided
    sdk = 'node', // default to "node" if not provided
  ): Promise<TenantDetails[]> {
    return await this.checkAllTenantsWithExceptions(user, action, resource, context, sdk).catch(
      (err) => {
        if (this.config.throwOnError) {
          throw err;
        } else {
          this.logger.error(
            { err: diagnosticCause(err, [this.config.token]) },
            'Permit authorization failed',
          );
          return [];
        }
      },
    );
  }

  private async checkAllTenantsWithExceptions(
    user: IUser | string,
    action: string,
    resource: IResource | string,
    context: Context,
    sdk: string,
  ): Promise<TenantDetails[]> {
    // checkAllTenants evaluates the request across ALL tenants, so the resource
    // must NOT be pinned to a tenant. We normalize the string forms of user and
    // resource to match check()'s input contract, but intentionally skip
    // normalizeResource() because it injects config.multiTenancy.defaultTenant.
    const input: ICheckInput = {
      user: isString(user) ? { key: user } : user,
      action,
      resource: isString(resource) ? Enforcer.resourceFromString(resource) : resource,
      context: this.contextStore.getDerivedContext(context),
    };

    return await this.client
      .post<unknown>('allowed/all-tenants', this.serializeInput(input, 'checkAllTenants'), {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'X-Permit-Sdk-Language': sdk,
        },
        ...(this.config.timeout !== undefined && { timeout: this.config.timeout }),
      })
      .then((response) => {
        if (response.status !== 200) {
          throw this.pdpStatusError('checkAllTenants', response);
        }
        return this.parsePdpResponse('checkAllTenants', response, parseAllTenantsResponse);
      })
      .catch((error: unknown) => {
        return this.handlePDPError(error, 'checkAllTenants');
      });
  }

  /**
   * Checks access to a full URL using the container PDP's configured URL mappings.
   *
   * @param user - User key or user attributes.
   * @param httpMethod - HTTP method string sent unchanged; the published contract has no enum.
   * @param url - Absolute URI, 1..65536 Unicode characters, sent unchanged to the PDP.
   * @param config - Tenant, context, timeout and error policy; useOpa:true always rejects.
   * @returns The literal allow decision; ordinary operational failures return false in
   *   non-throwing mode.
   * @throws {PermitError} For invalid input, input that cannot be JSON-serialized, unsupported OPA,
   *   or a missing tenant when default tenancy is disabled.
   * @throws {PermitPDPStatusError} For malformed decisions or unavailable HTTP 404/405/501,
   *   regardless of error policy; other rejected responses throw in throwing mode.
   * @throws {PermitConnectionError} On a connection or timeout failure in throwing mode.
   */
  public async checkUrl(
    user: IUser | string,
    httpMethod: string,
    url: string,
    config: CheckUrlConfig = {},
  ): Promise<boolean> {
    const input = this.buildCheckUrlInput(user, httpMethod, url, config);
    const shouldThrow = config.throwOnError ?? this.config.throwOnError;
    return await this.checkUrlWithExceptions(input, config).catch((error: unknown) => {
      if (
        (error instanceof PermitError && !(error instanceof PermitConnectionError)) ||
        (error instanceof PermitPDPStatusError &&
          [200, 404, 405, 501].includes(error.statusCode ?? 0)) ||
        shouldThrow
      ) {
        throw error;
      }
      this.logger.error(
        { err: diagnosticCause(error, [this.config.token]) },
        'Permit authorization failed',
      );
      return false;
    });
  }

  private buildCheckUrlInput(
    user: IUser | string,
    httpMethod: string,
    url: string,
    config: CheckUrlConfig,
  ): ICheckUrlInput {
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new PermitError('Permit.checkUrl() options must be an object.');
    }
    for (const field of ['useOpa', 'throwOnError'] as const) {
      if (config[field] !== undefined && typeof config[field] !== 'boolean') {
        throw new PermitError(`Permit.checkUrl() ${field} must be a boolean.`);
      }
    }
    if (config.useOpa) {
      throw new PermitError('The useOpa option is supported only by permit.check()');
    }
    if (
      config.timeout !== undefined &&
      (typeof config.timeout !== 'number' ||
        !Number.isFinite(config.timeout) ||
        config.timeout < 0 ||
        config.timeout > 2_147_483_647)
    ) {
      throw new PermitError('Permit.checkUrl() timeout must be between 0 and 2147483647 ms.');
    }
    const normalizedUser = isString(user) ? { key: user } : user;
    if (
      normalizedUser === null ||
      typeof normalizedUser !== 'object' ||
      Array.isArray(normalizedUser) ||
      typeof normalizedUser.key !== 'string'
    ) {
      throw new PermitError(
        'Permit.checkUrl() user must be a string or an object with a string key.',
      );
    }
    for (const field of ['email', 'firstName', 'lastName'] as const) {
      if (normalizedUser[field] !== undefined && typeof normalizedUser[field] !== 'string') {
        throw new PermitError(`Permit.checkUrl() user.${field} must be a string.`);
      }
    }
    for (const [field, value] of [
      ['user.attributes', normalizedUser.attributes],
      ['context', config.context],
    ] as const) {
      if (
        value !== undefined &&
        (value === null || typeof value !== 'object' || Array.isArray(value))
      ) {
        throw new PermitError(`Permit.checkUrl() ${field} must be an object.`);
      }
    }
    if (typeof httpMethod !== 'string') {
      throw new PermitError('Permit.checkUrl() httpMethod must be a string.');
    }
    let urlLength = 0;
    if (typeof url === 'string') {
      for (const _character of url) {
        urlLength += 1;
        if (urlLength > 65_536) break;
      }
    }
    if (urlLength < 1 || urlLength > 65_536) {
      throw new PermitError('Permit.checkUrl() URL must contain 1..65536 Unicode characters.');
    }
    try {
      if (/[\\\s\p{Cc}]/u.test(url) || /%(?![0-9A-Fa-f]{2})/u.test(url)) {
        throw new Error('Invalid URI syntax');
      }
      new URL(url);
    } catch {
      throw new PermitError('Permit.checkUrl() URL must be an absolute URI.');
    }
    if (config.tenant !== undefined && typeof config.tenant !== 'string') {
      throw new PermitError('Permit.checkUrl() tenant must be a string.');
    }
    let tenant = config.tenant;
    if (!tenant) {
      if (!this.config.multiTenancy.useDefaultTenantIfEmpty) {
        throw new PermitError(
          'Permit.checkUrl() requires a tenant when default tenancy is disabled.',
        );
      }
      tenant = this.config.multiTenancy.defaultTenant;
    }
    return {
      user: normalizedUser,
      http_method: httpMethod,
      url,
      tenant,
      context: this.contextStore.getDerivedContext(config.context ?? {}),
    };
  }

  private async checkUrlWithExceptions(
    input: ICheckUrlInput,
    config: CheckUrlConfig,
  ): Promise<boolean> {
    const timeout = config.timeout ?? this.config.timeout;
    return await this.client
      .post<unknown>('allowed_url', this.serializeInput(input, 'checkUrl'), {
        headers: { Authorization: `Bearer ${this.config.token}` },
        ...(timeout !== undefined && { timeout }),
      })
      .then((response) => {
        if (response.status !== 200) throw this.pdpStatusError('checkUrl', response);
        return this.parsePdpResponse('checkUrl', response, parseCheckUrlResponse);
      })
      .catch((error: unknown) => this.handlePDPError(error, 'checkUrl'));
  }

  public async check(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context: Context = {}, // context provided specifically for this query
    config: CheckConfig = {},
  ): Promise<boolean> {
    return await this.checkWithExceptions(user, action, resource, context, config).catch((err) => {
      const shouldThrow =
        config.throwOnError === undefined ? this.config.throwOnError : config.throwOnError;
      if (shouldThrow) {
        throw err;
      } else {
        this.logger.error(
          { err: diagnosticCause(err, [this.config.token]) },
          'Permit authorization failed',
        );
        return false;
      }
    });
  }

  //check
  private async checkWithExceptions(
    user: IUser | string,
    action: IAction,
    resource: IResource | string,
    context: Context = {}, // context provided specifically for this query
    config: CheckConfig = {},
  ): Promise<boolean> {
    const checkInput = this.buildCheckInput(user, action, resource, context);
    const input: ICheckOpaInput | ICheckInput = config.useOpa ? { input: checkInput } : checkInput;
    const client = config?.useOpa ? this.opaClient : this.client;
    const path = config?.useOpa ? 'root' : 'allowed';

    const checkTimeout = config.timeout ?? this.config.timeout;

    return await client
      .post<unknown>(path, this.serializeInput(input, 'check'), {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
        },
        ...(checkTimeout !== undefined && { timeout: checkTimeout }),
      })
      .then((response) => {
        if (response.status !== 200) {
          throw this.pdpStatusError('check', response);
        }
        const decision = this.parsePdpResponse('check', response, parseCheckResponse);

        this.logger.info({ operation: 'check', decision }, 'permit.check() succeeded');
        return decision;
      })
      .catch((error: unknown) => {
        return this.handlePDPError(error, 'check');
      });
  }

  private serializeInput(input: unknown, method: string): string {
    try {
      const body = JSON.stringify(input);
      if (typeof body === 'string') return body;
    } catch {
      // JSON errors may contain caller property names; omit the raw exception and request data.
    }
    throw new PermitError(
      `Permit.${method}() input must be JSON-serializable. ` +
        'Remove circular references and unsupported JSON values.',
    );
  }

  private pdpStatusError(
    method: string,
    response: AxiosResponse<unknown>,
    malformedBody = false,
    source?: AxiosError<unknown>,
  ): PermitPDPStatusError {
    const status = diagnosticStatus(response.status);
    const statusLabel = status ?? 'unknown';
    const message =
      method === 'checkUrl' && (status === 404 || status === 405 || status === 501)
        ? `Permit.checkUrl() endpoint /allowed_url is unavailable (status ${status}). ` +
          'Configure a compatible Permit container PDP; the cloud PDP contract does not publish ' +
          'this endpoint.'
        : method === 'getUserTenants' && status === 404
          ? 'Permit.getUserTenants() endpoint /user-tenants is unavailable (status 404). ' +
            'Configure a compatible Permit container PDP; the cloud PDP contract does not publish ' +
            'this endpoint.'
          : malformedBody
            ? `Permit.${method}() got an unexpected response body from the PDP ` +
              `(status ${statusLabel}), please check that the SDK's pdp URL points to a Permit ` +
              'PDP. Read more about setting up the PDP at https://docs.permit.io'
            : `Permit.${method}() got an unexpected status code: ${statusLabel}, ` +
              'please check your SDK init and make sure the PDP sidecar is configured correctly. ' +
              'Read more about setting up the PDP at https://docs.permit.io';
    const snapshot = diagnosticAxiosError(
      source ?? new AxiosError(message, undefined, response.config, undefined, response),
      [this.config.token],
    );
    return new PermitPDPStatusError(message, status, snapshot.response?.data, {
      cause: snapshot,
    });
  }

  /**
   * Reads the body of a successful PDP response. The PDP was reachable, so a body without the
   * expected shape is reported as a {@link PermitPDPStatusError}, not as a connection failure.
   */
  private parsePdpResponse<R>(
    method: string,
    response: AxiosResponse<unknown>,
    parse: (data: unknown) => R,
  ): R {
    try {
      return parse(response.data);
    } catch {
      throw this.pdpStatusError(method, response, true);
    }
  }

  private handlePDPError(error: unknown, method: string): never {
    let failure: PermitConnectionError;
    if (error instanceof PermitPDPStatusError) {
      failure = error;
    } else if (axios.isAxiosError<unknown>(error) && error.response) {
      failure = this.pdpStatusError(method, error.response, false, error);
    } else {
      const privacy = diagnosticErrorSecrets(error, [this.config.token]);
      const cause = axios.isAxiosError<unknown>(error)
        ? diagnosticAxiosError(error, [this.config.token])
        : diagnosticCause(error, [this.config.token]);
      failure = new PermitConnectionError(
        `Permit SDK got error: ${cause.message} and cannot connect to the PDP. ` +
          `Check your configuration and make sure the PDP is running at ${diagnosticUrl(this.config.pdp, privacy)} ` +
          'and accepting requests. Read more about setting up the PDP at https://docs.permit.io',
        { cause },
      );
    }
    this.logger.error({ err: failure, operation: method }, `permit.${method}() failed`);
    throw failure;
  }

  // TODO: remove this eventually, once we decide on finalized structure of AuthzQuery
  private normalizeResource(resource: IResource): IResource {
    const normalizedResource: IResource = { ...resource };

    // if tenant is empty, we might auto-set the default tenant according to config
    if (!normalizedResource.tenant && this.config.multiTenancy.useDefaultTenantIfEmpty) {
      normalizedResource.tenant = this.config.multiTenancy.defaultTenant;
    }

    return normalizedResource;
  }

  private static resourceFromString(resource: string): IResource {
    const parts = resource.split(RESOURCE_DELIMITER);
    const [type, key] = parts;
    if (type === undefined || parts.length > 2) {
      throw new PermitError('Invalid resource string: expected a resource type or type:key.');
    }
    return {
      type,
      ...(key !== undefined && { key }),
    };
  }
}
