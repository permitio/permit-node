import { expect, test } from 'vitest';
import { cloudControlRequest } from '#scripts/cloud-http.mjs';

const credential = 'synthetic-step-credential';
const canary = 'response-only-secret-canary';
const request = { method: 'POST', path: '/v2/projects/project/envs', body: { key: 'owned' } };

test('issues exactly one HTTPS request with redirects forbidden and credentials', async () => {
  const calls = [];
  const invoke = cloudControlRequest({
    credential,
    fetch: async (url, options) => {
      calls.push({ url: url.href, ...options });
      return new Response(JSON.stringify({ id: 'received-id', secret: canary }), { status: 201 });
    },
  });
  expect(await invoke({ ...request, credential: 'synthetic-environment-credential' })).toEqual({
    status: 201,
    body: { id: 'received-id', secret: canary },
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    url: 'https://api.permit.io/v2/projects/project/envs',
    method: 'POST',
    redirect: 'error',
    body: JSON.stringify(request.body),
    headers: { authorization: 'Bearer synthetic-environment-credential' },
  });
  expect(calls[0].signal).toBeInstanceOf(AbortSignal);
});

test.each(['', 'space credential', 'line\ncredential', '\tcontrol', 'nonascii\u00a0'])(
  'refuses malformed explicit credential %j',
  (credential) => {
    expect(() => cloudControlRequest({ credential, fetch: async () => {} })).toThrow(
      'explicit valid',
    );
  },
);

test.each([
  '/v2/../outside',
  '/v2/%2e%2e/outside',
  '/v2/path/%2foutside',
  '/v2/\\outside',
  '//foreign.invalid/v2/',
  'https://foreign.invalid/v2/',
  '/v2/path#fragment',
  '/v1/path',
])('invalid destination %s fails before the network boundary', async (path) => {
  let calls = 0;
  const invoke = cloudControlRequest({
    credential,
    fetch: async () => {
      calls += 1;
    },
  });
  await expect(invoke({ method: 'GET', path })).rejects.toThrow('no raw response');
  expect(calls).toBe(0);
});

test.each([401, 403, 404, 429, 500])(
  'HTTP %s remains visible without retries or logging response contents',
  async (status) => {
    let calls = 0;
    const invoke = cloudControlRequest({
      credential,
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ secret: canary }), { status });
      },
    });
    expect(await invoke(request)).toEqual({ status, body: { secret: canary } });
    expect(calls).toBe(1);
  },
);

test('empty successful deletion body stays null', async () => {
  const invoke = cloudControlRequest({
    credential,
    fetch: async () => new Response(null, { status: 204 }),
  });
  expect(await invoke({ method: 'DELETE', path: '/v2/projects/project/envs/id' })).toEqual({
    status: 204,
    body: null,
  });
});

test.each([
  async () => {
    throw new Error(canary, { cause: new Error(canary) });
  },
  async () => new Response(canary, { status: 200 }),
  async () => new Response('x'.repeat(1024 * 1024 + 1), { status: 200 }),
  async () => ({ status: 600 }),
])(
  'transport, malformed body and oversized response failures use constant diagnostics',
  async (fetch) => {
    const invoke = cloudControlRequest({ credential, fetch });
    await expect(invoke(request)).rejects.toThrow(
      /^Cloud control-plane operation failed; no raw response is reported\.$/u,
    );
  },
);
