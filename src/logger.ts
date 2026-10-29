import util from 'util';

import axios from 'axios';
import pino from 'pino';

import { IPermitConfig } from './config';
import { redactUrl } from './utils/redact-url';

export function prettyConsoleLog(label: string, data: any) {
  console.log(label, util.inspect(data, false, 12, true));
}

// pino's standard error serializer copies every field of an error, and an axios error's
// config, request and response hold the Authorization header (the request even as raw
// header text). An axios error is logged as what identifies the failure, and nothing else.
export function serializeError(error: unknown): unknown {
  if (axios.isAxiosError(error)) {
    return {
      type: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      method: error.config?.method?.toUpperCase(),
      url: error.config?.url === undefined ? undefined : redactUrl(error.config.url),
    };
  }
  // Any other error is copied field by field. Node's ERR_INVALID_URL, which axios rejects with
  // for a URL it can't parse, carries that whole URL in `input`.
  const serialized = pino.stdSerializers.err(error as Error);
  if (typeof serialized?.input === 'string') {
    serialized.input = redactUrl(serialized.input);
  }
  return serialized;
}

export class LoggerFactory {
  // `destination` defaults to stdout, as before; tests pass a stream to read the output.
  static createLogger(config: IPermitConfig, destination?: pino.DestinationStream): pino.Logger {
    const options: pino.LoggerOptions = {
      level: config.log.level,
      base: { label: config.log.label },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: { err: serializeError },
      // A backstop for a credential that a log call passes in an object: a `token` field, or
      // an `Authorization` / `authorization` header in a `headers` field, at the top level of
      // that object or one level down. fast-redact has no recursive wildcard, so deeper fields
      // and other spellings aren't covered; errors go through `serializeError` instead.
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
    };
    // pino 8 has no prettyPrint option and throws on a truthy one, so `log.json` no longer
    // reaches pino: the output is JSON whatever it says, as it already was by default.
    return destination ? pino(options, destination) : pino(options);
  }
}
