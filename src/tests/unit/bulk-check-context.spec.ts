import test from 'ava';
import pino from 'pino';

import { ConfigFactory } from '../../config';
import { Enforcer } from '../../enforcement/enforcer';

import { assertPdpRequest, startPdp, TEST_TOKEN } from './pdp-test-server';

test('PER-16492: bulk context uses check over method over global', async (t) => {
  const pdp = await startPdp(t, {
    status: 200,
    body: { allow: [{ allow: true }, { allow: false }, { allow: true }] },
  });
  const enforcer = new Enforcer(
    ConfigFactory.build({ token: TEST_TOKEN, pdp: pdp.url, retry: false }),
    pino({ level: 'silent' }),
  );
  const globalContext = Object.freeze({ globalOnly: true, shared: 'global', methodWins: 'global' });
  const methodContext = Object.freeze({ methodOnly: true, shared: 'method', methodWins: 'method' });
  const firstContext = Object.freeze({ shared: 'first', firstOnly: true });
  const secondContext = Object.freeze({ shared: 'second', secondOnly: true });
  enforcer.contextStore.add(globalContext);

  const first = { user: 'user-1', action: 'read', resource: 'document:one', context: firstContext };
  const second = {
    user: 'user-1',
    action: 'write',
    resource: 'document:two',
    context: secondContext,
  };
  const third = { user: 'user-1', action: 'read', resource: 'document:three' };
  const checks = [first, second, third];
  const inputSnapshot = JSON.stringify({ checks, globalContext, methodContext });

  t.deepEqual(await enforcer.bulkCheck(checks, methodContext), [true, false, true]);
  t.is(pdp.requests.length, 1);
  assertPdpRequest(t, pdp.requests[0], {
    path: '/allowed/bulk',
    body: [
      {
        user: { key: 'user-1' },
        action: 'read',
        resource: { type: 'document', key: 'one', tenant: 'default' },
        context: {
          globalOnly: true,
          shared: 'first',
          methodWins: 'method',
          methodOnly: true,
          firstOnly: true,
        },
      },
      {
        user: { key: 'user-1' },
        action: 'write',
        resource: { type: 'document', key: 'two', tenant: 'default' },
        context: {
          globalOnly: true,
          shared: 'second',
          methodWins: 'method',
          methodOnly: true,
          secondOnly: true,
        },
      },
      {
        user: { key: 'user-1' },
        action: 'read',
        resource: { type: 'document', key: 'three', tenant: 'default' },
        context: { globalOnly: true, shared: 'method', methodWins: 'method', methodOnly: true },
      },
    ],
  });
  t.is(JSON.stringify({ checks, globalContext, methodContext }), inputSnapshot);
  t.deepEqual(enforcer.contextStore.getDerivedContext({}), globalContext);
});

test('PER-16492: bulk context overrides globals without method context', async (t) => {
  const pdp = await startPdp(t, { status: 200, body: { allow: [{ allow: true }] } });
  const enforcer = new Enforcer(
    ConfigFactory.build({ token: TEST_TOKEN, pdp: pdp.url, retry: false }),
    pino({ level: 'silent' }),
  );
  enforcer.contextStore.add({ shared: 'global', globalOnly: true, nested: { global: true } });

  t.deepEqual(
    await enforcer.bulkCheck([
      {
        user: 'user-1',
        action: 'read',
        resource: 'document:one',
        context: { shared: 'check', nested: { check: true } },
      },
    ]),
    [true],
  );
  t.is(pdp.requests.length, 1);
  assertPdpRequest(t, pdp.requests[0], {
    path: '/allowed/bulk',
    body: [
      {
        user: { key: 'user-1' },
        action: 'read',
        resource: { type: 'document', key: 'one', tenant: 'default' },
        context: { shared: 'check', globalOnly: true, nested: { check: true } },
      },
    ],
  });
});
