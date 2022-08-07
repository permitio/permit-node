import _ from 'lodash';

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
}

// returns a config
export class ConfigFactory {
  static defaults(): IPermitConfig {
    return {
      token: _.get(process.env, 'PERMIT_API_KEY', ''),
      pdp: _.get(process.env, 'PERMIT_PDP_URL', 'http://localhost:7000'),
      apiUrl: _.get(process.env, 'PERMIT_API_URL', 'https://api-v2-prod.permit.io'),
      log: {
        // Log level (debug mode sets default to "debug" otherwise 'info')
        level: _.get(process.env, 'PERMIT_LOG_LEVEL', 'info'),
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
      throwOnError: undefined,
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
