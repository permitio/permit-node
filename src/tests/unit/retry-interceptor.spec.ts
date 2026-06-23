import test from 'ava';
import { AxiosError, AxiosHeaders, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Logger } from 'pino';

import { DEFAULT_RETRY_CONFIG, IResolvedRetryConfig } from '../../utils/retry';
import { AxiosRetryInterceptor } from '../../utils/retry-interceptor';

// Reaches the private REST (config.axiosInstance) and PDP (enforcer.client)
// instances for the isolation regression tests below.
interface PermitInternals {
  config: { axiosInstance: AxiosInstance };
  enforcer: { client: AxiosInstance };
}

// Minimal pino-like logger stub
const warnings: string[] = [];
const loggerStub = {
  warn: (msg: string): void => {
    warnings.push(msg);
  },
} as unknown as Logger;

// Fast, deterministic retry config built on top of the defaults.
function fastConfig(overrides: Partial<IResolvedRetryConfig> = {}): IResolvedRetryConfig {
  return {
    ...DEFAULT_RETRY_CONFIG,
    enabled: true,
    retryDelay: 1,
    maxDelay: 5,
    backoffMultiplier: 1,
    retryMethods: ['GET'],
    ...overrides,
  };
}

// Fake axios that captures the interceptor's rejection handler and models the
// real interceptor chain: a failed retry re-enters the rejection handler with
// the same (retry-count-carrying) request config, exactly like axios does.
class FakeAxios {
  public requestCount = 0;
  public rejectionHandler!: (error: AxiosError) => Promise<unknown>;

  // When set, request() fails by feeding the error back through the rejection
  // handler so retry-count limiting is genuinely exercised. Otherwise it
  // resolves, simulating a successful retry.
  private failError: AxiosError | undefined;

  public interceptors = {
    response: {
      use: (_onFulfilled: unknown, onRejected: (error: AxiosError) => Promise<unknown>): void => {
        this.rejectionHandler = onRejected;
      },
    },
  };

  public request = (requestConfig: unknown): Promise<unknown> => {
    this.requestCount += 1;
    if (this.failError) {
      // Re-drive the chain with the (mutated) config the interceptor passed in.
      this.failError.config = requestConfig as AxiosError['config'];
      return this.rejectionHandler(this.failError);
    }
    return Promise.resolve({ ok: true });
  };

  alwaysFail(error: AxiosError): void {
    this.failError = error;
  }

  asInstance(): AxiosInstance {
    return this as unknown as AxiosInstance;
  }
}

function createError(method: string, status?: number, retryAfter?: string): AxiosError {
  const error = new Error('Request failed') as AxiosError;
  error.isAxiosError = true;
  error.config = { method, url: '/test', headers: new AxiosHeaders() };
  error.toJSON = () => ({});

  if (status !== undefined) {
    const headers: Record<string, string> = {};
    if (retryAfter !== undefined) {
      headers['retry-after'] = retryAfter;
    }
    error.response = {
      status,
      statusText: 'Error',
      headers,
      config: { headers: new AxiosHeaders() },
      data: {},
    };
  }

  return error;
}

function setup(config: IResolvedRetryConfig): FakeAxios {
  const fake = new FakeAxios();
  AxiosRetryInterceptor.setupInterceptor(fake.asInstance(), config, loggerStub, 'TEST');
  return fake;
}

test('setupInterceptor does not register a handler when disabled', (t) => {
  const fake = new FakeAxios();
  AxiosRetryInterceptor.setupInterceptor(
    fake.asInstance(),
    fastConfig({ enabled: false }),
    loggerStub,
    'TEST',
  );

  t.is(fake.rejectionHandler, undefined);
});

test('retries a retryable GET until maxRetries then rejects with the original error', async (t) => {
  const fake = setup(fastConfig({ maxRetries: 2 }));
  const originalError = createError('GET', 503);
  fake.alwaysFail(originalError);

  const rejected = await t.throwsAsync(() => fake.rejectionHandler(originalError));

  t.is(rejected, originalError);
  // maxRetries=2 -> exactly two retry requests are issued before giving up.
  t.is(fake.requestCount, 2);
});

test('retries a retryable GET and resolves on success', async (t) => {
  const fake = setup(fastConfig({ maxRetries: 3 }));

  const result = await fake.rejectionHandler(createError('GET', 503));

  t.deepEqual(result, { ok: true });
  t.is(fake.requestCount, 1);
});

test('does not retry a method outside retryMethods', async (t) => {
  const fake = setup(fastConfig({ retryMethods: ['GET'] }));
  const error = createError('POST', 503);

  const rejected = await t.throwsAsync(() => fake.rejectionHandler(error));

  t.is(rejected, error);
  t.is(fake.requestCount, 0);
});

test('does not retry a non-retryable status code', async (t) => {
  const fake = setup(fastConfig());
  const error = createError('GET', 400);

  const rejected = await t.throwsAsync(() => fake.rejectionHandler(error));

  t.is(rejected, error);
  t.is(fake.requestCount, 0);
});

test('rejects without retry when request config is missing', async (t) => {
  const fake = setup(fastConfig());
  const error = createError('GET', 503);
  // Simulate axios giving us no config to retry with.
  (error as { config?: unknown }).config = undefined;

  const rejected = await t.throwsAsync(() => fake.rejectionHandler(error));

  t.is(rejected, error);
  t.is(fake.requestCount, 0);
});

test('honors a Retry-After header and still retries', async (t) => {
  // "0" seconds keeps the delay immediate and the test deterministic; the
  // delay-value math for Retry-After is covered in retry.spec.
  const fake = setup(fastConfig({ respectRetryAfter: true, maxDelay: 50 }));
  const error = createError('GET', 429, '0');

  const result = await fake.rejectionHandler(error);

  t.deepEqual(result, { ok: true });
  t.is(fake.requestCount, 1);
});

// ============================================
// Isolation regression tests (CRITICAL + HIGH fixes)
// ============================================

// Installs a custom adapter that counts invocations and always rejects with a
// synthetic 503 carrying the live request config, so the retry interceptor can
// re-enter the chain via axiosInstance.request(...).
function installRejectingAdapter(instance: AxiosInstance): { count: () => number } {
  let calls = 0;
  instance.defaults.adapter = (config: InternalAxiosRequestConfig): Promise<never> => {
    calls += 1;
    const error = new Error('synthetic failure') as AxiosError;
    error.isAxiosError = true;
    error.config = config;
    error.toJSON = () => ({});
    error.response = {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {},
      config,
      data: {},
    };
    return Promise.reject(error);
  };
  return { count: () => calls };
}

test('REST and PDP use separate axios instances', async (t) => {
  const { Permit } = await import('../../index');

  const permit = new Permit({
    token: 'test',
    retry: { maxRetries: 1 },
    pdpRetry: { maxRetries: 1 },
  });

  const restInstance = (permit as unknown as PermitInternals).config.axiosInstance;
  const pdpInstance = (permit as unknown as PermitInternals).enforcer.client;

  t.not(restInstance, pdpInstance);
});

test('REST instance does not retry POST while PDP instance does', async (t) => {
  const { Permit } = await import('../../index');

  // Tiny delays keep the retry near-instant and deterministic.
  const tiny = { maxRetries: 1, retryDelay: 1, maxDelay: 5, backoffMultiplier: 1 };
  const permit = new Permit({
    token: 'test',
    retry: tiny,
    pdpRetry: tiny,
  });

  const restInstance = (permit as unknown as PermitInternals).config.axiosInstance;
  const pdpInstance = (permit as unknown as PermitInternals).enforcer.client;

  const rest = installRejectingAdapter(restInstance);
  const pdp = installRejectingAdapter(pdpInstance);

  await t.throwsAsync(() => restInstance.request({ method: 'POST', url: '/x' }));
  await t.throwsAsync(() => pdpInstance.request({ method: 'POST', url: '/x' }));

  // REST never retries POST -> exactly one adapter call.
  t.is(rest.count(), 1);
  // PDP retries POST (maxRetries: 1) -> initial call + one retry = two.
  t.is(pdp.count(), 2);
});
