import axios, {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  type InternalAxiosRequestConfig,
} from 'axios';
import pino from 'pino';
import { afterEach, expect, test, vi } from 'vitest';

import { createOwnedTransport } from '#src/utils/http-transport';
import { resolveRetryConfig, type IRetryConfig } from '#src/utils/retry';

const logger = pino({ level: 'silent' });
const policy = { maxRetries: 1, retryDelay: 0, maxDelay: 0 };
const success = (config: InternalAxiosRequestConfig, data: unknown = { ok: true }) => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});
function failed(config: InternalAxiosRequestConfig, code = 'ERR_BAD_RESPONSE', status?: number) {
  return new AxiosError(
    'transport failed',
    code,
    config,
    { marker: 'request' },
    status === undefined ? undefined : { ...success(config), status },
  );
}
function owned(caller: ReturnType<typeof axios.create>, retry: IRetryConfig = policy) {
  return createOwnedTransport({ caller, logger, retry: resolveRetryConfig(retry), name: 'test' });
}
afterEach(() => vi.restoreAllMocks());

test('explicit suppressed headers override caller defaults without changing the caller', async () => {
  const seen: InternalAxiosRequestConfig[] = [];
  const caller = axios.create({
    headers: { common: { 'X-Disabled': 'default', 'X-Empty': 'default' } },
    adapter: async (config) => {
      seen.push(config);
      return success(config);
    },
  });
  await owned(caller).get('/sdk', { headers: { 'X-Disabled': false, 'X-Empty': null } });
  await caller.get('/direct');
  expect(seen[0]?.headers.get('X-Disabled')).toBe(false);
  expect(seen[0]?.headers.get('X-Empty')).toBeNull();
  expect(seen[1]?.headers.get('X-Disabled')).toBe('default');
  expect(seen[1]?.headers.get('X-Empty')).toBe('default');
});

test('preserves live caller defaults, transforms and intentional interceptors once per attempt', async () => {
  const events: string[] = [];
  const caller = axios.create({
    timeout: 700,
    headers: { common: { 'X-Caller': 'original' } },
    transformRequest: [
      (data, headers) => {
        events.push('request-transform');
        expect(data).toEqual({ query: true });
        headers.set('X-Transform', 'yes');
        return JSON.stringify(data);
      },
    ],
    transformResponse: [
      (data) => {
        events.push('response-transform');
        return JSON.parse(data);
      },
    ],
  });
  caller.interceptors.request.use(
    (config) => {
      events.push('request-hook');
      return config;
    },
    undefined,
    { synchronous: true, runWhen: (config) => config.method === 'post' },
  );
  caller.interceptors.response.use((response) => {
    events.push('response-hook');
    return response;
  });
  const attempts: InternalAxiosRequestConfig[] = [];
  caller.defaults.adapter = async (config) => {
    events.push('adapter');
    attempts.push(config);
    expect(config.data).toBe('{"query":true}');
    if (attempts.length === 1) {
      const error = failed(config, 'ERR_BAD_RESPONSE', 503);
      if (error.response) error.response.data = '{"error":true}';
      throw error;
    }
    return success(config, '{"ok":true}');
  };
  const client = owned(caller, { ...policy, retryMethods: ['POST'] });
  caller.defaults.timeout = 900;
  caller.defaults.headers.common['X-Caller'] = 'live';
  const response = await client.post(
    '/query',
    { query: true },
    {
      baseURL: 'https://sdk.invalid',
      headers: { Authorization: 'Bearer sdk', 'Content-Type': 'application/json' },
    },
  );
  expect(response.data).toEqual({ ok: true });
  expect(attempts).toHaveLength(2);
  expect(attempts[0]?.timeout).toBe(900);
  expect(attempts[1]?.timeout).toBeGreaterThan(0);
  expect(attempts[1]?.timeout).toBeLessThanOrEqual(900);
  for (const attempt of attempts) {
    expect(attempt.headers.get('X-Caller')).toBe('live');
    expect(attempt.headers.get('X-Transform')).toBe('yes');
    expect(attempt.headers.get('Authorization')).toBe('Bearer sdk');
    expect(attempt.baseURL).toBe('https://sdk.invalid');
  }
  expect(events).toEqual([
    'request-hook',
    'request-transform',
    'adapter',
    'response-transform',
    'request-hook',
    'request-transform',
    'adapter',
    'response-transform',
    'response-hook',
  ]);
  expect(caller.interceptors.request.handlers).toHaveLength(1);
  expect(caller.interceptors.response.handlers).toHaveLength(1);
  expect(caller.defaults.timeout).toBe(900);
});

test('keeps the original Axios error, status, response, request and config', async () => {
  const caller = axios.create();
  let error: AxiosError | undefined;
  caller.defaults.adapter = async (config) => {
    error = failed(config, 'ERR_BAD_RESPONSE', 400);
    throw error;
  };
  const promise = owned(caller).get('/failure');
  await expect(promise).rejects.toMatchObject({
    code: 'ERR_BAD_RESPONSE',
    response: { status: 400 },
    request: { marker: 'request' },
  });
  await expect(promise).rejects.toBe(error);
});

for (const code of [
  'ERR_CANCELED',
  'ERR_BAD_OPTION',
  'ERR_BAD_OPTION_VALUE',
  'ERR_INVALID_URL',
  'ERR_NOT_SUPPORT',
  'ERR_DEPRECATED',
  'ERR_FR_TOO_MANY_REDIRECTS',
]) {
  test(`does not call a permissive retry predicate for ${code}`, async () => {
    const predicate = vi.fn(() => true);
    const caller = axios.create();
    const request = vi.spyOn(caller, 'request');
    caller.defaults.adapter = async (config) => {
      throw failed(config, code);
    };
    const client = createOwnedTransport({
      caller,
      logger,
      name: 'test',
      retry: resolveRetryConfig({ ...policy, retryCondition: predicate }),
    });
    await expect(client.get('/error')).rejects.toMatchObject({ code });
    expect(request).toHaveBeenCalledTimes(1);
    expect(predicate).not.toHaveBeenCalled();
  });
}

for (const code of [undefined, 'UNKNOWN', 'ENOTFOUND']) {
  test(`does not retry an unclassified response-less error ${code}`, async () => {
    const caller = axios.create();
    const request = vi.spyOn(caller, 'request');
    caller.defaults.adapter = async (config) => {
      throw new AxiosError('unknown', code, config);
    };
    await expect(owned(caller).get('/error')).rejects.toThrow('unknown');
    expect(request).toHaveBeenCalledTimes(1);
  });
}

test('does not retry a transport CanceledError without a signal', async () => {
  const caller = axios.create();
  const predicate = vi.fn(() => true);
  const request = vi.spyOn(caller, 'request');
  caller.defaults.adapter = async (config) => {
    throw new CanceledError('stop', config);
  };
  const client = createOwnedTransport({
    caller,
    logger,
    name: 'test',
    retry: resolveRetryConfig({ ...policy, retryCondition: predicate }),
  });
  await expect(client.get('/error')).rejects.toThrow('stop');
  expect(request).toHaveBeenCalledTimes(1);
  expect(predicate).not.toHaveBeenCalled();
});

test('a pre-aborted caller signal prevents even the first caller pipeline', async () => {
  const caller = axios.create({ signal: AbortSignal.abort() });
  const request = vi.spyOn(caller, 'request');
  await expect(owned(caller).get('/error')).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  expect(request).not.toHaveBeenCalled();
});

for (const cancellation of ['signal', 'token']) {
  test(`cancelling ${cancellation} during backoff releases subscriptions and stops retry`, async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const token = axios.CancelToken.source();
      const caller = axios.create(
        cancellation === 'signal' ? { signal: controller.signal } : { cancelToken: token.token },
      );
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const unsubscribe = vi.spyOn(token.token, 'unsubscribe');
      const request = vi.spyOn(caller, 'request');
      caller.defaults.adapter = async (config) => {
        throw failed(config, 'ERR_NETWORK');
      };
      const client = owned(caller, { ...policy, retryDelay: 5000, maxDelay: 5000 });
      const promise = client.get('/error');
      const rejected = expect(promise).rejects.toMatchObject({ code: 'ERR_CANCELED' });
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
      if (cancellation === 'signal') controller.abort();
      else token.cancel('stop');
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
      expect(request).toHaveBeenCalledTimes(1);
      if (cancellation === 'signal') expect(remove).toHaveBeenCalled();
      else expect(unsubscribe).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
}

for (const timeout of [undefined, 0, 100]) {
  test(`forwards ${timeout} timeout without a facade default override`, async () => {
    const caller = axios.create({ timeout: 900 });
    const seen: (number | undefined)[] = [];
    caller.defaults.adapter = async (config) => {
      seen.push(config.timeout);
      return success(config);
    };
    await owned(caller).get('/success', timeout === undefined ? {} : { timeout });
    expect(seen).toEqual([timeout ?? 900]);
  });
}

test('does not schedule a retry whose delay exhausts the total timeout budget', async () => {
  const caller = axios.create({ timeout: 30 });
  const request = vi.spyOn(caller, 'request');
  const timer = vi.spyOn(globalThis, 'setTimeout');
  caller.defaults.adapter = async (config) => {
    throw failed(config, 'ERR_NETWORK');
  };
  await expect(
    owned(caller, { ...policy, retryDelay: 50, maxDelay: 50 }).get('/error'),
  ).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  expect(request).toHaveBeenCalledTimes(1);
  expect(timer).not.toHaveBeenCalled();
});

test('rejects a nonboolean custom retry result instead of allowing a truthy value', async () => {
  const caller = axios.create();
  caller.defaults.adapter = async (config) => {
    throw failed(config, 'ERR_NETWORK');
  };
  const invalid = Reflect.apply(resolveRetryConfig, undefined, [
    { ...policy, retryCondition: () => 'true' },
  ]);
  const client = createOwnedTransport({ caller, logger, name: 'test', retry: invalid });
  await expect(client.get('/error')).rejects.toThrow('expected a boolean');
});

test('ignores malformed Retry-After values while retaining the original exhausted error', async () => {
  const caller = axios.create();
  let calls = 0;
  let last: AxiosError | undefined;
  caller.defaults.adapter = async (config) => {
    calls += 1;
    last = failed(config, 'ERR_BAD_RESPONSE', 429);
    if (last.response)
      last.response.headers = new AxiosHeaders({ 'Retry-After': ['bad', 'header'] });
    throw last;
  };
  const promise = owned(caller).get('/error');
  await expect(promise).rejects.toThrow('transport failed');
  await expect(promise).rejects.toBe(last);
  expect(calls).toBe(2);
});

for (const method of ['get', 'put', 'delete']) {
  test(`${method} exhausts exactly the configured retry count`, async () => {
    const caller = axios.create();
    const request = vi.spyOn(caller, 'request');
    caller.defaults.adapter = async (config) => {
      throw failed(config, 'ERR_BAD_RESPONSE', 503);
    };
    await expect(
      owned(caller, { ...policy, maxRetries: 2 }).request({ method, url: '/error' }),
    ).rejects.toThrow('transport failed');
    expect(request).toHaveBeenCalledTimes(3);
  });
}

test('uses the first backoff delay and honors Retry-After through the transport boundary', async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  try {
    for (const retryAfter of [undefined, '2']) {
      const caller = axios.create();
      const request = vi.spyOn(caller, 'request');
      caller.defaults.adapter = async (config) => {
        const error = failed(config, 'ERR_BAD_RESPONSE', 429);
        if (error.response && retryAfter !== undefined)
          error.response.headers['retry-after'] = retryAfter;
        throw error;
      };
      const promise = owned(caller, {
        maxRetries: 1,
        retryDelay: 30,
        maxDelay: 5000,
        backoffMultiplier: 3,
      }).get('/error');
      const rejected = expect(promise).rejects.toThrow('transport failed');
      const delay = retryAfter === undefined ? 30 : 2000;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(request).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    }
  } finally {
    vi.useRealTimers();
  }
});

test('isolates SDK logging without intercepting the caller direct request', async () => {
  const caller = axios.create({ adapter: async (config) => success(config) });
  const firstLogger = pino({ level: 'silent' });
  const secondLogger = pino({ level: 'silent' });
  const firstLog = vi.spyOn(firstLogger, 'debug');
  const secondLog = vi.spyOn(secondLogger, 'debug');
  const first = createOwnedTransport({
    caller,
    logger: firstLogger,
    retry: resolveRetryConfig(false),
    name: 'first',
  });
  createOwnedTransport({
    caller,
    logger: secondLogger,
    retry: resolveRetryConfig(false),
    name: 'second',
  });
  await first.get('/sdk');
  expect(firstLog.mock.calls.map((call) => call[1])).toEqual([
    'Sending HTTP request: GET /sdk',
    'Received HTTP response: GET /sdk, status: 200',
  ]);
  expect(secondLog).not.toHaveBeenCalled();
  await caller.get('/direct');
  expect(firstLog).toHaveBeenCalledTimes(2);
  expect(secondLog).not.toHaveBeenCalled();
});

for (const timeout of [-1, NaN, Infinity, 2_147_483_648]) {
  test(`rejects invalid timeout ${timeout} before caller execution`, async () => {
    const caller = axios.create();
    const request = vi.spyOn(caller, 'request');
    await expect(owned(caller).get('/error', { timeout })).rejects.toThrow('Invalid HTTP timeout');
    expect(request).not.toHaveBeenCalled();
  });
}

test('preserves a custom retry predicate failure rather than masking it', async () => {
  const caller = axios.create();
  caller.defaults.adapter = async (config) => {
    throw failed(config, 'ERR_NETWORK');
  };
  const failure = new Error('custom policy failed');
  const client = owned(caller, {
    ...policy,
    retryCondition: () => {
      throw failure;
    },
  });
  await expect(client.get('/error')).rejects.toBe(failure);
});

test('reads the caller transform defaults anew for each retry attempt', async () => {
  const caller = axios.create({ transformRequest: [(data) => JSON.stringify({ first: data })] });
  const bodies: unknown[] = [];
  caller.defaults.adapter = async (config) => {
    bodies.push(config.data);
    if (bodies.length === 1) {
      caller.defaults.transformRequest = [(data) => JSON.stringify({ second: data })];
      throw failed(config, 'ERR_NETWORK');
    }
    return success(config);
  };
  await owned(caller).put(
    '/query',
    { raw: true },
    { headers: { 'Content-Type': 'application/json' } },
  );
  expect(bodies).toEqual(['{"first":{"raw":true}}', '{"second":{"raw":true}}']);
});

test('preserves intentional caller recovery and transform replacement', async () => {
  const caller = axios.create();
  const transform = vi.fn((data) => data);
  caller.interceptors.request.use((config) => {
    config.transformRequest = [transform];
    return config;
  });
  caller.interceptors.response.use(undefined, (error) => {
    assert(axios.isAxiosError(error) && error.config);
    return success(error.config, { callerRecovered: true });
  });
  const request = vi.spyOn(caller, 'request');
  caller.defaults.adapter = async (config) => {
    throw failed(config, 'ERR_BAD_RESPONSE', 503);
  };
  const response = await owned(caller).get('/query');
  expect(response.data).toEqual({ callerRecovered: true });
  expect(transform).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
});

test('preserves an unexpected caller exception without retrying', async () => {
  const caller = axios.create();
  const failure = new Error('caller hook failed');
  caller.interceptors.request.use(() => {
    throw failure;
  });
  const request = vi.spyOn(caller, 'request');
  await expect(owned(caller).get('/query')).rejects.toBe(failure);
  expect(request).toHaveBeenCalledTimes(1);
});

for (const retry of [
  false,
  { ...policy, retryMethods: [] },
  { ...policy, retryCondition: () => false },
] satisfies (IRetryConfig | false)[]) {
  test(`disabled or excluded retry policy stays single-attempt ${JSON.stringify(retry)}`, async () => {
    const caller = axios.create();
    const request = vi.spyOn(caller, 'request');
    caller.defaults.adapter = async (config) => {
      throw failed(config, 'ERR_NETWORK');
    };
    const client = createOwnedTransport({
      caller,
      logger,
      name: 'test',
      retry: resolveRetryConfig(retry),
    });
    await expect(client.get('/query')).rejects.toThrow('transport failed');
    expect(request).toHaveBeenCalledTimes(1);
  });
}

for (const header of ['Retry-After', 'retry-after']) {
  test(`honors case-insensitive ${header} before scheduling beyond the timeout budget`, async () => {
    const caller = axios.create({ timeout: 100 });
    const request = vi.spyOn(caller, 'request');
    caller.defaults.adapter = async (config) => {
      const error = failed(config, 'ERR_BAD_RESPONSE', 429);
      if (error.response) error.response.headers = new AxiosHeaders({ [header]: '2' });
      throw error;
    };
    await expect(owned(caller, { ...policy, maxDelay: 200 }).get('/query')).rejects.toThrow(
      'transport failed',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
}

test('a canceled caller token prevents any caller pipeline or retry callback', async () => {
  const token = axios.CancelToken.source();
  token.cancel('already canceled');
  const caller = axios.create({ cancelToken: token.token });
  const request = vi.spyOn(caller, 'request');
  const predicate = vi.fn(() => true);
  await expect(
    owned(caller, { ...policy, retryCondition: predicate }).get('/query'),
  ).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  expect(request).not.toHaveBeenCalled();
  expect(predicate).not.toHaveBeenCalled();
});

test('event-loop delay cannot start another attempt after the retry budget expires', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  try {
    const caller = axios.create({ timeout: 30 });
    const request = vi.spyOn(caller, 'request');
    caller.defaults.adapter = async (config) => {
      throw failed(config, 'ERR_NETWORK');
    };
    const promise = owned(caller, { ...policy, retryDelay: 10, maxDelay: 10 }).get('/query');
    const rejected = expect(promise).rejects.toMatchObject({ code: 'ERR_NETWORK' });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    clock = 40;
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

for (const cancellation of ['signal', 'token']) {
  test(`caller-hook ${cancellation} cancels backoff before re-entering its pipeline`, async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const token = axios.CancelToken.source();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const unsubscribe = vi.spyOn(token.token, 'unsubscribe');
      const caller = axios.create();
      const hook = vi.fn((config: InternalAxiosRequestConfig) => {
        if (cancellation === 'signal') config.signal = controller.signal;
        else config.cancelToken = token.token;
        return config;
      });
      caller.interceptors.request.use(hook);
      const request = vi.spyOn(caller, 'request');
      caller.defaults.adapter = async (config) => {
        throw failed(config, 'ERR_NETWORK');
      };
      const client = owned(caller, { ...policy, retryDelay: 350, maxDelay: 350 });
      const promise = client.get('/query');
      const rejected = expect(promise).rejects.toMatchObject({ code: 'ERR_CANCELED' });
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
      if (cancellation === 'signal') controller.abort();
      else token.cancel('stop');
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
      await rejected;
      await vi.advanceTimersByTimeAsync(1000);
      expect(request).toHaveBeenCalledTimes(1);
      expect(hook).toHaveBeenCalledTimes(1);
      if (cancellation === 'signal') expect(remove).toHaveBeenCalled();
      else expect(unsubscribe).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
}

for (const method of ['post', 'patch']) {
  test(`does not retry a safe request rewritten to ${method} by a caller hook`, async () => {
    const caller = axios.create();
    const predicate = vi.fn(() => true);
    caller.interceptors.request.use((config) => {
      config.method = method;
      return config;
    });
    const seen: (string | undefined)[] = [];
    caller.defaults.adapter = async (config) => {
      seen.push(config.method);
      throw failed(config, 'ERR_BAD_RESPONSE', 503);
    };
    await expect(
      owned(caller, { ...policy, retryCondition: predicate }).get('/query'),
    ).rejects.toThrow('transport failed');
    expect(seen).toEqual([method]);
    expect(predicate).not.toHaveBeenCalled();
  });
}

test('rewriting an originally unsafe request to GET does not enable SDK retry', async () => {
  const caller = axios.create();
  caller.interceptors.request.use((config) => {
    config.method = 'get';
    return config;
  });
  const request = vi.spyOn(caller, 'request');
  caller.defaults.adapter = async (config) => {
    throw failed(config, 'ERR_NETWORK');
  };
  await expect(owned(caller).post('/query', {})).rejects.toThrow('transport failed');
  expect(request).toHaveBeenCalledTimes(1);
});
