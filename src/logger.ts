import util from 'util';

import pino from 'pino';

import { IPermitConfig } from './config';

export function prettyConsoleLog(label: string, data: any) {
  console.log(label, util.inspect(data, false, 12, true));
}

const FgGreen = '\x1b[32m';
const FgCyan = '\x1b[36m';
// const COLOR_RESET: string = "\x1b[0m";
// const FgBlack: string = "\x1b[30m";
// const FgRed: string = "\x1b[31m";
// const FgYellow: string = "\x1b[33m";
// const FgBlue: string = "\x1b[34m";
// const FgMagenta: string = "\x1b[35m";
// const FgWhite: string = "\x1b[37m";

const MESSAGE = Symbol.for('message');
const LEVEL = Symbol.for('level');

export class LoggerFactory {
  static createLogger(config: IPermitConfig): pino.Logger {
    const logger = pino({
      level: config.log.level,
      prettyPrint: config.log.json ? { colorize: true } : false,
      base: { label: config.log.label },
    });
    return logger;
  }
}
