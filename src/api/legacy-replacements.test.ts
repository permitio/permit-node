import { ApiContext } from '#src/api/context';
import { ConditionSetType, Permit } from '#src/index';
import { startApi } from '#src/tests/helpers/api-test-server';

function client(apiUrl: string): Permit {
  const apiContext = new ApiContext();
  apiContext._saveApiKeyAccessibleScope('org', 'project', 'environment');
  apiContext.setEnvironmentLevelContext('org', 'project', 'environment');
  return new Permit({ token: 'fixture', apiUrl, apiContext, log: { level: 'silent' } });
}

test('grouped condition sets retain the legacy type filter and pagination over HTTP', async () => {
  const api = await startApi();
  const sets = [{ key: 'team', type: 'userset' }];
  api.enqueue(
    {
      method: 'GET',
      path: '/v2/schema/project/environment/condition_sets',
      query: [
        ['type', 'userset'],
        ['page', '2'],
        ['per_page', '10'],
      ],
    },
    { body: { data: sets } },
  );
  const result = await client(api.url).api.conditionSets.list({
    type: ConditionSetType.Userset,
    page: 2,
    perPage: 10,
  });
  expect(result).toEqual(sets);
});

test('grouped rule listing preserves unfiltered default pagination', async () => {
  const api = await startApi();
  const rules = [{ user_set: 'team', resource_set: 'documents', permission: 'document:read' }];
  api.enqueue(
    {
      method: 'GET',
      path: '/v2/facts/project/environment/set_rules',
      query: [
        ['page', '1'],
        ['per_page', '100'],
      ],
    },
    { body: rules },
  );
  expect(await client(api.url).api.conditionSetRules.list()).toEqual(rules);
});

test.each([
  ['userSetKey', 'user_set'],
  ['permissionKey', 'permission'],
  ['resourceSetKey', 'resource_set'],
] as const)(
  'grouped rule filter %s remains independent and retains encoded values',
  async (filter, query) => {
    const api = await startApi();
    api.enqueue(
      {
        method: 'GET',
        path: '/v2/facts/project/environment/set_rules',
        query: [
          [query, 'team /ops'],
          ['page', '2'],
          ['per_page', '10'],
        ],
      },
      { body: [] },
    );
    expect(
      await client(api.url).api.conditionSetRules.list({
        [filter]: 'team /ops',
        page: 2,
        perPage: 10,
      }),
    ).toEqual([]);
  },
);
