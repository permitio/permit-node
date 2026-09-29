import util from 'util';

import pino from 'pino';
import pretty from 'pino-pretty';

import { IPermitConfig } from './config';

export function prettyConsoleLog(label: string, data: any) {
  console.log(label, util.inspect(data, false, 12, true));
}

export class LoggerFactory {
  static createLogger(config: IPermitConfig): pino.Logger {
    const options = {
      level: config.log.level,
      base: { label: config.log.label },
      timestamp: pino.stdTimeFunctions.isoTime,
    };
    return config.log.json
      ? pino(options)
      : pino(options, pretty({ levelFirst: true, sync: true }));
  }
}
