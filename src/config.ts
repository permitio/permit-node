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
  log: ILoggerConfig;
  checkTimeout: number | undefined;
  multiTenancy: IMultiTenancyConfig; // todo: check this
  checkThrowOnError: boolean | undefined;
  project?: string;
  environment?: string;
}

// returns a config
export class ConfigFactory {
  static defaults(): IPermitConfig {
    return {
      token: _.get(process.env, 'AUTHZ_LOG_LEVEL', ''),
      pdp: _.get(process.env, 'AUTHZ_PDP_URL', 'http://localhost:7000'),
      log: {
        // Log level (debug mode sets default to "debug" otherwise 'info')
        level: _.get(process.env, 'AUTHZ_LOG_LEVEL', 'warn'),
        // Label added to logs
        label: _.get(process.env, 'AUTHZ_LOG_LABEL', 'Permit.io'),
        // When logging - dump full data to console as JSON
        json: JSON.parse(_.get(process.env, 'AUTHZ_LOG_JSON', 'false')),
      },
      multiTenancy: {
        defaultTenant: 'default',
        useDefaultTenantIfEmpty: true,
      },
      checkTimeout: undefined,
      checkThrowOnError: undefined,
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
