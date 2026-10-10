import util from 'util';

import pino from 'pino';
import pretty from 'pino-pretty';

import { type IPermitConfig } from '#src/config';
import { diagnosticBody, diagnosticText } from '#src/utils/diagnostics';

export function prettyConsoleLog(label: string, data: unknown) {
  console.log(diagnosticText(label), util.inspect(diagnosticBody(data), false, 4, true));
}

export class LoggerFactory {
  static createLogger(config: IPermitConfig): pino.Logger {
    const options = {
      level: config.log.level,
      base: { label: diagnosticText(config.log.label, [config.token]) },
      timestamp: pino.stdTimeFunctions.isoTime,
    };
    return config.log.json
      ? pino(options)
      : pino(options, pretty({ levelFirst: true, sync: true }));
  }
}
