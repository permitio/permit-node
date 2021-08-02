import util from 'util';

import winston from 'winston';

import { config } from './config';

export function prettyConsoleLog(label: string, data: any) {
  console.log(label, util.inspect(data, false, 12, true));
}

const consoleFormat = winston.format.printf(
  ({ level, message, label, timestamp }) => {
    return `${timestamp} [${label}] ${level}: ${message}`;
  }
);

export const logger = winston.createLogger({
  level: config.log.level,
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console({
      // If not in debug - show nothing in console
      silent: !config.debugMode,
      format: winston.format.combine(
        winston.format.label({ label: config.log.label }),
        winston.format.timestamp(),
        config.log.json ? winston.format.prettyPrint() : consoleFormat,
        winston.format.colorize({ all: true })
      ),
    }),
  ],
});
