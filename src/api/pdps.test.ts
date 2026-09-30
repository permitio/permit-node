import { expect, test } from 'vitest';

import { PermitContextError } from '#src/api/context';
import { createMockPermit, MOCK_API_ORIGIN } from '#src/tests/helpers/mock-api';

const acknowledgement = { update_id: 'update-id', pdp_ids: ['pdp-one', 'pdp-two'] };

test.each([false, true])(
  'environment refresh returns its acknowledgement on control-plane transport (proxy=%s)',
  async (proxyFactsViaPdp) => {
    const { permit, rest } = createMockPermit({
      proxyFactsViaPdp,
      project: 'project / east',
      environment: 'environment east',
    });
    const result = { ...acknowledgement, future_field: null };
    const request = { reason: 'Reload external data / east' };
    rest.resolveWith(result);
    expect(await permit.api.pdps.refresh(request)).toEqual(result);
    expect(rest.last).toMatchObject({
      method: 'POST',
      origin: MOCK_API_ORIGIN,
      path: '/v2/pdps/project%20%2F%20east/environment%20east/configs/refresh',
      data: request,
      params: {},
    });
    expect(rest.last?.headers.get('Content-Type')).toBe('application/json');
    expect(rest.last?.headers.get('Authorization')).toBe('Bearer test-token');
    expect(rest.last?.headers.has('X-Wait-Timeout')).toBe(false);
    expect(rest.last?.headers.has('X-Timeout-Policy')).toBe(false);
    expect(rest.requests).toHaveLength(1);
  },
);

test('refresh allows the optional body to be omitted and preserves an empty reason', async () => {
  const { permit, rest } = createMockPermit();
  rest.resolveWith(acknowledgement);
  expect(await permit.api.pdps.refresh()).toEqual(acknowledgement);
  expect(rest.last?.data).toEqual({});
  rest.resolveWith(acknowledgement);
  expect(await permit.api.pdps.refresh({ reason: '' })).toEqual(acknowledgement);
  expect(rest.last?.data).toEqual({ reason: '' });
  expect(rest.requests).toHaveLength(2);
});

test('refresh follows the selected environment under an organization key', async () => {
  const { permit, rest } = createMockPermit({ contextLevel: 'organization' });
  permit.config.apiContext.setEnvironmentLevelContext('org', 'selected-project', 'selected-env');
  rest.resolveWith(acknowledgement);
  expect(await permit.api.pdps.refresh()).toEqual(acknowledgement);
  expect(rest.last?.path).toBe('/v2/pdps/selected-project/selected-env/configs/refresh');
});

test('refresh requires environment context before dispatch', async () => {
  const { permit, rest } = createMockPermit({ contextLevel: 'project' });
  await expect(permit.api.pdps.refresh()).rejects.toBeInstanceOf(PermitContextError);
  expect(rest.requests).toHaveLength(0);
});

test.each([403, 404, 422, 503])(
  'environment refresh surfaces write/scope/limit/server errors (%s)',
  async (status) => {
    const { permit, rest } = createMockPermit();
    rest.rejectWith(status, { message: 'refresh rejected' });
    await expect(permit.api.pdps.refresh({ reason: 'fixture' })).rejects.toMatchObject({
      name: 'PermitApiError',
      status,
    });
    expect(rest.requests).toHaveLength(1);
  },
);
