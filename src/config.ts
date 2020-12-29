import _ from 'lodash';

const isDebug = JSON.parse(_.get(process.env, 'AUTHZ_DEBUG_MODE', 'false'));

export const config = {
  // Log level (debug mode sets default to "debug" otherwise 'info')
  logLevel: _.get(process.env, 'AUTHZ_LOG_LEVEL', isDebug ? 'debug' : 'info'),
  // Label added to logs
  logLabel: _.get(process.env, 'AUTHZ_LOG_LABEL', 'AUTHORIZON'),
  // When logging - dump full data to console as JSON
  logJSON: JSON.parse(_.get(process.env, 'AUTHZ_LOG_JSON', 'false')),
  // Set debug mode- log to console
  isDebug: isDebug,
  // Should the module automatically plugin to map frameworks on load
  autoMapping: JSON.parse(_.get(process.env, 'AUTHZ_AUTO_MAPPING', 'true')),
  sidecarUrl: _.get(process.env, 'AUTHZ_SIDECAR_URL', 'http://localhost:7000'),
};
