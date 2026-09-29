import pino from 'pino';

import { IPermitClient, Permit, PermitApiError } from '../index';
import { LoggerFactory } from '../logger';

export interface TestClient {
  permit: IPermitClient;
  logger: pino.Logger;
}

export const printBreak = () => console.log('\n\n ----------- \n\n');

export interface CreateTestClientOptions {
  proxyFactsViaPdp?: boolean;
}

export function createTestClient(opts: CreateTestClientOptions = {}): TestClient {
  const defaultPDPAddress =
    process.env.CLOUD_PDP === 'true' ? 'https://cloudpdp.api.permit.io' : 'http://localhost:7766';
  const defaultApiAddress =
    process.env.API_TIER === 'prod' ? 'https://api.permit.io' : 'http://localhost:8000';
  const token = process.env.PDP_API_KEY || '';
  if (!token) throw new Error('PDP_API_KEY is not configured, test cannot run!');
  const permit = new Permit({
    token,
    pdp: process.env.PDP_URL || defaultPDPAddress,
    apiUrl: process.env.PDP_CONTROL_PLANE || defaultApiAddress,
    log: { level: 'debug' },
    ...(opts.proxyFactsViaPdp ? { proxyFactsViaPdp: true } : {}),
  });
  return { permit, logger: LoggerFactory.createLogger(permit.config) };
}

export function handleApiError(
  error: PermitApiError<any>,
  message: string,
  logger: pino.Logger,
): never {
  const err = `${message}: status=${error.response?.status}, url=${error.request.url}, method=${error.request.method}, details=${error.response?.data}`;
  logger.error(err);
  throw new Error(err);
}
