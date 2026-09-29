import { IPermitClient } from '../../index';
import { createTestClient } from '../fixtures';
import { waitForCheck } from '../helpers/wait-for';

let permit: IPermitClient;

// Keys this spec creates at runtime, tracked so afterAll can purge exactly what
// was created and leave the shared env empty for the next spec.
const createdUserKeys: string[] = [];
const createdTenantKeys: string[] = [];

beforeAll(async () => {
  if (process.env.CLOUD_PDP === 'true') {
    throw new Error('This test is not supported with cloud PDP');
  }
  ({ permit } = createTestClient({ proxyFactsViaPdp: true }));
  await setupSchema(permit);
});

afterAll(async () => {
  if (!permit) return; // beforeAll never initialized the client (e.g. missing key)
  // Purge runtime-created users and tenants, then the schema setupSchema built.
  // Deleting the resource cascades to its resource-role and resource instances.
  // Every delete is tolerant so a missing entity (created in a test that never
  // ran, or that failed early) does not throw.
  for (const key of createdUserKeys) {
    await permit.api.users.delete(key).catch(() => undefined);
  }
  for (const key of createdTenantKeys) {
    await permit.api.tenants.delete(key).catch(() => undefined);
  }
  await permit.api.resourceRoles.delete('repo', 'editor').catch(() => undefined);
  await permit.api.resources.delete('repo').catch(() => undefined);
  await permit.api.roles.delete('admin').catch(() => undefined);
});

const setupSchema = async (client: IPermitClient) => {
  await client.api.roles.create({ key: 'admin', name: 'admin' }).catch(() => null);

  await client.api.resources
    .create({
      key: 'repo',
      name: 'Repository',
      actions: { create: {}, read: {}, update: {}, delete: {} },
    })
    .catch(() => null);

  await client.api.roles
    .assignPermissions('admin', ['repo:create', 'repo:read', 'repo:update', 'repo:delete'])
    .catch(() => null);
  await client.api.resourceRoles
    .create('repo', {
      key: 'editor',
      name: 'editor',
    })
    .catch(() => null);
  await client.api.resourceRoles.assignPermissions('repo', 'editor', ['update']).catch(() => null);
};

const makeRandomId = (prefix: string) => {
  const num = Math.floor(Math.random() * 1_000_000);
  return `${prefix}-${num}`;
};

it('Check assign role', async () => {
  const adminUserId = makeRandomId('user');
  createdUserKeys.push(adminUserId);
  await permit.api.users.create({ key: adminUserId });
  await permit.api.users.assignRole({ user: adminUserId, role: 'admin', tenant: 'default' });
  await waitForCheck(() => permit.check(adminUserId, 'create', 'repo'), true);
  expect(await permit.check(adminUserId, 'create', 'repo')).toBe(true);
});

it('Check assign resource instance role', async () => {
  const editorUserId = makeRandomId('user');
  createdUserKeys.push(editorUserId);
  await permit.api.users.create({ key: editorUserId });

  const tenantId = makeRandomId('tenant');
  createdTenantKeys.push(tenantId);
  await permit.api.tenants.create({ key: tenantId, name: 'My Tenant' });

  const resourceInstanceId = makeRandomId('repo');
  await permit.api.resourceInstances.create({
    key: resourceInstanceId,
    resource: 'repo',
    tenant: tenantId,
  });
  await permit.api.users.assignRole({
    user: editorUserId,
    role: 'editor',
    resource_instance: `repo:${resourceInstanceId}`,
  });
  const resource = { key: resourceInstanceId, type: 'repo', tenant: tenantId };
  await waitForCheck(() => permit.check(editorUserId, 'update', resource), true);
  expect(await permit.check(editorUserId, 'update', resource)).toBe(true);
});

// Skipped: this assertion is inherently racy. It assigns a role with
// waitForSync(0) (explicitly NOT waiting for the fact to propagate) and then
// immediately expects check() === false. Whether the role has propagated yet is
// a timing race, so it cannot be made deterministic with event-based waiting.
// The waitForSync(0) contract (that it sets X-Wait-Timeout: 0 on a cloned
// client and is a no-op without proxyFactsViaPdp) is covered deterministically
// by src/tests/unit/wait-for-sync.spec.ts.
it.skip('Check skip wait', async () => {
  const userId = makeRandomId('user');
  createdUserKeys.push(userId);
  await permit.api.users.create({ key: userId });
  // explicitly skip wait for role assignment to sync
  await permit.api.users.waitForSync(0).assignRole({
    user: userId,
    role: 'admin',
    tenant: 'default',
  });
  expect(await permit.check(userId, 'create', 'repo')).toBe(false);
});
