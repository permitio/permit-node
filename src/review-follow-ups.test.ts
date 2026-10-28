import { readFileSync } from 'node:fs';

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import pino from 'pino';
import { afterEach, expect, test, vi } from 'vitest';

import { ConfigFactory, type IPermitOptions } from '#src/config';
import { Permit } from '#src/index';
import { createMockPermit } from '#src/tests/helpers/mock-api';
import { diagnosticAxiosError, diagnosticSecrets, diagnosticText } from '#src/utils/diagnostics';
import { createOwnedTransport } from '#src/utils/http-transport';
import { resolveRetryConfig } from '#src/utils/retry';
import { SDK_VERSION } from '#src/version';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test('a nested option left undefined keeps its default, as a top-level one does', () => {
  // As `log: { level: process.env.PERMIT_LOG_LEVEL }` gives with the variable unset.
  const config = ConfigFactory.build({
    token: 'test-token',
    log: { level: undefined, json: undefined },
    multiTenancy: { defaultTenant: undefined, useDefaultTenantIfEmpty: undefined },
  } as unknown as IPermitOptions);
  const defaults = ConfigFactory.build({ token: 'test-token' });
  expect(config.log).toEqual(defaults.log);
  expect(config.multiTenancy).toEqual(defaults.multiTenancy);
  expect(() =>
    ConfigFactory.build({ token: 'test-token', log: { level: null as unknown as string } }),
  ).toThrow('Invalid log.level');
});

test('a client can be created from the environment alone, without an options object', () => {
  vi.stubEnv('PERMIT_API_KEY', 'environment-key');
  expect(new Permit().config.token).toBe('environment-key');
});

test('the SDK version header carries the package version', () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  expect(SDK_VERSION).toBe(version);
});

test('short request values are not removed from diagnostics', () => {
  const secrets = diagnosticSecrets({ page: 1, grade: 'A', name: 'node', key: 'a-long-user-key' });
  expect(secrets.values).toEqual(['a-long-user-key']);
  expect(diagnosticText('Page 1 out of range for node, grade A', secrets)).toBe(
    'Page 1 out of range for node, grade A',
  );
  expect(diagnosticText('unknown user a-long-user-key', secrets)).toBe('unknown user [REDACTED]');
});

test('a retry budget under one millisecond ends the request instead of disabling the timeout', async () => {
  const caller = axios.create({ timeout: 10 });
  const request = vi.spyOn(caller, 'request');
  caller.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError('transport failed', 'ERR_NETWORK', config);
  };
  let calls = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (calls++ === 0 ? 0 : 9.6));
  const client = createOwnedTransport({
    caller,
    logger: pino({ level: 'silent' }),
    retry: resolveRetryConfig({ maxRetries: 2, retryDelay: 0, maxDelay: 0 }),
    name: 'test',
  });
  await expect(client.get('/slow')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  expect(request).toHaveBeenCalledTimes(1);
});

test('resource relations list accepts a raw array as well as a paginated envelope', async () => {
  const { permit, rest } = createMockPermit();
  const rows = [{ key: 'owner' }];
  rest.resolveWith(rows);
  expect(await permit.api.resourceRelations.list({ resourceKey: 'document' })).toEqual(rows);
});

test('an Axios error whose response has no headers still gets a safe snapshot', () => {
  const error = new AxiosError('rejected', 'ERR_BAD_RESPONSE');
  error.response = { status: 503, statusText: '', data: {} } as unknown as NonNullable<
    AxiosError['response']
  >;
  expect(() => diagnosticAxiosError(error)).not.toThrow();
});
