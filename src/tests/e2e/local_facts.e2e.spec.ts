import { IPermitClient, IResource } from '../../index';
import { cleanUp, createTestClient } from '../fixtures';
import { waitForCheck } from '../helpers/wait-for';

let permit: IPermitClient;

// Keys unique to this run, so entities left by another spec or an earlier run can't change the
// results.
const RUN_ID = `${process.pid}_${Date.now()}`;
const unique = (key: string) => `local_facts_${key}_${RUN_ID}`;
const ADMIN = unique('admin');
const REPO = unique('repo');
const EDITOR = 'editor';
const TENANT = 'default';

// With proxyFactsViaPdp, a write sent with waitForSync(FACT_SYNC_TIMEOUT_S, 'fail') returns
// only after the PDP has applied it, and fails with 424 if that takes longer. A check made right
// after the write must therefore see it; these tests assert exactly that, without polling.
const FACT_SYNC_TIMEOUT_S = 30;

// Keys this spec creates at runtime, tracked so afterAll can delete exactly what was created.
const createdUserKeys: string[] = [];
const createdTenantKeys: string[] = [];

beforeAll(async () => {
  if (process.env.CLOUD_PDP === 'true') {
    throw new Error('This test is not supported with cloud PDP');
  }
  ({ permit } = createTestClient({ proxyFactsViaPdp: true }));
  await setupSchema(permit);
  await waitForSchema(permit);
});

afterAll(async () => {
  if (!permit) return; // beforeAll never initialized the client (e.g. missing key)
  // Deleting the resource removes its resource role and instances.
  const steps: Record<string, () => Promise<unknown>> = {};
  for (const key of createdUserKeys) {
    steps[`user ${key}`] = () => permit.api.users.delete(key);
  }
  for (const key of createdTenantKeys) {
    steps[`tenant ${key}`] = () => permit.api.tenants.delete(key);
  }
  steps[`resource ${REPO}`] = () => permit.api.resources.delete(REPO);
  steps[`role ${ADMIN}`] = () => permit.api.roles.delete(ADMIN);
  await cleanUp(steps);
});

const setupSchema = async (client: IPermitClient) => {
  await client.api.roles.create({ key: ADMIN, name: 'admin' });
  await client.api.resources.create({
    key: REPO,
    name: 'Repository',
    actions: { create: {}, read: {}, update: {}, delete: {} },
  });
  await client.api.roles.assignPermissions(ADMIN, [
    `${REPO}:create`,
    `${REPO}:read`,
    `${REPO}:update`,
    `${REPO}:delete`,
  ]);
  await client.api.resourceRoles.create(REPO, { key: EDITOR, name: 'editor' });
  await client.api.resourceRoles.assignPermissions(REPO, EDITOR, ['update']);
};

/** Creates a user through the PDP, returning once the PDP has applied it. */
async function createUser(client: IPermitClient, key: string): Promise<void> {
  createdUserKeys.push(key);
  await client.api.users.waitForSync(FACT_SYNC_TIMEOUT_S, 'fail').create({ key });
}

/** Creates a tenant and a repo instance in it through the PDP, returning once both apply. */
async function createRepoInstance(client: IPermitClient, name: string): Promise<IResource> {
  const tenant = unique(`${name}_tenant`);
  const key = unique(`${name}_repo`);
  createdTenantKeys.push(tenant);
  await client.api.tenants
    .waitForSync(FACT_SYNC_TIMEOUT_S, 'fail')
    .create({ key: tenant, name: 'My Tenant' });
  await client.api.resourceInstances
    .waitForSync(FACT_SYNC_TIMEOUT_S, 'fail')
    .create({ key, resource: REPO, tenant });
  return { type: REPO, key, tenant };
}

/**
 * The schema reaches the PDP on its own schedule, unlike the facts the tests write. Wait for it
 * once, through one user per role, so each test can check right after its own writes.
 */
async function waitForSchema(client: IPermitClient): Promise<void> {
  const admin = unique('schema_admin');
  await createUser(client, admin);
  await client.api.users
    .waitForSync(FACT_SYNC_TIMEOUT_S, 'fail')
    .assignRole({ user: admin, role: ADMIN, tenant: TENANT });
  await waitForCheck(() => client.check(admin, 'create', REPO), true, {
    message: `the ${ADMIN} role did not reach the PDP`,
  });

  const editor = unique('schema_editor');
  await createUser(client, editor);
  const repo = await createRepoInstance(client, 'schema');
  await client.api.users
    .waitForSync(FACT_SYNC_TIMEOUT_S, 'fail')
    .assignRole({ user: editor, role: EDITOR, resource_instance: `${REPO}:${repo.key}` });
  await waitForCheck(() => client.check(editor, 'update', repo), true, {
    message: `the ${REPO} ${EDITOR} role did not reach the PDP`,
  });
}

it('Check assign role', async () => {
  const adminUserId = unique('user');
  await createUser(permit, adminUserId);

  await permit.api.users
    .waitForSync(FACT_SYNC_TIMEOUT_S, 'fail')
    .assignRole({ user: adminUserId, role: ADMIN, tenant: TENANT });

  expect(await permit.check(adminUserId, 'create', REPO)).toBe(true);
});

it('Check assign resource instance role', async () => {
  const editorUserId = unique('editor_user');
  await createUser(permit, editorUserId);
  const repo = await createRepoInstance(permit, 'test');

  await permit.api.users.waitForSync(FACT_SYNC_TIMEOUT_S, 'fail').assignRole({
    user: editorUserId,
    role: EDITOR,
    resource_instance: `${REPO}:${repo.key}`,
  });

  expect(await permit.check(editorUserId, 'update', repo)).toBe(true);
});
