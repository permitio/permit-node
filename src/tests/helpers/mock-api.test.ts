import { expect, test } from 'vitest';

import { PermitApiError } from '#src/index';
import { createMockPermit } from '#src/tests/helpers/mock-api';

test('unqueued mock traffic rejects instead of fabricating a successful response', async () => {
  const { permit, rest } = createMockPermit();
  await expect(permit.api.users.get('unexpected')).rejects.toBeInstanceOf(PermitApiError);
  expect(rest.requests).toHaveLength(1);
  expect(rest.last?.path).toBe('/v2/facts/proj/env/users/unexpected');
});

test('explicit null and default undefined replies retain their distinct wire semantics', async () => {
  const { permit, rest } = createMockPermit();
  rest.resolveWith(null);
  expect(await permit.api.users.get('null')).toBeNull();
  rest.resolveWith(undefined);
  expect(await permit.api.users.get('undefined')).toStrictEqual({});
  rest.resolveWith();
  expect(await permit.api.users.get('default')).toStrictEqual({});
  expect(rest.requests).toHaveLength(3);
});
