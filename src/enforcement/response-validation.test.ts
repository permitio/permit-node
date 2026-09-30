import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import axios from 'axios';

import { Permit, PermitError, PermitPDPStatusError } from '#src/index';
import { type ICheckQuery } from '#src/enforcement/interfaces';
import { startPdp, TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';
import { type CheckConfig } from '#src/utils/context';

const checks: ICheckQuery[] = [
  { user: 'user', action: 'read', resource: 'document:one' },
  { user: 'user', action: 'write', resource: 'document:two' },
];
const tenant = { key: 'tenant', attributes: { region: 'west' }, name: 'Tenant' };
const permissionMap = {
  result: { permissions: ['read'], roles: ['reader'], detail: { additive: true } },
  permissions: { permissions: [], tenant },
  document: {
    permissions: ['document:read'],
    tenant,
    resource: { type: 'document', key: 'one', attributes: {}, name: 'Document' },
  },
};

interface Operation {
  name: string;
  denied: unknown;
  perCallErrors: boolean;
  call: (permit: Permit, config?: CheckConfig) => Promise<unknown>;
  valid: { body: unknown; expected: unknown }[];
  invalid: unknown[];
}

const operations: Operation[] = [
  {
    name: 'check',
    denied: false,
    perCallErrors: true,
    call: (permit, config) => permit.check('user', 'read', 'document', {}, config),
    valid: [
      { body: { allow: true, result: true, debug: {} }, expected: true },
      { body: { allow: false, result: false }, expected: false },
      { body: { result: { allow: true, extra: 'kept' } }, expected: true },
      { body: { result: { allow: false } }, expected: false },
    ],
    invalid: [
      null,
      [],
      {},
      true,
      { result: null },
      { result: {} },
      { result: true },
      ...[null, 'false', 'true', 0, 1, [], {}].flatMap((allow) => [
        { allow },
        { result: { allow } },
      ]),
      { allow: 'true', result: { allow: true } },
    ],
  },
  {
    name: 'bulkCheck',
    denied: [false, false],
    perCallErrors: true,
    call: (permit, config) => permit.bulkCheck(checks, {}, config),
    valid: [
      { body: { allow: [{ allow: true }, { allow: false }] }, expected: [true, false] },
      {
        body: { result: { allow: [{ allow: false }, { allow: true, extra: 1 }] } },
        expected: [false, true],
      },
    ],
    invalid: [
      null,
      [],
      {},
      { allow: null },
      { allow: true },
      { result: {} },
      ...[
        [],
        [{ allow: true }],
        [{ allow: true }, { allow: false }, { allow: true }],
        [true, false],
        [{}, { allow: false }],
        [null, { allow: true }],
        [{ allow: 'false' }, { allow: true }],
        [{ allow: true }, { allow: 1 }],
      ].flatMap((allow) => [{ allow }, { result: { allow } }]),
    ],
  },
  {
    name: 'getUserPermissions',
    denied: {},
    perCallErrors: true,
    call: (permit, config) =>
      permit.getUserPermissions('user', undefined, undefined, undefined, config),
    valid: [
      { body: {}, expected: {} },
      { body: permissionMap, expected: permissionMap },
      { body: { result: { permissions: permissionMap }, extra: true }, expected: permissionMap },
      { body: { result: { permissions: {} } }, expected: {} },
      {
        body: { result: {}, permissions: { roles: null, tenant: null, resource: null, extra: 4 } },
        expected: { result: { permissions: [] }, permissions: { permissions: [], extra: 4 } },
      },
      {
        body: {
          document: {
            tenant: { key: 'tenant', name: 'Tenant' },
            resource: { type: 'document', key: 'one', name: 'Document' },
          },
        },
        expected: {
          document: {
            permissions: [],
            tenant: {
              key: 'tenant',
              name: 'Tenant',
              attributes: {},
            },
            resource: {
              type: 'document',
              key: 'one',
              name: 'Document',
              attributes: {},
            },
          },
        },
      },
      {
        body: {
          result: {
            permissions: {
              document: { permissions: [], roles: null, tenant: null, resource: null },
            },
          },
        },
        expected: { document: { permissions: [] } },
      },
      {
        body: { result: { permissions: ['read'] } },
        expected: { result: { permissions: ['read'] } },
      },
    ],
    invalid: [
      null,
      [],
      false,
      { result: null },
      { result: { permissions: null } },
      ...[
        null,
        [],
        'read',
        { permissions: null },
        { permissions: 'read' },
        { permissions: [true] },
        { permissions: [], roles: 'reader' },
        { permissions: [], roles: [4] },
        { permissions: [], tenant: [] },
        { permissions: [], tenant: { key: 42, attributes: {} } },
        { permissions: [], tenant: { attributes: {} } },
        { permissions: [], tenant: { key: 'tenant', attributes: null } },
        { permissions: [], resource: { type: 4, key: 'one', attributes: {} } },
        { permissions: [], resource: { key: 'one', attributes: {} } },
        { permissions: [], resource: { type: 'document', key: 'one', attributes: [] } },
      ].flatMap((entry) => [{ document: entry }, { result: { permissions: { document: entry } } }]),
    ],
  },
  {
    name: 'checkAllTenants',
    denied: [],
    perCallErrors: false,
    call: (permit) => permit.checkAllTenants('user', 'read', 'document'),
    valid: [
      { body: { allowed_tenants: [] }, expected: [] },
      {
        body: { allowed_tenants: [{ allow: true, tenant: { key: 'tenant', name: 'Tenant' } }] },
        expected: [{ key: 'tenant', name: 'Tenant', attributes: {} }],
      },
      { body: { result: { allowed_tenants: [] } }, expected: [] },
      { body: { allowed_tenants: [{ allow: true, result: false, tenant }] }, expected: [tenant] },
      { body: { result: { allowed_tenants: [{ allow: true, tenant }] } }, expected: [tenant] },
    ],
    invalid: [
      null,
      [],
      {},
      { allowed_tenants: null },
      { allowed_tenants: {} },
      ...[
        null,
        true,
        {},
        { tenant },
        { allow: false, tenant },
        { allow: 'true', tenant },
        { allow: 1, tenant },
        { allow: true, tenant: null },
        { allow: true, tenant: { key: 42, attributes: {} } },
        { allow: true, tenant: { attributes: {} } },
        { allow: true, tenant: { key: 'tenant', attributes: [] } },
      ].flatMap((entry) => [
        { allowed_tenants: [{ allow: true, tenant }, entry] },
        { result: { allowed_tenants: [{ allow: true, tenant }, entry] } },
      ]),
    ],
  },
];

for (const operation of operations) {
  describe(`${operation.name} response validation over HTTP`, () => {
    for (const [index, scenario] of operation.valid.entries()) {
      it(`accepts supported response ${index} without losing additive fields`, async () => {
        const pdp = await startPdp({ status: 200, body: scenario.body });
        const permit = new Permit({
          token: TEST_TOKEN,
          pdp: pdp.url,
          retry: false,
          log: { level: 'silent' },
        });
        expect(await operation.call(permit)).toStrictEqual(scenario.expected);
        expect(pdp.requests).toHaveLength(1);
      });
    }
    for (const [index, body] of operation.invalid.entries()) {
      it(`rejects malformed response ${index} and applies the configured error policy`, async () => {
        const pdp = await startPdp({ status: 200, body });
        const options = {
          token: TEST_TOKEN,
          pdp: pdp.url,
          retry: false as const,
          log: { level: 'silent' },
        };
        const strict = new Permit(options);
        const failClosed = new Permit({ ...options, throwOnError: false });
        await expect(operation.call(strict)).rejects.toMatchObject({
          name: 'PermitPDPStatusError',
          statusCode: 200,
          responseBody: body,
        });
        expect(await operation.call(failClosed)).toStrictEqual(operation.denied);
        if (operation.perCallErrors) {
          expect(await operation.call(strict, { throwOnError: false })).toStrictEqual(
            operation.denied,
          );
          await expect(operation.call(failClosed, { throwOnError: true })).rejects.toBeInstanceOf(
            PermitPDPStatusError,
          );
        }
        expect(pdp.requests).toHaveLength(operation.perCallErrors ? 4 : 2);
      });
    }
  });
}

it('checks an OPA result envelope over HTTP with the OPA request shape', async () => {
  const pdp = await startPdp({ status: 200, body: { result: { allow: true } } });
  const opa = axios.create();
  // The transport boundary routes the SDK's fixed OPA port to this ephemeral loopback fixture.
  opa.interceptors.request.use((config) => {
    config.baseURL = `${pdp.url}/`;
    return config;
  });
  const permit = new Permit({
    token: TEST_TOKEN,
    pdp: pdp.url,
    opaAxiosInstance: opa,
    retry: false,
    log: { level: 'silent' },
  });
  expect(await permit.check('user', 'read', 'document', {}, { useOpa: true })).toBe(true);
  expect(pdp.requests[0]?.path).toBe('/root');
  expect(pdp.requests[0]?.body).toStrictEqual({
    input: {
      user: { key: 'user' },
      action: 'read',
      resource: { type: 'document', tenant: 'default' },
      context: {},
    },
  });
});

for (const operation of operations.filter(
  (item) => item.name === 'bulkCheck' || item.name === 'getUserPermissions',
)) {
  it(`${operation.name} rejects unsupported OPA mode before sending a PDP request`, async () => {
    const pdp = await startPdp({ status: 200, body: operation.valid[0]?.body });
    const options = {
      token: TEST_TOKEN,
      pdp: pdp.url,
      retry: false as const,
      log: { level: 'silent' },
    };
    const strict = new Permit(options);
    await expect(operation.call(strict, { useOpa: true })).rejects.toBeInstanceOf(PermitError);
    await expect(operation.call(strict, { useOpa: true })).rejects.toThrow(/useOpa.*check/);
    expect(await operation.call(strict, { useOpa: true, throwOnError: false })).toStrictEqual(
      operation.denied,
    );
    const failClosed = new Permit({ ...options, throwOnError: false });
    expect(await operation.call(failClosed, { useOpa: true })).toStrictEqual(operation.denied);
    await expect(
      operation.call(failClosed, { useOpa: true, throwOnError: true }),
    ).rejects.toThrow();
    expect(pdp.requests).toHaveLength(0);
  });
}

it('requires zero bulk decisions for zero checks', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: [{ allow: true }] } });
  const permit = new Permit({
    token: TEST_TOKEN,
    pdp: pdp.url,
    retry: false,
    log: { level: 'silent' },
  });
  await expect(permit.bulkCheck([])).rejects.toBeInstanceOf(PermitPDPStatusError);
  expect(await permit.bulkCheck([], {}, { throwOnError: false })).toStrictEqual([]);
});

it('rejects sparse bulk input and returns one dense deny per position in non-throwing mode', async () => {
  const pdp = await startPdp({ status: 200, body: { allow: [{ allow: true }] } });
  const permit = new Permit({
    token: TEST_TOKEN,
    pdp: pdp.url,
    retry: false,
    log: { level: 'silent' },
  });
  const sparse: ICheckQuery[] = [];
  sparse.length = 2;
  sparse[1] = { user: 'user', action: 'read', resource: 'document' };
  await expect(permit.bulkCheck(sparse)).rejects.toBeInstanceOf(PermitError);
  expect(await permit.bulkCheck(sparse, {}, { throwOnError: false })).toStrictEqual([false, false]);
  expect(pdp.requests).toHaveLength(0);
});

it('preserves prototype-like permission identifiers as own data properties', async () => {
  const body = Object.fromEntries(
    ['__proto__', 'constructor', 'toString'].map((key) => [key, { permissions: ['read'] }]),
  );
  const pdp = await startPdp({ status: 200, body });
  const permit = new Permit({
    token: TEST_TOKEN,
    pdp: pdp.url,
    retry: false,
    log: { level: 'silent' },
  });
  const result = await permit.getUserPermissions('user');
  expect(Object.entries(result)).toStrictEqual(Object.entries(body));
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  for (const key of Object.keys(body)) expect(Object.hasOwn(result, key)).toBe(true);
});

for (const scenario of [
  {
    name: 'valid positional response',
    decisions: [{ allow: true }, { allow: false }],
    throwOnError: true,
    expected: [true, false],
  },
  { name: 'truncated positional response', decisions: [{ allow: true }], throwOnError: true },
  {
    name: 'original-count fallback',
    decisions: [{ allow: true }],
    throwOnError: false,
    expected: [false, false],
  },
]) {
  it(`uses the dispatched bulk count despite caller mutation: ${scenario.name}`, async () => {
    const server = createServer();
    const captured = new Promise<() => void>((resolve) => {
      server.once('request', (request: IncomingMessage, response: ServerResponse) => {
        request.resume();
        request.once('end', () =>
          resolve(() => {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ allow: scenario.decisions }));
          }),
        );
      });
    });
    onTestFinished(async () => {
      const closed = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      await closed;
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const permit = new Permit({
      token: TEST_TOKEN,
      pdp: `http://127.0.0.1:${address.port}`,
      retry: false,
      throwOnError: scenario.throwOnError,
      log: { level: 'silent' },
    });
    const requests = [...checks];
    const pending = permit.bulkCheck(requests);
    const respond = await captured;
    requests.pop();
    respond();
    if ('expected' in scenario) {
      expect(await pending).toStrictEqual(scenario.expected);
    } else {
      await expect(pending).rejects.toBeInstanceOf(PermitPDPStatusError);
    }
  });
}
