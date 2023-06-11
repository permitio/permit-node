import { ExecutionContext } from 'ava';
import winston from 'winston';

import { IPermitClient, Permit, PermitApiError } from '../index';
import { LoggerFactory } from '../logger';

export type TestContext = { permit: IPermitClient; logger: winston.Logger };

export const printBreak = () => {
  console.log('\n\n ----------- \n\n');
};

export function handleApiError(
  error: PermitApiError<any>,
  message: string,
  t: ExecutionContext<TestContext>,
): void {
  const err = `${message}: status=${error.response?.status}, url=${error.request.url}, method=${error.request.method}, details=${error.response?.data}`;
  t.context.logger.error(err);
  t.fail(err);
}

export const provideTestExecutionContext = (t: ExecutionContext<TestContext>) => {
  // config
  const defaultPDPAddress: string =
    process.env.CLOUD_PDP === 'true' ? 'https://cloudpdp.api.permit.io' : 'http://localhost:7766';
  const defaultApiAddress: string =
    process.env.API_TIER === 'prod' ? 'https://api.permit.io' : 'http://localhost:8000';

  const token: string = process.env.PDP_API_KEY || '';
  const pdpAddress: string = process.env.PDP_URL || defaultPDPAddress;
  const apiUrl = process.env.PDP_CONTROL_PLANE || defaultApiAddress;

  if (!token) {
    t.fail('PDP_API_KEY is not configured, test cannot run!');
  }

  t.context.permit = new Permit({
    token,
    pdp: pdpAddress,
    apiUrl,
    log: {
      level: 'debug',
    },
  });

  t.context.logger = LoggerFactory.createLogger(t.context.permit.config);
};
