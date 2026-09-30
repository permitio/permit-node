import { inspect } from 'node:util';

import { Permit, PermitConnectionError, PermitPDPStatusError } from '#src/index';
import { type CheckConfig } from '#src/utils/context';
import { assertPdpRequest, startPdp, TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';
import { rejectionOf } from '#src/tests/helpers/rejection';

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
  sdk?: string | undefined;
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

function assertSafeError(error: Error): void {
  expect(inspect(error)).not.toContain(TEST_TOKEN);
  expect(error.message).not.toContain(user.email);
  expect(error.message).not.toContain('privateNote');
  expect(error.message).not.toContain(user.attributes.privateNote);
}

describe('PDP error classification (unit)', () => {
  for (const operation of operations) {
    for (const scenario of scenariosFor(operation)) {
      it(`PER-16494: ${operation.name} classifies ${scenario.name}`, async () => {
        const reply = scenario.reply;
        const pdp = await startPdp(reply);
        const options = {
          token: TEST_TOKEN,
          pdp: pdp.url,
          timeout: reply ? undefined : 500,
          retry: false as const,
          log: { level: 'silent' },
        };
        const permit = new Permit(options);
        const error = await rejectionOf(operation.call(permit));
        assertSafeError(error);
        if (reply) {
          expect(error).toBeInstanceOf(PermitPDPStatusError);
          expect(error).toBeInstanceOf(PermitConnectionError);
          assert(
            error instanceof PermitPDPStatusError,
            'Expected an HTTP status error with status and response body',
          );
          expect(error.statusCode).toBe(reply.status);
          expect(error.responseBody).toStrictEqual(reply.body);
          const prefix = `Permit.${operation.name}() ${scenario.message}`;
          expect(error.message.startsWith(prefix), error.message).toBe(true);
          expect(error.message).toContain(String(reply.status));
          expect(error.message).not.toContain('cannot connect');
        } else {
          expect(error).toBeInstanceOf(PermitConnectionError);
          expect(error).not.toBeInstanceOf(PermitPDPStatusError);
          assert(
            error instanceof PermitConnectionError,
            'Expected a connection error for a transport timeout',
          );
          expect(error.message).toContain('timeout of 500ms exceeded');
          expect(error.message).toContain(pdp.url);
          expect('statusCode' in error).toBe(false);
          expect('responseBody' in error).toBe(false);
        }

        const failClosed = new Permit({ ...options, throwOnError: false });
        expect(await operation.call(failClosed)).toStrictEqual(operation.denied);
        if (operation.perCallErrors) {
          expect(await operation.call(permit, { throwOnError: false })).toStrictEqual(
            operation.denied,
          );
          const overridden = await rejectionOf(operation.call(failClosed, { throwOnError: true }));
          assertSafeError(overridden);
          expect(overridden).toBeInstanceOf(PermitConnectionError);
          expect(overridden instanceof PermitPDPStatusError).toBe(reply !== undefined);
        }

        expect(pdp.requests).toHaveLength(operation.perCallErrors ? 4 : 2);
        for (const request of pdp.requests) {
          assertPdpRequest(request, {
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
    it(`PER-16494: ${operation.name} applies throwOnError to an invalid resource`, async () => {
      const pdp = await startPdp({ status: 200, body: {} });
      const options = {
        token: TEST_TOKEN,
        pdp: pdp.url,
        retry: false as const,
        log: { level: 'silent' },
      };
      const error = await rejectionOf(operation.call(new Permit(options)));
      expect(error.message).toContain(invalidResource);
      const failClosed = new Permit({ ...options, throwOnError: false });
      expect(await operation.call(failClosed)).toStrictEqual(operation.denied);
      expect(pdp.requests).toHaveLength(0);
    });
  }
});
