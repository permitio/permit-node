import { AxiosError } from 'axios';
import { expect, test } from 'vitest';

import { PermitApiError } from '#src/api/base';
import { PermitContextError } from '#src/api/context';
import { createMockPermit, MOCK_API_ORIGIN } from '#src/tests/helpers/mock-api';

test.each([false, true])(
  'new-user tenant membership stays on the control plane (proxy=%s)',
  async (proxyFactsViaPdp) => {
    const { permit, rest } = createMockPermit({
      proxyFactsViaPdp,
      project: 'project / east',
      environment: 'environment east',
    });
    const user = { key: 'alice', attributes: { region: null, nested: { active: true } } };
    const result = { ...user, id: 'user-id', tenants: ['east'], future_field: null };
    rest.resolveWith(result);
    expect(await permit.api.tenants.addUser('tenant / east', user)).toEqual(result);
    expect(rest.last).toMatchObject({
      method: 'POST',
      origin: MOCK_API_ORIGIN,
      path: '/v2/facts/project%20%2F%20east/environment%20east/tenants/tenant%20%2F%20east/users',
      params: {},
      data: user,
    });
    expect(rest.last?.data).not.toHaveProperty('role_assignments');
    expect(rest.last?.headers.get('Content-Type')).toBe('application/json');
    expect(rest.last?.headers.get('Authorization')).toBe('Bearer test-token');
    expect(rest.last?.headers.has('X-Wait-Timeout')).toBe(false);
    expect(rest.last?.headers.has('X-Timeout-Policy')).toBe(false);
  },
);

test('tenant waitForSync clones cannot imply waiting for unsynchronized membership', async () => {
  const { permit, rest } = createMockPermit({ proxyFactsViaPdp: true });
  const user = { key: 'alice', role_assignments: [{ role: 'reader', tenant: 'east' }] };
  rest.resolveWith(user);
  expect(await permit.api.tenants.waitForSync(null, 'fail').addUser('tenant-id', user)).toEqual(
    user,
  );
  expect(rest.last?.origin).toBe(MOCK_API_ORIGIN);
  expect(rest.last?.path).toBe('/v2/facts/proj/env/tenants/tenant-id/users');
  expect(rest.last?.data).toEqual(user);
  expect(rest.last?.headers.has('X-Wait-Timeout')).toBe(false);
  expect(rest.last?.headers.has('X-Timeout-Policy')).toBe(false);
});

test('new-user membership follows the selected environment after changing context', async () => {
  const { permit, rest } = createMockPermit({ contextLevel: 'organization' });
  permit.config.apiContext.setEnvironmentLevelContext('org', 'selected-project', 'selected-env');
  await permit.api.tenants.addUser('east', { key: 'alice' });
  expect(rest.last?.path).toBe('/v2/facts/selected-project/selected-env/tenants/east/users');
});

test('membership requires environment context before dispatch', async () => {
  const { permit, rest } = createMockPermit({ contextLevel: 'project' });
  await expect(permit.api.tenants.addUser('east', { key: 'alice' })).rejects.toBeInstanceOf(
    PermitContextError,
  );
  expect(rest.requests).toHaveLength(0);
});

test.each([404, 409, 422, 503])(
  'tenant membership preserves named HTTP failures (%s)',
  async (status) => {
    const { permit, rest } = createMockPermit();
    rest.rejectWith(status, { message: 'membership rejected', detail: 'private attributes' });
    await expect(permit.api.tenants.addUser('east', { key: 'alice' })).rejects.toMatchObject({
      name: 'PermitApiError',
      status,
    });
    expect(rest.requests).toHaveLength(1);
  },
);

test('membership normalizes a transport rejection without retaining caller errors', async () => {
  const { permit } = createMockPermit();
  const original = new AxiosError('connection unavailable', 'ECONNREFUSED');
  permit.config.axiosInstance.defaults.adapter = async () => {
    throw original;
  };
  const error = await permit.api.tenants
    .addUser('east', { key: 'alice' })
    .catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(PermitApiError);
  expect(error).toMatchObject({ code: 'ECONNREFUSED' });
  expect(error).not.toBe(original);
  expect(original.message).toBe('connection unavailable');
});
