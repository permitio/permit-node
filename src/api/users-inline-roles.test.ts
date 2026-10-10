import { inspect } from 'node:util';

import axios from 'axios';
import { expect, test } from 'vitest';

import { type UserCreate } from '#src/api/users';
import { Permit, PermitApiError } from '#src/index';
import { startApi } from '#src/tests/helpers/api-test-server';

const token = 'inline-role-forwarding-token';
const scope = { organization_id: 'org', project_id: 'project', environment_id: 'environment' };
const users = '/v2/facts/project/environment/users';
const inline: UserCreate = {
  key: 'new-user',
  attributes: { enabled: false, count: 0, nullable: null },
  role_assignments: [
    { role: 'reader', tenant: 'east' },
    { role: 'editor', tenant: 'west' },
  ],
};
const received = {
  key: inline.key,
  attributes: inline.attributes,
  id: '00000000-0000-4000-8000-000000000001',
  organization_id: 'org',
  project_id: 'project',
  environment_id: 'environment',
  created_at: '2026-10-08T00:00:00Z',
  updated_at: '2026-10-08T00:00:00Z',
  associated_tenants: [
    { tenant: 'east', roles: ['reader'], status: 'active' },
    { tenant: 'west', roles: ['editor'], status: 'active' },
  ],
  future: { enabled: false, values: [null, 0, ''] },
};

for (const proxy of [false, true])
  for (const kind of ['inline', 'empty', 'omitted'] as const)
    test(`user create forwards ${kind} roles via ${proxy ? 'PDP' : 'API'}`, async () => {
      const api = await startApi();
      const facts = proxy ? await startApi() : api;
      const payload: UserCreate =
        kind === 'inline'
          ? structuredClone(inline)
          : kind === 'empty'
            ? { key: inline.key, role_assignments: [] }
            : { key: inline.key };
      const before = structuredClone(payload);
      api.enqueue({ method: 'GET', path: '/v2/api-key/scope' }, { body: scope });
      facts.enqueue({ method: 'POST', path: users, body: before }, { status: 201, body: received });
      const permit = new Permit({
        token,
        apiUrl: api.url,
        pdp: facts.url,
        proxyFactsViaPdp: proxy,
        axiosInstance: axios.create({ proxy: false }),
        retry: false,
        log: { level: 'silent' },
      });
      expect(await permit.api.users.create(payload)).toStrictEqual(received);
      expect(payload).toStrictEqual(before);
      const calls = [...api.requests, ...(proxy ? facts.requests : [])];
      expect(calls.map((call) => [call.method, call.path])).toStrictEqual([
        ['GET', '/v2/api-key/scope'],
        ['POST', users],
      ]);
      expect(calls[1]?.headers.authorization).toBe(`Bearer ${token}`);
      expect(calls[1]?.body).toStrictEqual(before);
      expect(calls.every((call) => !call.path.includes('role_assignments'))).toBe(true);
    });

for (const status of [409, 500])
  test(`user create preserves HTTP ${status}, input and error privacy`, async () => {
    const api = await startApi();
    const payload = structuredClone(inline);
    const before = structuredClone(payload);
    const responseCanary = 'INLINE_ROLE_RESPONSE_ONLY_CANARY';
    api.enqueue({ method: 'GET', path: '/v2/api-key/scope' }, { body: scope });
    api.enqueue(
      { method: 'POST', path: users, body: before },
      { status, body: { private_value: responseCanary, rejected_input: payload } },
    );
    const permit = new Permit({
      token,
      apiUrl: api.url,
      proxyFactsViaPdp: false,
      axiosInstance: axios.create({ proxy: false }),
      retry: false,
      log: { level: 'silent' },
    });
    let failure: unknown;
    try {
      await permit.api.users.create(payload);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(PermitApiError);
    expect(failure).toHaveProperty('status', status);
    expect(payload).toStrictEqual(before);
    expect(api.requests.map((call) => call.method)).toStrictEqual(['GET', 'POST']);
    for (const value of [
      String(failure),
      JSON.stringify(failure),
      inspect(failure, { depth: 10 }),
    ]) {
      expect(value).not.toContain(responseCanary);
      expect(value).not.toContain(token);
    }
  });
