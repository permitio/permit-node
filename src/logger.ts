import util from 'util';

import pino from 'pino';

import { IPermitConfig } from './config.js';

export function prettyConsoleLog(label: string, data: any) {
  console.log(label, util.inspect(data, false, 12, true));
}

export class LoggerFactory {
  static createLogger(config: IPermitConfig): pino.Logger {
    return pino({
      level: config.log.level,
      prettyPrint: config.log.json ? { levelFirst: true } : false,
      base: { label: config.log.label },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }
}
