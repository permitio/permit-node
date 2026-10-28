import pino from 'pino';

import { type IPermitClient, Permit, PermitApiError } from '#src/index';
import { LoggerFactory } from '#src/logger';

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
    process.env['CLOUD_PDP'] === 'true'
      ? 'https://cloudpdp.api.permit.io'
      : 'http://localhost:7766';
  const defaultApiAddress =
    process.env['API_TIER'] === 'prod' ? 'https://api.permit.io' : 'http://localhost:8000';
  const token = process.env['PDP_API_KEY'] || '';
  if (!token) throw new Error('PDP_API_KEY is not configured, test cannot run!');
  const permit = new Permit({
    token,
    pdp: process.env['PDP_URL'] || defaultPDPAddress,
    apiUrl: process.env['PDP_CONTROL_PLANE'] || defaultApiAddress,
    log: { level: 'debug' },
    ...(opts.proxyFactsViaPdp ? { proxyFactsViaPdp: true } : {}),
  });
  return { permit, logger: LoggerFactory.createLogger(permit.config) };
}

/**
 * Logs and throws an error that names the failed request and the API's reply, with the
 * original error as its `cause`.
 */
export function handleApiError(error: PermitApiError, message: string, logger: pino.Logger): never {
  const request = error.originalError.config;
  const target = `${request?.method?.toUpperCase() ?? 'request'} ${request?.url ?? '(no URL)'}`;
  const outcome = error.response
    ? `returned ${error.response.status}: ${JSON.stringify(error.response.data)}`
    : `got no response: ${error.originalError.message}`;
  const description = `${message}: ${target} ${outcome}`;
  logger.error(description);
  throw Object.assign(new Error(description), { cause: error });
}

/** Whether `error` is a REST API error with the given HTTP status. */
export function isApiStatus(error: unknown, status: number): boolean {
  return error instanceof PermitApiError && error.response?.status === status;
}

/** For `.catch()` on a delete: a 404 means the entity is already gone; anything else rethrows. */
export function ignoreNotFound(error: unknown): undefined {
  if (isApiStatus(error, 404)) {
    return undefined;
  }
  throw error;
}

function describeError(error: unknown): string {
  if (error instanceof PermitApiError) {
    return `HTTP ${error.response?.status ?? 'without a response'}: ${error.message}`;
  }
  return String(error);
}

/**
 * Runs every cleanup step in order, including the ones after a failure, so one failure doesn't
 * leave the remaining entities behind. A 404 means the entity is already gone. Any other error
 * is reported once all steps have run, in one error that names each failed step.
 *
 * @param steps - Cleanup steps keyed by a description of what each one removes.
 */
export async function cleanUp(steps: Record<string, () => Promise<unknown>>): Promise<void> {
  const failures: string[] = [];
  let firstError: unknown;
  for (const [description, step] of Object.entries(steps)) {
    try {
      await step();
    } catch (error) {
      if (isApiStatus(error, 404)) {
        continue;
      }
      failures.push(`${description} (${describeError(error)})`);
      firstError ??= error;
    }
  }
  if (failures.length > 0) {
    throw Object.assign(new Error(`cleanup failed: ${failures.join('; ')}`), {
      cause: firstError,
    });
  }
}

/**
 * Resolves when `read` fails with a 404. Rejects when it succeeds, because the entity still
 * exists, or when it fails with any other error.
 *
 * @param read - A request for one entity, such as `permit.api.users.get(key)`.
 * @param description - Names the entity in the failure message.
 */
export async function expectNotFound(read: Promise<unknown>, description: string): Promise<void> {
  try {
    await read;
  } catch (error) {
    if (isApiStatus(error, 404)) {
      return;
    }
    throw error;
  }
  throw new Error(`${description} still exists`);
}
