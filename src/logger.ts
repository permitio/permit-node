import util from 'util';

import pino from 'pino';

import { IPermitConfig } from './config';

export function prettyConsoleLog(label: string, data: any) {
  console.log(label, util.inspect(data, false, 12, true));
}

export class LoggerFactory {
  static createLogger(config: IPermitConfig): pino.Logger {
    // pino 8 has no prettyPrint option and throws on a truthy one, so `log.json` no longer
    // reaches pino: the output is JSON whatever it says, as it already was by default.
    return pino({
      level: config.log.level,
      base: { label: config.log.label },
      timestamp: pino.stdTimeFunctions.isoTime,
      // A backstop for a credential that a log call passes in an object.
      redact: {
        paths: [
          'token',
          '*.token',
          'headers.Authorization',
          'headers.authorization',
          '*.headers.Authorization',
          '*.headers.authorization',
        ],
        censor: '[REDACTED]',
      },
    });
  }
}
