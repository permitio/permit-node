import _ from 'lodash';

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

export interface IAuthorizonConfig {
  token: string;
  sidecarUrl: string;
  debugMode: boolean;
  log: ILoggerConfig;
  autoMapping: IAutoMappingConfig;
}

// returns a config
export class ConfigFactory {
  static defaults(): IAuthorizonConfig {
    const debugMode: boolean = JSON.parse(_.get(process.env, 'AUTHZ_DEBUG_MODE', 'false'));
    return {
      token: _.get(process.env, 'AUTHZ_LOG_LEVEL', ''),
      sidecarUrl: _.get(process.env, 'AUTHZ_SIDECAR_URL', 'http://localhost:7000'),
      // Sets debug mode - log to console
      debugMode: debugMode,
      log: {
        // Log level (debug mode sets default to "debug" otherwise 'info')
        level: _.get(process.env, 'AUTHZ_LOG_LEVEL', debugMode ? 'debug' : 'info'),
        // Label added to logs
        label: _.get(process.env, 'AUTHZ_LOG_LABEL', 'AUTHORIZON'),
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
        ignoredUrlPrefixes: _.get(process.env, 'AUTHZ_AUTO_MAPPING_IGNORED_PREFIXES', '').split(",").filter(prefix => prefix.length > 0),
        // Print review and do nothing active
        reviewMode: JSON.parse(_.get(process.env, 'AUTHZ_REVIEW_MODE', 'false')),
      }
    };
  }

  /**
   * Returns a valid config, for unset values returns the default config
   * @param options - a partial configuration
   * @returns
   */
  static build(options: Partial<IAuthorizonConfig>): IAuthorizonConfig {
    const config = _.extend(_.assign({}, ConfigFactory.defaults()), options);

    // if no log level was set manually, but debug mode is set, we fix the default log level
    if ((!options.log?.level) && (options.debugMode !== undefined)) {
      config.log.level = options.debugMode ? 'debug' : 'info';
    }

    return config;
  }
}
