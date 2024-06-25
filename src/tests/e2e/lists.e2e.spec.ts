import anyTest, { TestInterface } from 'ava';

import { printBreak, provideTestExecutionContext, TestContext } from '../fixtures';

const sleepTimeMs = 10000;

const test = anyTest as TestInterface<TestContext>;
test.before(provideTestExecutionContext);
test.before(async (t) => {
  const permit = t.context.permit;
  await permit.api.users
    .bulkUserCreate(Array.from({ length: 10 }).map((_, i) => ({ key: `user-${i}` })))
    .catch(() => null);
});

test('List users', async (t) => {
  const permit = t.context.permit;

  const users = await permit.api.users.list();
  t.is(users.total_count, 10);
  t.is(users.data.length, 10);
});

test('List users with pagination', async (t) => {
  const permit = t.context.permit;

  const users = await permit.api.users.list({ page: 1, perPage: 5 });
  t.is(users.total_count, 10);
  t.is(users.data.length, 5);
});

test('List users with search', async (t) => {
  const permit = t.context.permit;

  const users = await permit.api.users.list({ search: 'user-1' });
  t.is(users.total_count, 1);
  t.is(users.data.length, 1);
  t.is(users.data[0].key, 'user-1');
});
