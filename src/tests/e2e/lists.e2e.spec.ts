import { IPermitClient } from '../../index';
import { createTestClient } from '../fixtures';
import { waitFor } from '../helpers/wait-for';

let permit: IPermitClient;

// A run-unique prefix keeps these assertions scoped to the users this spec
// created, so they hold regardless of what other suites leave in the shared
// environment (no absolute-count assertions).
const PREFIX = `lists-${process.pid}-${Date.now()}`;
const USER_KEYS = Array.from({ length: 10 }).map((_, i) => `${PREFIX}-user-${i}`);

beforeAll(async () => {
  ({ permit } = createTestClient());
  await permit.api.users.bulkUserCreate(USER_KEYS.map((key) => ({ key })));
  // Bulk create is eventually consistent; gate until all 10 users are listable
  // so the exact-count assertions below don't race the write propagating.
  await waitFor(
    async () => (await permit.api.users.list({ search: PREFIX, perPage: 100 })).total_count === 10,
    { timeoutMs: 60_000, intervalMs: 1_000, message: 'created users not yet listable' },
  );
});

afterAll(async () => {
  if (!permit) return; // beforeAll never initialized the client (e.g. missing key)
  await permit.api.users.bulkUserDelete(USER_KEYS).catch(() => null);
});

it('List users scoped by prefix returns exactly the created users', async () => {
  const users = await permit.api.users.list({ search: PREFIX });
  expect(users.total_count).toBe(10);
  expect(users.data.length).toBe(10);
});

it('List users with pagination over the scoped subset', async () => {
  const users = await permit.api.users.list({ search: PREFIX, page: 1, perPage: 5 });
  expect(users.total_count).toBe(10);
  expect(users.data.length).toBe(5);
});

it('List users searching a single full key returns one user', async () => {
  const oneKey = USER_KEYS[0];
  const users = await permit.api.users.list({ search: oneKey });
  expect(users.total_count).toBe(1);
  expect(users.data.length).toBe(1);
  expect(users.data[0].key).toBe(oneKey);
});
