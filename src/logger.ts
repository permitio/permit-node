import util from 'util';

import winston from 'winston';

import { IPermitConfig } from './config';

export function prettyConsoleLog(label: string, data: any) {
  console.log(label, util.inspect(data, false, 12, true));
}

const FgGreen = '\x1b[32m';
const FgCyan = '\x1b[36m';
// const COLOR_RESET: string = '\x1b[0m';
// const FgBlack: string = "\x1b[30m";
// const FgRed: string = "\x1b[31m";
// const FgYellow: string = "\x1b[33m";
// const FgBlue: string = "\x1b[34m";
// const FgMagenta: string = "\x1b[35m";
const FgWhite = '\x1b[37m';

const consoleFormat = winston.format.printf(({ level, message, label }) => {
  return `${FgCyan}${label} ${FgGreen}[${level}]${FgWhite}: ${message}`;
});

const MESSAGE = Symbol.for('message');
const LEVEL = Symbol.for('level');

class SimpleConsoleTransport extends winston.transports.Console {
  log(info: any, callback: any): void {
    setImmediate(() => this.emit('logged', info));

    if (this.stderrLevels[info[LEVEL]]) {
      console.error(info[MESSAGE]);
    } else {
      console.log(info[MESSAGE]);
    }

    if (callback) {
      callback();
    }
  }
}

export class LoggerFactory {
  static createLogger(config: IPermitConfig): winston.Logger {
    return winston.createLogger({
      level: config.log.level,
      format: winston.format.simple(),
      transports: [
        new SimpleConsoleTransport({
          format: winston.format.combine(
            winston.format.label({ label: config.log.label }),
            winston.format.timestamp(),
            config.log.json ? winston.format.prettyPrint() : consoleFormat,
            winston.format.colorize({ all: true }),
          ),
        }),
      ],
    });
  }
}
