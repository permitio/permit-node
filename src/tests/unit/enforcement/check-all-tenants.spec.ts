import pino from 'pino';

import { ConfigFactory } from '#src/config';
import { Enforcer } from '#src/enforcement/enforcer';
import { Permit } from '#src/index';
import { assertPdpRequest, startPdp, TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';

describe('checkAllTenants (unit)', () => {
  it('PER-15318: checkAllTenants sends string inputs and maps allowed_tenants', async () => {
    const tenants = [
      { key: 'tenant-1', attributes: { region: 'west' } },
      { key: 'tenant-2', attributes: {} },
    ];
    const pdp = await startPdp({
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

    expect(await permit.checkAllTenants('user-1', 'read', 'document:one')).toStrictEqual(tenants);
    expect(pdp.requests).toHaveLength(1);
    assertPdpRequest(pdp.requests[0], {
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

  it('PER-15318: checkAllTenants preserves object inputs and maps an empty result', async () => {
    const pdp = await startPdp({ status: 200, body: { allowed_tenants: [] } });
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

    expect(
      await permit.checkAllTenants(user, 'read', resource, context, 'custom-sdk'),
    ).toStrictEqual([]);
    expect(pdp.requests).toHaveLength(1);
    assertPdpRequest(pdp.requests[0], {
      path: '/allowed/all-tenants',
      sdk: 'custom-sdk',
      body: { user, action: 'read', resource, context },
    });
    expect(JSON.stringify({ user, resource, context })).toBe(snapshot);
  });

  it('PER-15318: checkAllTenants merges global context without adding a tenant', async () => {
    const pdp = await startPdp({ status: 200, body: { allowed_tenants: [] } });
    const enforcer = new Enforcer(
      ConfigFactory.build({ token: TEST_TOKEN, pdp: pdp.url }),
      pino({ level: 'silent' }),
    );
    const globalContext = { globalOnly: true, shared: 'global' };
    const context = { localOnly: true, shared: 'local' };
    enforcer.contextStore.add(globalContext);

    expect(await enforcer.checkAllTenants('user-1', 'read', 'document:one', context)).toStrictEqual(
      [],
    );
    expect(pdp.requests).toHaveLength(1);
    assertPdpRequest(pdp.requests[0], {
      path: '/allowed/all-tenants',
      sdk: 'node',
      body: {
        user: { key: 'user-1' },
        action: 'read',
        resource: { type: 'document', key: 'one' },
        context: { globalOnly: true, shared: 'local', localOnly: true },
      },
    });
    expect(context).toStrictEqual({ localOnly: true, shared: 'local' });
    expect(enforcer.contextStore.getDerivedContext({})).toStrictEqual(globalContext);
  });
});
