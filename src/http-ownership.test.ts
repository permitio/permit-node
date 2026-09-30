import { createServer, type IncomingHttpHeaders } from 'node:http';

import axios, { type AxiosInstance } from 'axios';
import { expect, onTestFinished, test, vi } from 'vitest';

import { Permit } from '#src/index';
import { type IPermitOptions } from '#src/config';

interface WireRequest {
  method: string | undefined;
  path: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}
async function wire(status = 200) {
  const calls: WireRequest[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    calls.push({
      method: request.method,
      path: request.url,
      headers: request.headers,
      body: Buffer.concat(chunks).toString(),
    });
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ key: 'alice', allow: true }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  onTestFinished(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}
function permit(caller: AxiosInstance, config: IPermitOptions) {
  const client = new Permit({
    axiosInstance: caller,
    token: 'sdk',
    log: { level: 'silent' },
    ...config,
  });
  client.config.apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
  client.config.apiContext.setEnvironmentLevelContext('org', 'project', 'environment');
  return client;
}
const retry = { maxRetries: 1, retryDelay: 0, maxDelay: 0 };

test('sharing pristine REST transport preserves defaults/hooks and isolates SDK routes and tokens', async () => {
  const first = await wire();
  const second = await wire();
  const caller = axios.create({
    baseURL: first.url,
    allowAbsoluteUrls: false,
    timeout: 800,
    auth: { username: 'caller', password: 'owned' },
    headers: { 'X-Caller': 'kept' },
  });
  const requestHook = vi.fn((config) => config);
  const responseHook = vi.fn((response) => response);
  caller.interceptors.request.use(requestHook, undefined, { synchronous: true });
  caller.interceptors.response.use(responseHook);
  const defaults = { ...caller.defaults, headers: structuredClone(caller.defaults.headers) };
  const firstClient = permit(caller, { apiUrl: first.url, token: 'first' });
  const secondClient = permit(caller, { apiUrl: second.url, token: 'second' });
  for (let index = 0; index < 20; index++) permit(caller, { apiUrl: first.url });
  expect(firstClient.config.axiosInstance).toBe(caller);
  expect(secondClient.config.axiosInstance).toBe(caller);
  expect(caller.defaults).toEqual(defaults);
  expect(caller.interceptors.request.handlers).toHaveLength(1);
  expect(caller.interceptors.response.handlers).toHaveLength(1);
  await firstClient.api.users.get('alice');
  await secondClient.api.users.get('alice');
  await caller.get(second.url + '/caller');
  expect(first.calls.map((call) => [call.path, call.headers.authorization])).toEqual([
    ['/v2/facts/project/environment/users/alice', 'Bearer first'],
    ['/' + second.url + '/caller', 'Basic ' + Buffer.from('caller:owned').toString('base64')],
  ]);
  expect(second.calls[0]?.headers.authorization).toBe('Bearer second');
  expect(first.calls[0]?.headers['x-caller']).toBe('kept');
  expect(requestHook).toHaveBeenCalledTimes(3);
  expect(responseHook).toHaveBeenCalledTimes(3);
  expect(caller.defaults).toEqual(defaults);
});

test('sharing an OPA transport preserves caller destination and routes each SDK independently', async () => {
  const server = await wire();
  const caller = axios.create({
    baseURL: 'https://caller.invalid/original',
    headers: { 'X-Caller': 'kept' },
  });
  const original = caller.defaults.baseURL;
  caller.interceptors.request.use((config) => {
    const destination = new URL(config.baseURL ?? 'https://missing.invalid');
    config.baseURL = server.url + destination.pathname;
    return config;
  });
  const first = permit(axios.create(), {
    pdp: 'http://first.invalid/first/',
    token: 'first',
    opaAxiosInstance: caller,
  });
  const second = permit(axios.create(), {
    pdp: 'http://second.invalid/second/',
    token: 'second',
    opaAxiosInstance: caller,
  });
  expect(await first.check('alice', 'read', 'document', {}, { useOpa: true })).toBe(true);
  expect(await second.check('alice', 'read', 'document', {}, { useOpa: true })).toBe(true);
  expect(server.calls.map((call) => [call.path, call.headers.authorization])).toEqual([
    ['/first/v1/data/permit/root', 'Bearer first'],
    ['/second/v1/data/permit/root', 'Bearer second'],
  ]);
  expect(caller.defaults.baseURL).toBe(original);
  expect(caller.defaults.headers.common['X-Permit-SDK-Version']).toBeUndefined();
  expect(caller.interceptors.request.handlers).toHaveLength(1);
  expect(caller.interceptors.response.handlers).toHaveLength(0);
});

test('one SDK retry policy cannot affect another SDK or direct caller requests', async () => {
  const server = await wire(503);
  const caller = axios.create();
  const enabled = permit(caller, { apiUrl: server.url, retry });
  const disabled = permit(caller, { apiUrl: server.url, retry: false });
  await expect(disabled.api.users.get('alice')).rejects.toThrow();
  expect(server.calls).toHaveLength(1);
  await expect(enabled.api.users.get('alice')).rejects.toThrow();
  expect(server.calls).toHaveLength(3);
  await expect(caller.get(server.url + '/direct')).rejects.toThrow();
  expect(server.calls).toHaveLength(4);
});

for (const method of ['POST', 'PATCH']) {
  test(`REST never replays ${method} even when explicitly configured`, async () => {
    const server = await wire(503);
    const client = permit(axios.create(), {
      apiUrl: server.url,
      retry: { ...retry, retryMethods: [method] },
    });
    await expect(
      method === 'POST'
        ? client.api.users.create({ key: 'alice' })
        : client.api.users.update('alice', {}),
    ).rejects.toThrow();
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]?.method).toBe(method);
  });
}

test('PDP POST retries remain separate from REST writes', async () => {
  const server = await wire(503);
  const client = permit(axios.create(), {
    apiUrl: server.url,
    pdp: server.url,
    retry: false,
    pdpRetry: retry,
  });
  await expect(client.check('alice', 'read', 'document')).rejects.toThrow();
  expect(server.calls).toHaveLength(2);
  await expect(client.api.users.create({ key: 'alice' })).rejects.toThrow();
  expect(server.calls).toHaveLength(3);
  expect(server.calls.map((call) => call.path)).toEqual([
    '/allowed',
    '/allowed',
    '/v2/facts/project/environment/users',
  ]);
});
