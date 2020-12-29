import _ from 'lodash';

export const config = {
  //
  logLevel: _.get(process.env, 'LOG_LEVEL', 'info'),
  isDebug: JSON.parse(_.get(process.env, 'DEBUG_MODE', 'false')),
  autoMapping: JSON.parse(_.get(process.env, 'AUTO_MAPPING', 'true')),
};
