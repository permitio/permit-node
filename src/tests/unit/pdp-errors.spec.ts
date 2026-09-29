import { inspect } from 'util';

import test, { ExecutionContext } from 'ava';

import { Permit, PermitConnectionError, PermitPDPStatusError } from '../../index';
import { CheckConfig } from '../../utils/context';

import { assertPdpRequest, startPdp, TEST_TOKEN } from './pdp-test-server';

const user = {
  key: 'user-1',
  email: 'private-user@example.test',
  attributes: { privateNote: 'private-attribute-value' },
};
const input = {
  user,
  action: 'read',
  resource: { type: 'document', key: 'one', tenant: 'default' },
  context: { source: 'unit-test' },
};

const operations: {
  name: string;
  path: string;
  body: unknown;
  denied: unknown;
  sdk?: string;
  perCallErrors: boolean;
  malformedBodies: unknown[];
  call: (permit: Permit, config?: CheckConfig) => Promise<unknown>;
}[] = [
  {
    name: 'check',
    path: '/allowed',
    body: input,
    denied: false,
    perCallErrors: true,
    malformedBodies: [{}, 'not a PDP response'],
    call: (permit, config) => permit.check(user, 'read', 'document:one', input.context, config),
  },
  {
    name: 'bulkCheck',
    path: '/allowed/bulk',
    body: [input, { ...input, action: 'write', resource: { ...input.resource, key: 'two' } }],
    denied: [false, false],
    perCallErrors: true,
    malformedBodies: [{}, 'not a PDP response'],
    call: (permit, config) =>
      permit.bulkCheck(
        [
          { user, action: 'read', resource: 'document:one' },
          { user, action: 'write', resource: 'document:two' },
        ],
        input.context,
        config,
      ),
  },
  {
    name: 'getUserPermissions',
    path: '/user-permissions',
    body: {
      user,
      tenants: ['tenant-1'],
      resources: ['document:one'],
      resource_types: ['document'],
    },
    denied: {},
    perCallErrors: true,
    // An empty object is a valid, empty permission map.
    malformedBodies: ['not a PDP response', null],
    call: (permit, config) =>
      permit.getUserPermissions(user, ['tenant-1'], ['document:one'], ['document'], config),
  },
  {
    name: 'checkAllTenants',
    path: '/allowed/all-tenants',
    body: { ...input, resource: { type: 'document', key: 'one' } },
    denied: [],
    sdk: 'node',
    perCallErrors: false,
    malformedBodies: [{}, 'not a PDP response'],
    call: (permit) => permit.checkAllTenants(user, 'read', 'document:one', input.context),
  },
];

interface Scenario {
  name: string;
  reply?: { status: number; body: unknown };
  message?: string;
}

const statusMessage = 'got an unexpected status code:';
const statusScenarios: Scenario[] = [
  {
    name: '401',
    reply: { status: 401, body: { detail: 'invalid test credentials' } },
    message: statusMessage,
  },
  {
    name: '500',
    reply: { status: 500, body: { detail: 'test PDP failure' } },
    message: statusMessage,
  },
  {
    name: '201',
    reply: { status: 201, body: { detail: 'unexpected success status' } },
    message: statusMessage,
  },
  { name: '502', reply: { status: 502, body: 'upstream unavailable' }, message: statusMessage },
  { name: 'timeout' },
];

function scenariosFor(operation: { malformedBodies: unknown[] }): Scenario[] {
  const malformed = operation.malformedBodies.map((body) => ({
    name: `200 with body ${JSON.stringify(body)}`,
    reply: { status: 200, body },
    message: 'got an unexpected response body from the PDP',
  }));
  return [...statusScenarios, ...malformed];
}

function assertSafeError(t: ExecutionContext, error: Error | undefined): void {
  if (!error) {
    t.fail('Expected the PDP operation to throw');
    return;
  }
  t.false(inspect(error).includes(TEST_TOKEN));
  t.false(error.message.includes(user.email));
  t.false(error.message.includes('privateNote'));
  t.false(error.message.includes(user.attributes.privateNote));
}

for (const operation of operations) {
  for (const scenario of scenariosFor(operation)) {
    test(`PER-16494: ${operation.name} classifies ${scenario.name}`, async (t) => {
      const reply = scenario.reply;
      const pdp = await startPdp(t, reply);
      const options = {
        token: TEST_TOKEN,
        pdp: pdp.url,
        timeout: reply ? undefined : 500,
        retry: false as const,
        log: { level: 'silent' },
      };
      const permit = new Permit(options);
      const error = await t.throwsAsync(operation.call(permit));
      assertSafeError(t, error);
      if (reply) {
        t.true(error instanceof PermitPDPStatusError);
        t.true(error instanceof PermitConnectionError);
        if (!(error instanceof PermitPDPStatusError)) {
          t.fail('Expected an HTTP status error with status and response body');
          return;
        }
        t.is(error.statusCode, reply.status);
        t.deepEqual(error.responseBody, reply.body);
        t.true(error.message.startsWith(`Permit.${operation.name}() ${scenario.message}`));
        t.true(error.message.includes(String(reply.status)));
        t.false(error.message.includes('cannot connect'));
      } else {
        t.true(error instanceof PermitConnectionError);
        t.false(error instanceof PermitPDPStatusError);
        if (!(error instanceof PermitConnectionError)) {
          t.fail('Expected a connection error for a transport timeout');
          return;
        }
        t.true(error.message.includes('timeout of 500ms exceeded'));
        t.true(error.message.includes(pdp.url));
        t.false('statusCode' in error);
        t.false('responseBody' in error);
      }

      const failClosed = new Permit({ ...options, throwOnError: false });
      t.deepEqual(await operation.call(failClosed), operation.denied);
      if (operation.perCallErrors) {
        t.deepEqual(await operation.call(permit, { throwOnError: false }), operation.denied);
        const overridden = await t.throwsAsync(operation.call(failClosed, { throwOnError: true }));
        assertSafeError(t, overridden);
        t.true(overridden instanceof PermitConnectionError);
        t.is(overridden instanceof PermitPDPStatusError, reply !== undefined);
      }

      t.is(pdp.requests.length, operation.perCallErrors ? 4 : 2);
      for (const request of pdp.requests) {
        assertPdpRequest(t, request, {
          path: operation.path,
          body: operation.body,
          sdk: operation.sdk,
        });
      }
    });
  }
}

const invalidResource = 'document:one:extra';
const inputErrorOperations: {
  name: string;
  denied: unknown;
  call: (permit: Permit) => Promise<unknown>;
}[] = [
  {
    name: 'check',
    denied: false,
    call: (permit) => permit.check('user-1', 'read', invalidResource),
  },
  {
    name: 'bulkCheck',
    denied: [false],
    call: (permit) =>
      permit.bulkCheck([{ user: 'user-1', action: 'read', resource: invalidResource }]),
  },
  {
    name: 'checkAllTenants',
    denied: [],
    call: (permit) => permit.checkAllTenants('user-1', 'read', invalidResource),
  },
];

for (const operation of inputErrorOperations) {
  test(`PER-16494: ${operation.name} applies throwOnError to an invalid resource`, async (t) => {
    const pdp = await startPdp(t, { status: 200, body: {} });
    const options = {
      token: TEST_TOKEN,
      pdp: pdp.url,
      retry: false as const,
      log: { level: 'silent' },
    };
    const error = await t.throwsAsync(operation.call(new Permit(options)));
    t.true(error?.message.includes(invalidResource));
    const failClosed = new Permit({ ...options, throwOnError: false });
    t.deepEqual(await operation.call(failClosed), operation.denied);
    t.is(pdp.requests.length, 0);
  });
}
