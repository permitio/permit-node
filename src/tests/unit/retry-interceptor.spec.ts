import { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

// Reaches the private REST (config.axiosInstance) and PDP (enforcer.client)
// instances for the behavior tests below.
interface PermitInternals {
  config: { axiosInstance: AxiosInstance };
  enforcer: { client: AxiosInstance };
}

// Tiny delays keep every retry near-instant and deterministic (no real waits).
const tiny = { maxRetries: 2, retryDelay: 1, maxDelay: 5, backoffMultiplier: 1 };

// Installs a custom adapter that counts invocations and always rejects with a
// synthetic AxiosError carrying the live request config, so axios-retry can
// re-dispatch the request and we can observe how many times it ran.
function installRejectingAdapter(instance: AxiosInstance, status = 503): { count: () => number } {
  let calls = 0;
  instance.defaults.adapter = (config: InternalAxiosRequestConfig): Promise<never> => {
    calls += 1;
    const error = new Error('synthetic failure') as AxiosError;
    error.isAxiosError = true;
    error.config = config;
    error.toJSON = () => ({});
    error.response = {
      status,
      statusText: 'Error',
      headers: {},
      config,
      data: {},
    };
    return Promise.reject(error);
  };
  return { count: () => calls };
}

// Installs an adapter that rejects with a synthetic 503 for the first
// `failTimes` calls, then resolves with a success response, so we can prove a
// retry actually recovers.
function installRejectThenResolveAdapter(
  instance: AxiosInstance,
  failTimes: number,
): { count: () => number } {
  let calls = 0;
  instance.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    calls += 1;
    if (calls <= failTimes) {
      const error = new Error('synthetic failure') as AxiosError;
      error.isAxiosError = true;
      error.config = config;
      error.toJSON = () => ({});
      error.response = { status: 503, statusText: 'Error', headers: {}, config, data: {} };
      return Promise.reject(error);
    }
    return Promise.resolve({
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { ok: true },
    });
  };
  return { count: () => calls };
}

async function newPermit(overrides: Record<string, unknown>): Promise<PermitInternals> {
  const { Permit } = await import('../../index');
  return new Permit({ token: 'test', ...overrides }) as unknown as PermitInternals;
}

// Captures the delays axios-retry schedules via setTimeout while firing each
// callback immediately, so the retries proceed without any real waiting.
function captureScheduledDelays(): { delays: number[]; restore: () => void } {
  const delays: number[] = [];
  const realSetTimeout = globalThis.setTimeout;
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    fn: () => void,
    delay?: number,
  ): ReturnType<typeof setTimeout> => {
    delays.push(delay ?? 0);
    return realSetTimeout(fn, 0);
  }) as typeof setTimeout);
  return { delays, restore: () => spy.mockRestore() };
}

it('REST and PDP use separate axios instances', async () => {
  const permit = await newPermit({ retry: { maxRetries: 1 }, pdpRetry: { maxRetries: 1 } });

  expect(permit.config.axiosInstance).not.toBe(permit.enforcer.client);
});

it('REST instance does not retry POST while PDP instance does', async () => {
  const permit = await newPermit({ retry: tiny, pdpRetry: tiny });

  const rest = installRejectingAdapter(permit.config.axiosInstance);
  const pdp = installRejectingAdapter(permit.enforcer.client);

  await expect(
    permit.config.axiosInstance.request({ method: 'POST', url: '/x' }),
  ).rejects.toThrow();
  await expect(permit.enforcer.client.request({ method: 'POST', url: '/x' })).rejects.toThrow();

  // REST never retries POST -> exactly one adapter call.
  expect(rest.count()).toBe(1);
  // PDP retries POST (maxRetries: 2) -> initial call + two retries = three.
  expect(pdp.count()).toBe(3);
});

it('a retryable GET retries up to maxRetries then rejects', async () => {
  const permit = await newPermit({ retry: tiny });
  const rest = installRejectingAdapter(permit.config.axiosInstance);

  await expect(permit.config.axiosInstance.request({ method: 'GET', url: '/x' })).rejects.toThrow();

  // maxRetries: 2 -> initial call + two retries = three total.
  expect(rest.count()).toBe(3);
});

it('a non-retryable status (400) is not retried', async () => {
  const permit = await newPermit({ retry: tiny });
  const rest = installRejectingAdapter(permit.config.axiosInstance, 400);

  await expect(permit.config.axiosInstance.request({ method: 'GET', url: '/x' })).rejects.toThrow();

  expect(rest.count()).toBe(1);
});

it('a disallowed method on the REST instance is not retried', async () => {
  const permit = await newPermit({ retry: tiny });
  const rest = installRejectingAdapter(permit.config.axiosInstance);

  // PUT is in DEFAULT_RETRY_METHODS but POST is not, so POST must not retry.
  await expect(
    permit.config.axiosInstance.request({ method: 'POST', url: '/x' }),
  ).rejects.toThrow();

  expect(rest.count()).toBe(1);
});

it('disabled retry (retry: false) installs no retry', async () => {
  const permit = await newPermit({ retry: false });
  const rest = installRejectingAdapter(permit.config.axiosInstance);

  await expect(permit.config.axiosInstance.request({ method: 'GET', url: '/x' })).rejects.toThrow();

  expect(rest.count()).toBe(1);
});

it('REST instance never retries POST even when the user opts POST in', async () => {
  // POST is stripped from the REST retryMethods regardless of user config, so
  // non-idempotent REST writes are never repeated.
  const permit = await newPermit({ retry: { ...tiny, retryMethods: ['GET', 'POST'] } });
  const rest = installRejectingAdapter(permit.config.axiosInstance);

  await expect(
    permit.config.axiosInstance.request({ method: 'POST', url: '/x' }),
  ).rejects.toThrow();

  expect(rest.count()).toBe(1);
});

it('maps axios-retry retryCount to our 0-based attempt number', async () => {
  // axios-retry passes a 1-based retryCount; the interceptor must subtract one
  // so the first retry uses attempt 0. With jitter removed, attempt 0 -> 30ms
  // and attempt 1 (the off-by-one bug) -> 90ms. We capture the delay axios-retry
  // schedules via setTimeout instead of measuring wall-clock time, so the check
  // is deterministic and concurrency-safe.
  const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // strip jitter
  const { delays: scheduledDelays, restore } = captureScheduledDelays();
  try {
    const permit = await newPermit({
      retry: { maxRetries: 1, retryDelay: 30, backoffMultiplier: 3, maxDelay: 10000 },
    });
    installRejectingAdapter(permit.config.axiosInstance);

    await expect(
      permit.config.axiosInstance.request({ method: 'GET', url: '/x' }),
    ).rejects.toThrow();

    expect(scheduledDelays.includes(30)).toBe(true);
    expect(scheduledDelays.includes(90)).toBe(false);
  } finally {
    restore();
    randomSpy.mockRestore();
  }
});

it('a retry recovers: GET succeeds after one failed attempt', async () => {
  const permit = await newPermit({
    retry: { maxRetries: 2, retryDelay: 1, maxDelay: 5, backoffMultiplier: 1 },
  });
  const rest = installRejectThenResolveAdapter(permit.config.axiosInstance, 1);

  const response = await permit.config.axiosInstance.request({ method: 'GET', url: '/x' });

  // Initial failure + one retry that succeeds.
  expect(rest.count()).toBe(2);
  expect(response.status).toBe(200);
  expect(response.data).toEqual({ ok: true });
});

it('Retry-After header drives the retry delay end-to-end', async () => {
  // 429 with `retry-after: 2` (seconds) must produce a 2000ms scheduled delay,
  // which exceeds the 10ms backoff and is under maxDelay, proving Retry-After
  // flows through calculateRetryDelay via our retryDelay callback. The
  // Retry-After branch returns the exact value with no jitter, so we only need
  // to capture the setTimeout delay (nothing is actually awaited).
  const { delays: scheduledDelays, restore } = captureScheduledDelays();
  try {
    const permit = await newPermit({
      retry: { maxRetries: 1, retryDelay: 10, maxDelay: 30000, backoffMultiplier: 1 },
    });

    let calls = 0;
    permit.config.axiosInstance.defaults.adapter = (
      config: InternalAxiosRequestConfig,
    ): Promise<never> => {
      calls += 1;
      const error = new Error('rate limited') as AxiosError;
      error.isAxiosError = true;
      error.config = config;
      error.toJSON = () => ({});
      error.response = {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '2' },
        config,
        data: {},
      };
      return Promise.reject(error);
    };

    await expect(
      permit.config.axiosInstance.request({ method: 'GET', url: '/x' }),
    ).rejects.toThrow();

    // 429 is retryable and GET is allowed, so it retried once.
    expect(calls).toBe(2);
    expect(scheduledDelays.includes(2000)).toBe(true);
  } finally {
    restore();
  }
});
