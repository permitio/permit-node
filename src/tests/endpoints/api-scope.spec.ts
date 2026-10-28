import { randomUUID } from 'node:crypto';

import { ApiContextLevel, ApiKeyLevel } from '#src/api/context';
import { createTestClient } from '#src/tests/fixtures';

it('environment key discovers its selected scope and returns a real users envelope', async () => {
  const { permit } = createTestClient();
  expect(permit.config.apiContext.contextLevel).toBe(ApiContextLevel.WAIT_FOR_INIT);
  await permit.api.ensureAccessLevel(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
  expect(permit.config.apiContext.permittedAccessLevel).toBe(ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY);
  expect(permit.config.apiContext.contextLevel).toBe(ApiContextLevel.ENVIRONMENT);
  const selected = permit.config.apiContext.environmentContext;
  expect(selected.projId).toEqual(expect.any(String));
  expect(selected.envId).toEqual(expect.any(String));
  expect(selected.projId.length).toBeGreaterThan(0);
  expect(selected.envId.length).toBeGreaterThan(0);
  const users = await permit.api.users.list({
    search: `absent-${randomUUID()}`,
    page: 1,
    perPage: 2,
  });
  expect(users).toMatchObject({ data: [], total_count: 0 });
  expect(Array.isArray(users.data)).toBe(true);
  expect(permit.config.apiContext.environmentContext).toStrictEqual(selected);
});
