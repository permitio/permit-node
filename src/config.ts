import globalAxios, { type AxiosInstance } from 'axios';
import { ApiContext, snapshotApiContext } from '#src/api/context';
import { type IRetryConfig, resolveRetryConfig } from '#src/utils/retry';

export type FactsSyncTimeoutPolicy = 'ignore' | 'fail';

interface ILoggerConfig {
  /**
   * Sets the log level configured for the Permit SDK Logger.
   */
  level: string;

  /**
   * Sets the label configured for logs emitted by the Permit SDK Logger.
   */
  label: string;

  /**
   * Sets whether the SDK log output should be in JSON format.
   */
  json: boolean;
}

interface IMultiTenancyConfig {
  /**
   * the key of the default tenant to be used if {@link useDefaultTenantIfEmpty} is set.
   */
  defaultTenant: string;

  /**
   * whether or not the SDK should automatically associate a resource with the {@link defaultTenant}
   * if the resource provided in permit.check() was not associated with a tenant (i.e: undefined tenant).
   */
  useDefaultTenantIfEmpty: boolean;
}

export interface IPermitConfig {
  /**
   * The token (API Key) used for authorization against the PDP and the Permit REST API.
   */
  readonly token: string;

  /**
   * Configures the Policy Decision Point (PDP) address.
   */
  readonly pdp: string;

  /**
   * Configures the URL of the Permit REST API.
   */
  readonly apiUrl: string;

  /**
   * the logger configuration used by the SDK, @see {@link ILoggerConfig}
   */
  readonly log: Readonly<ILoggerConfig>;

  /**
   * @see: {@link IMultiTenancyConfig}
   */
  readonly multiTenancy: Readonly<IMultiTenancyConfig>;

  /**
   * PDP/OPA request timeout in milliseconds; 0 disables it. REST and Elements use
   * the supplied Axios instance timeout instead. When retries are enabled,
   * failed attempts and backoff consume one shared timeout budget. Each retry receives
   * the remaining Axios timeout. Caller adapters must honor it; arbitrary caller hooks
   * are not interrupted. When omitted, supplied transport timeout defaults are preserved.
   */
  readonly timeout: number | undefined;

  /**
   * whether or not permit.check() will throw on error, or return a default denied decision.
   */
  readonly throwOnError: boolean | undefined;

  /**
   * represents the current API key authorization level.
   * @see {@link ApiContext}
   */
  readonly apiContext: ApiContext;

  /**
   * an optional custom axios instance, to control the behavior of the HTTP client
   * used to connect to the Permit REST API.
   *
   * This instance applies to REST and Elements only. The SDK delegates each attempt
   * through its current adapters, transforms and interceptors without changing defaults
   * or installing handlers. SDK routes and Bearer tokens override transport defaults.
   * SDK requests explicitly set allowAbsoluteUrls:true so caller base URLs cannot prefix
   * an SDK destination. Direct caller requests retain the caller's own setting.
   * SDK retry/logging policies stay private; caller-owned retries and redirects remain
   * the caller's responsibility. PDP uses an internal transport; OPA has its own option.
   *
   * @see https://axios-http.com/docs/instance
   * @see https://axios-http.com/docs/req_config
   */
  readonly axiosInstance: AxiosInstance;
  /**
   * Create facts via the PDP API instead of using the default Permit REST API.
   */
  readonly proxyFactsViaPdp: boolean;
  /**
   * The amount of time in seconds to wait for facts to be available
   * in the PDP cache before returning the response.
   */
  readonly factsSyncTimeout: number | null;
  /**
   * Controls what happens when the facts synchronization timeout is reached during proxy requests to the PDP.
   * - 'ignore': Respond immediately when data update did not apply within the timeout period
   * - 'fail': Respond with 424 status code when data update did not apply within the timeout period
   */
  readonly factsSyncTimeoutPolicy: FactsSyncTimeoutPolicy | null;
  /**
   * an optional custom axios instance for OPA, to control the behavior of the HTTP
   * client used to connect to OPA. This applies to OPA calls only and is separate
   * from `axiosInstance` (REST API) and the dedicated internal PDP instance.
   * Its defaults and interceptors remain unchanged. SDK routing, headers and retry policy
   * are applied privately; intentional caller hooks still run for each attempt.
   *
   * @see https://axios-http.com/docs/instance
   * @see https://axios-http.com/docs/req_config
   */
  readonly opaAxiosInstance?: AxiosInstance;

  /**
   * Configuration for automatic retry of failed requests.
   * Retries are opt-in: when omitted or set to false, retries are disabled.
   * Providing a config object enables them (3 retries with exponential backoff
   * by default).
   *
   * @see {@link IRetryConfig}
   */
  readonly retry?: Readonly<IRetryConfig> | false;

  /**
   * Optional separate retry configuration for PDP (enforcement) calls.
   * If not provided, uses the main `retry` configuration.
   * Set to false to disable retries for PDP calls only.
   *
   * @see {@link IRetryConfig}
   */
  readonly pdpRetry?: Readonly<IRetryConfig> | false;
}

/** Constructor options; supplied clients and callbacks retain their complete public types. */
export interface IPermitOptions {
  token?: string | undefined;
  pdp?: string | undefined;
  apiUrl?: string | undefined;
  log?: Partial<ILoggerConfig> | undefined;
  multiTenancy?: Partial<IMultiTenancyConfig> | undefined;
  timeout?: number | undefined;
  throwOnError?: boolean | undefined;
  /** Initial permissions and selection are copied; edit permit.config.apiContext afterward. */
  apiContext?: ApiContext | undefined;
  axiosInstance?: AxiosInstance | undefined;
  proxyFactsViaPdp?: boolean | undefined;
  factsSyncTimeout?: number | null | undefined;
  factsSyncTimeoutPolicy?: FactsSyncTimeoutPolicy | null | undefined;
  opaAxiosInstance?: AxiosInstance | undefined;
  retry?: IRetryConfig | false | undefined;
  pdpRetry?: IRetryConfig | false | undefined;
}

/**
 * Reads PERMIT_LOG_JSON, ignoring letter case and surrounding whitespace. Only `false` selects
 * pretty output: `true`, an unset variable and unrecognized values all keep the JSON default.
 */
function logJsonFromEnv(): boolean {
  return process.env['PERMIT_LOG_JSON']?.trim().toLowerCase() !== 'false';
}

/**
 * A factory class for the Permit SDK configuration
 */
export class ConfigFactory {
  /**
   * @returns the default SDK configuration
   */
  static defaults(): IPermitConfig {
    return {
      ...defaultSettings(),
      apiContext: new ApiContext(),
      axiosInstance: globalAxios.create(),
    };
  }

  /**
   * Builds the Permit SDK configuration from the values provided by the SDK user
   * and from the default SDK configuration when no specific values are set.
   *
   * @param options - Constructor options, using environment/default values when omitted.
   * @returns Frozen SDK-owned settings with a mutable SDK-owned API context.
   * @throws TypeError When an effective option is invalid; errors never echo caller values.
   */
  static build(options: IPermitOptions): IPermitConfig {
    objectOption(options, 'options');
    if (options.log !== undefined) objectOption(options.log, 'log');
    if (options.multiTenancy !== undefined) objectOption(options.multiTenancy, 'multiTenancy');
    const defaults = defaultSettings();
    const settings = {
      token: options.token ?? defaults.token,
      pdp: options.pdp ?? defaults.pdp,
      apiUrl: options.apiUrl ?? defaults.apiUrl,
      log: { ...defaults.log, ...options.log },
      multiTenancy: { ...defaults.multiTenancy, ...options.multiTenancy },
      timeout: options.timeout,
      throwOnError: options.throwOnError ?? defaults.throwOnError,
      proxyFactsViaPdp: options.proxyFactsViaPdp ?? defaults.proxyFactsViaPdp,
      factsSyncTimeout: options.factsSyncTimeout ?? defaults.factsSyncTimeout,
      factsSyncTimeoutPolicy: options.factsSyncTimeoutPolicy ?? defaults.factsSyncTimeoutPolicy,
    };
    // Check the supplied values as well as the effective defaults, so null cannot hide behind ??.
    for (const key of ['token', 'pdp', 'apiUrl'] as const) {
      if (options[key] !== undefined) stringOption(options[key], key, true);
    }
    stringOption(settings.token, 'token', true);
    if (/[\s\p{Cc}]/u.test(settings.token)) {
      throw new TypeError(
        'Invalid token: API keys must not contain whitespace or control characters.',
      );
    }
    urlOption(settings.pdp, 'pdp');
    urlOption(settings.apiUrl, 'apiUrl');
    stringOption(settings.log.level, 'log.level', true);
    if (
      !['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(settings.log.level)
    ) {
      throw new TypeError(
        'Invalid log.level: use fatal, error, warn, info, debug, trace or silent.',
      );
    }
    stringOption(settings.log.label, 'log.label', false);
    booleanOption(settings.log.json, 'log.json');
    stringOption(settings.multiTenancy.defaultTenant, 'multiTenancy.defaultTenant', true);
    booleanOption(
      settings.multiTenancy.useDefaultTenantIfEmpty,
      'multiTenancy.useDefaultTenantIfEmpty',
    );
    for (const key of ['throwOnError', 'proxyFactsViaPdp'] as const) {
      if (options[key] !== undefined) booleanOption(options[key], key);
      booleanOption(settings[key], key);
    }
    if (settings.timeout !== undefined) {
      nonnegativeOption(settings.timeout, 'timeout', 2_147_483_647);
    }
    if (settings.factsSyncTimeout !== null)
      nonnegativeOption(settings.factsSyncTimeout, 'factsSyncTimeout');
    if (
      settings.factsSyncTimeoutPolicy !== null &&
      !['ignore', 'fail'].includes(settings.factsSyncTimeoutPolicy)
    ) {
      throw new TypeError('Invalid factsSyncTimeoutPolicy: use ignore, fail or null.');
    }
    if (options.axiosInstance !== undefined) axiosOption(options.axiosInstance, 'axiosInstance');
    if (options.opaAxiosInstance !== undefined)
      axiosOption(options.opaAxiosInstance, 'opaAxiosInstance');
    const retry = snapshotRetry(options.retry);
    const pdpRetry = snapshotRetry(options.pdpRetry);
    const apiContext =
      options.apiContext === undefined ? new ApiContext() : snapshotApiContext(options.apiContext);
    return Object.freeze({
      ...settings,
      log: Object.freeze(settings.log),
      multiTenancy: Object.freeze(settings.multiTenancy),
      apiContext,
      axiosInstance: options.axiosInstance ?? globalAxios.create(),
      ...(options.opaAxiosInstance !== undefined && { opaAxiosInstance: options.opaAxiosInstance }),
      ...(retry !== undefined && { retry }),
      ...(pdpRetry !== undefined && { pdpRetry }),
    });
  }
}

function defaultSettings() {
  return {
    token: process.env['PERMIT_API_KEY'] ?? '',
    pdp: process.env['PERMIT_PDP_URL'] ?? 'http://localhost:7766',
    apiUrl: process.env['PERMIT_API_URL'] ?? 'https://api.permit.io',
    log: {
      level: process.env['PERMIT_LOG_LEVEL'] ?? 'warn',
      label: process.env['PERMIT_LOG_LABEL'] ?? 'Permit.io',
      json: logJsonFromEnv(),
    },
    multiTenancy: { defaultTenant: 'default', useDefaultTenantIfEmpty: true },
    timeout: undefined,
    throwOnError: true,
    proxyFactsViaPdp: false,
    factsSyncTimeout: null,
    factsSyncTimeoutPolicy: null,
  };
}

function objectOption(value: unknown, name: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Invalid ${name}: expected an options object.`);
  }
}

function stringOption(value: unknown, name: string, nonempty: boolean): void {
  if (typeof value !== 'string' || (nonempty && value.trim().length === 0)) {
    throw new TypeError(`Invalid ${name}: expected ${nonempty ? 'a nonempty' : 'a'} string.`);
  }
}

function booleanOption(value: unknown, name: string): void {
  if (typeof value !== 'boolean') throw new TypeError(`Invalid ${name}: expected a boolean.`);
}

function nonnegativeOption(value: unknown, name: string, maximum = Number.MAX_VALUE): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new TypeError(
      `Invalid ${name}: expected a finite nonnegative number no greater than ${maximum}.`,
    );
  }
}

function urlOption(value: string, name: string): void {
  try {
    const url = new URL(value);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !/[\s\p{Cc}]/u.test(value))
      return;
  } catch {
    // Report the option name without retaining an exception that may contain credentials.
  }
  throw new TypeError(`Invalid ${name}: expected an absolute http(s) URL.`);
}

function axiosOption(value: unknown, name: string): void {
  if (typeof value === 'function') {
    const methods = [
      'request',
      'getUri',
      'get',
      'delete',
      'head',
      'options',
      'post',
      'put',
      'patch',
      'postForm',
      'putForm',
      'patchForm',
    ];
    const defaults: unknown = Reflect.get(value, 'defaults');
    const interceptors: unknown = Reflect.get(value, 'interceptors');
    if (
      methods.every((method) => typeof Reflect.get(value, method) === 'function') &&
      defaults !== null &&
      typeof defaults === 'object' &&
      interceptors !== null &&
      typeof interceptors === 'object' &&
      ['request', 'response'].every((kind) => {
        const manager: unknown = Reflect.get(interceptors, kind);
        return (
          manager !== null &&
          typeof manager === 'object' &&
          ['use', 'eject', 'clear'].every(
            (method) => typeof Reflect.get(manager, method) === 'function',
          )
        );
      })
    )
      return;
  }
  throw new TypeError(
    `Invalid ${name}: expected a complete Axios instance created with axios.create().`,
  );
}

function snapshotRetry(
  value: IRetryConfig | false | undefined,
): Readonly<IRetryConfig> | false | undefined {
  resolveRetryConfig(value);
  if (value === false || value === undefined) return value;
  return Object.freeze({
    ...value,
    ...(value.retryMethods !== undefined && {
      retryMethods: Object.freeze([...value.retryMethods]),
    }),
  });
}
