import _ from 'lodash';

import { RecursivePartial } from './utils/types';

interface ILoggerConfig {
  level: string;
  label: string;
  json: boolean;
}

interface IAutoMappingConfig {
  // Should the module automatically plugin to map REST frameworks on load
  enable: boolean;
  // if auto mapping is on, ignore these prefixes when analyzing paths
  ignoredUrlPrefixes: string[];
  // Print review and do nothing active
  reviewMode: boolean;
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
  autoMapping: IAutoMappingConfig;
  multiTenancy: IMultiTenancyConfig;
  timeout: number;
}

// returns a config
export class ConfigFactory {
  static defaults(): IPermitConfig {
    return {
      token: _.get(process.env, 'AUTHZ_LOG_LEVEL', ''),
      pdp: _.get(process.env, 'AUTHZ_PDP_URL', 'http://localhost:7000'),
      log: {
        // Log level (debug mode sets default to "debug" otherwise 'info')
        level: _.get(process.env, 'AUTHZ_LOG_LEVEL', 'warning'),
        // Label added to logs
        label: _.get(process.env, 'AUTHZ_LOG_LABEL', 'Permit.io'),
        // When logging - dump full data to console as JSON
        json: JSON.parse(_.get(process.env, 'AUTHZ_LOG_JSON', 'false')),
      },
      autoMapping: {
        // Should the module automatically plugin to map frameworks on load
        enable: JSON.parse(_.get(process.env, 'AUTHZ_AUTO_MAPPING', 'false')),
        // if auto mapping is on, ignore these prefixes when analyzing paths
        // expects a comma separated list, example valid values:
        // AUTHZ_AUTO_MAPPING_IGNORED_PREFIXES=/v1
        // AUTHZ_AUTO_MAPPING_IGNORED_PREFIXES=/v1,/ignored
        ignoredUrlPrefixes: _.get(process.env, 'AUTHZ_AUTO_MAPPING_IGNORED_PREFIXES', '')
          .split(',')
          .filter((prefix) => prefix.length > 0),
        // Print review and do nothing active
        reviewMode: JSON.parse(_.get(process.env, 'AUTHZ_REVIEW_MODE', 'false')),
      },
      multiTenancy: {
        defaultTenant: 'default',
        useDefaultTenantIfEmpty: true,
      },
      timeout: 0,
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
