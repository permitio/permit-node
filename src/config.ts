import globalAxios, { type AxiosInstance } from 'axios';
import _ from 'lodash';

import { ApiContext } from '#src/api/context';
import { type IRetryConfig } from '#src/utils/retry';
import { type RecursivePartial } from '#src/utils/types';

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
  token: string;

  /**
   * Configures the Policy Decision Point (PDP) address.
   */
  pdp: string;

  /**
   * Configures the URL of the Permit REST API.
   */
  apiUrl: string;

  /**
   * the logger configuration used by the SDK, @see {@link ILoggerConfig}
   */
  log: ILoggerConfig;

  /**
   * @see: {@link IMultiTenancyConfig}
   */
  multiTenancy: IMultiTenancyConfig;

  /**
   * PDP/OPA request timeout in milliseconds; 0 disables it. REST and Elements use
   * the supplied Axios instance timeout instead. When retries are enabled,
   * failed attempts and backoff consume one shared timeout budget. Each retry receives
   * the remaining Axios timeout. Caller adapters must honor it; arbitrary caller hooks
   * are not interrupted. When omitted, supplied transport timeout defaults are preserved.
   */
  timeout: number | undefined;

  /**
   * whether or not permit.check() will throw on error, or return a default denied decision.
   */
  throwOnError: boolean | undefined;

  /**
   * represents the current API key authorization level.
   * @see {@link ApiContext}
   */
  apiContext: ApiContext;

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
  axiosInstance: AxiosInstance;
  /**
   * Create facts via the PDP API instead of using the default Permit REST API.
   */
  proxyFactsViaPdp: boolean;
  /**
   * The amount of time in seconds to wait for facts to be available
   * in the PDP cache before returning the response.
   */
  factsSyncTimeout: number | null;
  /**
   * Controls what happens when the facts synchronization timeout is reached during proxy requests to the PDP.
   * - 'ignore': Respond immediately when data update did not apply within the timeout period
   * - 'fail': Respond with 424 status code when data update did not apply within the timeout period
   */
  factsSyncTimeoutPolicy: FactsSyncTimeoutPolicy | null;
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
  opaAxiosInstance?: AxiosInstance;

  /**
   * Configuration for automatic retry of failed requests.
   * Retries are opt-in: when omitted or set to false, retries are disabled.
   * Providing a config object enables them (3 retries with exponential backoff
   * by default).
   *
   * @see {@link IRetryConfig}
   */
  retry?: IRetryConfig | false;

  /**
   * Optional separate retry configuration for PDP (enforcement) calls.
   * If not provided, uses the main `retry` configuration.
   * Set to false to disable retries for PDP calls only.
   *
   * @see {@link IRetryConfig}
   */
  pdpRetry?: IRetryConfig | false;
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
      token: _.get(process.env, 'PERMIT_API_KEY', ''),
      pdp: _.get(process.env, 'PERMIT_PDP_URL', 'http://localhost:7766'),
      apiUrl: _.get(process.env, 'PERMIT_API_URL', 'https://api.permit.io'),
      log: {
        // log level, default is warn (warnings and errors)
        level: _.get(process.env, 'PERMIT_LOG_LEVEL', 'warn'),
        // Label added to logs
        label: _.get(process.env, 'PERMIT_LOG_LABEL', 'Permit.io'),
        // When logging - dump full data to console as JSON
        json: logJsonFromEnv(),
      },
      multiTenancy: {
        defaultTenant: 'default',
        useDefaultTenantIfEmpty: true,
      },
      timeout: undefined,
      throwOnError: true,
      apiContext: new ApiContext(),
      axiosInstance: globalAxios.create(),
      proxyFactsViaPdp: false,
      factsSyncTimeout: null,
      factsSyncTimeoutPolicy: null,
    };
  }

  /**
   * Builds the Permit SDK configuration from the values provided by the SDK user
   * and from the default SDK configuration when no specific values are set.
   *
   * @param options - a partial configuration
   * @returns the SDK configuration (for unset values returns the default config)
   */
  static build(options: RecursivePartial<IPermitConfig>): IPermitConfig {
    const config = _.merge(_.assign({}, ConfigFactory.defaults()), options);
    return config;
  }
}
