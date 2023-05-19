import globalAxios, { AxiosInstance } from 'axios';
import _ from 'lodash';

import { ApiContext } from './api/context';
import { RecursivePartial } from './utils/types';

interface ILoggerConfig {
  level: string;
  label: string;
  json: boolean;
}

interface IMultiTenancyConfig {
  // the key of the default tenant
  defaultTenant: string;
  // whether or not the SDK should replace an empty tenant with the default tenant
  useDefaultTenantIfEmpty: boolean;
}

export interface IPermitConfig {
  token: string;
  pdp: string;
  apiUrl: string;
  log: ILoggerConfig;
  multiTenancy: IMultiTenancyConfig;
  timeout: number | undefined;
  throwOnError: boolean | undefined;
  apiContext: ApiContext;
  axiosInstance: AxiosInstance;
}

// returns a config
export class ConfigFactory {
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
        json: JSON.parse(_.get(process.env, 'PERMIT_LOG_JSON', 'false')),
      },
      multiTenancy: {
        defaultTenant: 'default',
        useDefaultTenantIfEmpty: true,
      },
      timeout: undefined,
      throwOnError: true,
      apiContext: new ApiContext(),
      axiosInstance: globalAxios,
    };
  }

  /**
   * Returns a valid config, for unset values returns the default config
   * @param options - a partial configuration
   * @returns
   */
  static build(options: RecursivePartial<IPermitConfig>): IPermitConfig {
    const config = _.merge(_.assign({}, ConfigFactory.defaults()), options);
    return config;
  }
}
