import anyTest, { TestInterface } from 'ava';
import pino from 'pino';

import { Permit } from '../../index';
import { LoggerFactory } from '../../logger';

interface TestContext {
  permit: Permit;
  logger: pino.Logger;
}

const test = anyTest as TestInterface<TestContext>;

test.before((t) => {
  if (process.env.CLOUD_PDP === 'true') {
    t.fail('This test is not supported with cloud PDP');
  }
  const defaultPDPAddress = 'http://localhost:7766';
  const defaultApiAddress =
    process.env.API_TIER === 'prod' ? 'https://api.permit.io' : 'http://localhost:8000';

  const token: string = process.env.PDP_API_KEY || '';
  const pdpAddress: string = process.env.PDP_URL || defaultPDPAddress;
  const apiUrl = process.env.PDP_CONTROL_PLANE || defaultApiAddress;

  if (!token) {
    t.fail('PDP_API_KEY is not configured, test cannot run!');
  }

  t.context.permit = new Permit({
    token,
    pdp: pdpAddress,
    apiUrl,
    log: {
      level: 'debug',
    },
    proxyFactsViaPdp: true,
  });

  t.context.logger = LoggerFactory.createLogger(t.context.permit.config);
});

const sleep = async (seconds: number) => await new Promise((r) => setTimeout(r, seconds * 1000));

const makeRandomId = (prefix: string) => {
  const num = Math.floor(Math.random() * 1_000_000);
  return `${prefix}-${num}`;
};

test('Check local facts proxy to PDP', async (t) => {
  const permit = t.context.permit;

  await permit.api.roles.create({ key: 'admin', name: 'admin' }).catch(() => null);

  await permit.api.resources
    .create({
      key: 'repo',
      name: 'Repository',
      actions: { create: {}, read: {}, update: {}, delete: {} },
    })
    .catch(() => null);

  await permit.api.roles
    .assignPermissions('admin', ['repo:create', 'repo:read', 'repo:update', 'repo:delete'])
    .catch(() => null);
  await permit.api.resourceRoles
    .create('repo', {
      key: 'editor',
      name: 'editor',
    })
    .catch(() => null);
  await permit.api.resourceRoles.assignPermissions('repo', 'editor', ['update']).catch(() => null);

  await sleep(10); // wait for schema to sync

  const adminUserId = makeRandomId('user');
  await permit.api.users.create({ key: adminUserId });
  await permit.api.users.assignRole({ user: adminUserId, role: 'admin', tenant: 'default' });
  await sleep(1); // TODO remove
  t.true(await permit.check(adminUserId, 'create', 'repo'));

  const editorUserId = makeRandomId('user');
  await permit.api.users.create({ key: editorUserId });

  const tenantId = makeRandomId('tenant');
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
  await sleep(1); // TODO remove
  t.true(
    await permit.check(editorUserId, 'update', {
      key: resourceInstanceId,
      type: 'repo',
      tenant: tenantId,
    }),
  );
});
