import test from 'ava';
import pino from 'pino';

import { ConfigFactory } from '../../config';
import { Enforcer } from '../../enforcement/enforcer';
import { Permit } from '../../index';

import { assertPdpRequest, startPdp, TEST_TOKEN } from './pdp-test-server';

test('PER-15318: checkAllTenants sends string inputs and maps allowed_tenants', async (t) => {
  const tenants = [
    { key: 'tenant-1', attributes: { region: 'west' } },
    { key: 'tenant-2', attributes: {} },
  ];
  const pdp = await startPdp(t, {
    status: 200,
    body: { allowed_tenants: tenants.map((tenant) => ({ tenant })) },
  });
  const permit = new Permit({
    token: TEST_TOKEN,
    pdp: pdp.url,
    retry: false,
    log: { level: 'silent' },
    multiTenancy: { defaultTenant: 'must-not-be-added' },
  });

  t.deepEqual(await permit.checkAllTenants('user-1', 'read', 'document:one'), tenants);
  t.is(pdp.requests.length, 1);
  assertPdpRequest(t, pdp.requests[0], {
    path: '/allowed/all-tenants',
    sdk: 'node',
    body: {
      user: { key: 'user-1' },
      action: 'read',
      resource: { type: 'document', key: 'one' },
      context: {},
    },
  });
});

test('PER-15318: checkAllTenants preserves object inputs and maps an empty result', async (t) => {
  const pdp = await startPdp(t, { status: 200, body: { allowed_tenants: [] } });
  const permit = new Permit({
    token: TEST_TOKEN,
    pdp: pdp.url,
    retry: false,
    log: { level: 'silent' },
  });
  const user = { key: 'user-1', attributes: { department: 'engineering' } };
  const resource = { type: 'document', key: 'one', attributes: { classification: 'public' } };
  const context = { source: 'unit-test' };
  const snapshot = JSON.stringify({ user, resource, context });

  t.deepEqual(await permit.checkAllTenants(user, 'read', resource, context, 'custom-sdk'), []);
  t.is(pdp.requests.length, 1);
  assertPdpRequest(t, pdp.requests[0], {
    path: '/allowed/all-tenants',
    sdk: 'custom-sdk',
    body: { user, action: 'read', resource, context },
  });
  t.is(JSON.stringify({ user, resource, context }), snapshot);
});

test('PER-15318: checkAllTenants merges global context without adding a tenant', async (t) => {
  const pdp = await startPdp(t, { status: 200, body: { allowed_tenants: [] } });
  const enforcer = new Enforcer(
    ConfigFactory.build({ token: TEST_TOKEN, pdp: pdp.url }),
    pino({ level: 'silent' }),
  );
  const globalContext = { globalOnly: true, shared: 'global' };
  const context = { localOnly: true, shared: 'local' };
  enforcer.contextStore.add(globalContext);

  t.deepEqual(await enforcer.checkAllTenants('user-1', 'read', 'document:one', context), []);
  t.is(pdp.requests.length, 1);
  assertPdpRequest(t, pdp.requests[0], {
    path: '/allowed/all-tenants',
    sdk: 'node',
    body: {
      user: { key: 'user-1' },
      action: 'read',
      resource: { type: 'document', key: 'one' },
      context: { globalOnly: true, shared: 'local', localOnly: true },
    },
  });
  t.deepEqual(context, { localOnly: true, shared: 'local' });
  t.deepEqual(enforcer.contextStore.getDerivedContext({}), globalContext);
});
