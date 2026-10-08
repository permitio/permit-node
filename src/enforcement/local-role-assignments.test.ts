import { deepStrictEqual } from 'node:assert';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { type Socket } from 'node:net';
import { inspect } from 'node:util';

import pino from 'pino';

import { ConfigFactory } from '#src/config';
import { Enforcer } from '#src/enforcement/enforcer';
import { parseLocalRoleAssignmentsResponse } from '#src/enforcement/responses';
import { Permit, PermitConnectionError, PermitError, PermitPDPStatusError } from '#src/index';
import { TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';
import { rejectionOf } from '#src/tests/helpers/rejection';

const options = { token: TEST_TOKEN, retry: false as const, log: { level: 'silent' as const } };
const tenantRow = { user: 'alice', role: 'reader', tenant: 'east' };
const instanceRow = { ...tenantRow, resource_instance: 'document:report' };
interface Request {
  method: string | undefined;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}
interface Reply {
  status: number;
  body: unknown;
  delayMs?: number;
  disconnect?: boolean;
}

async function startLocalPdp(reply: Reply | ((index: number) => Reply)) {
  const requests: Request[] = [];
  const sockets = new Set<Socket>();
  process.env['NO_PROXY'] = [process.env['NO_PROXY'], '127.0.0.1'].filter(Boolean).join(',');
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      requests.push({
        method: request.method,
        path: request.url ?? '',
        headers: request.headers,
        body,
      });
      const selected = typeof reply === 'function' ? reply(requests.length - 1) : reply;
      if (selected.disconnect) {
        request.socket.destroy();
        return;
      }
      const send = () => {
        response.writeHead(selected.status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(selected.body));
      };
      if (selected.delayMs === undefined) send();
      else setTimeout(send, selected.delayMs).unref();
    });
  });
  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  onTestFinished(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      for (const socket of sockets) socket.destroy();
    });
  });
  const address = server.address();
  assert(address !== null && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, requests };
}

function requestQuery(request: Request | undefined): Record<string, string> {
  assert(request);
  expect(request.method).toBe('GET');
  expect(request.body).toBe('');
  expect(request.headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
  expect(request.headers['x-permit-sdk-version']).toBe(
    `node:${process.env['npm_package_version'] ?? 'unknown'}`,
  );
  return Object.fromEntries(new URL(request.path, 'http://fixture.invalid').searchParams);
}

it('reads one full local page through the configured PDP prefix and never adds default tenancy', async () => {
  const rows = [
    tenantRow,
    { ...instanceRow, future: { enabled: false, count: 0, nullable: null } },
    { ...tenantRow, resource_instance: null },
    instanceRow,
    tenantRow,
  ];
  const pdp = await startLocalPdp({ status: 200, body: rows });
  const permit = new Permit({
    ...options,
    pdp: `${pdp.url}/gateway`,
    apiUrl: 'http://unused.invalid',
    multiTenancy: { defaultTenant: 'not-a-filter' },
  });
  deepStrictEqual(await permit.getLocalRoleAssignments(), rows);
  expect(pdp.requests).toHaveLength(1);
  expect(pdp.requests[0]?.path).toBe('/gateway/local/role_assignments?page=1&per_page=30');
  expect(requestQuery(pdp.requests[0])).toStrictEqual({ page: '1', per_page: '30' });
  const parsed = parseLocalRoleAssignmentsResponse(rows);
  expect(Object.hasOwn(parsed[0] ?? {}, 'resource_instance')).toBe(false);
  expect(parsed[2]?.resource_instance).toBeNull();
  expect(rows[0]).toStrictEqual(tenantRow);
});

it.each(['user', 'role', 'tenant', 'resource', 'resourceInstance'] as const)(
  'maps and encodes the single %s filter exactly once',
  async (field) => {
    const pdp = await startLocalPdp({ status: 200, body: [] });
    const permit = new Permit({ ...options, pdp: pdp.url });
    const value = 'a +%/:?&=🦉';
    expect(await permit.getLocalRoleAssignments(Object.freeze({ [field]: value }))).toStrictEqual(
      [],
    );
    expect(requestQuery(pdp.requests[0])).toStrictEqual({
      [field === 'resourceInstance' ? 'resource_instance' : field]: value,
      page: '1',
      per_page: '30',
    });
    expect(pdp.requests[0]?.path).toContain('%2B%25');
    expect(pdp.requests).toHaveLength(1);
  },
);

it('forwards all key filters and accepted empty strings without context or normalization', async () => {
  const pdp = await startLocalPdp({ status: 200, body: [] });
  const enforcer = new Enforcer(
    ConfigFactory.build({ ...options, pdp: pdp.url }),
    pino({ level: 'silent' }),
  );
  enforcer.contextStore.add({ secret: 'never-on-wire' });
  const query = Object.freeze({
    user: '',
    role: 'r/a',
    tenant: 'tenant',
    resource: 'document',
    resourceInstance: 'document:a:b',
    page: 2,
    perPage: 100,
  });
  expect(
    await enforcer.getLocalRoleAssignments(query, Object.freeze({ timeout: 0 })),
  ).toStrictEqual([]);
  expect(requestQuery(pdp.requests[0])).toStrictEqual({
    user: '',
    role: 'r/a',
    tenant: 'tenant',
    resource: 'document',
    resource_instance: 'document:a:b',
    page: '2',
    per_page: '100',
  });
  expect(query.resourceInstance).toBe('document:a:b');
});

it.each([
  { page: Number.MAX_SAFE_INTEGER, perPage: 1 },
  { page: 1, perPage: 100 },
])('accepts pagination boundary %j without fetching another page', async (query) => {
  const pdp = await startLocalPdp({ status: 200, body: [tenantRow] });
  const permit = new Permit({ ...options, pdp: pdp.url });
  expect(await permit.getLocalRoleAssignments(query)).toStrictEqual([tenantRow]);
  expect(requestQuery(pdp.requests[0])).toStrictEqual({
    page: String(query.page),
    per_page: String(query.perPage),
  });
  expect(pdp.requests).toHaveLength(1);
});

const invalidQueries: unknown[] = [
  null,
  [],
  'alice',
  7,
  true,
  { user: 7 },
  { role: null },
  { tenant: [] },
  { resource: {} },
  { resourceInstance: 1 },
  { context: {} },
  { detailed: true },
  { includeTotalCount: true },
  { resource_instance: 'a:b' },
  { [Symbol('unknown')]: 'value' },
  ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null].map((page) => ({ page })),
  ...[0, -1, 101, 1.5, NaN, Infinity, '30', null].map((perPage) => ({ perPage })),
];
it.each(invalidQueries)(
  'rejects invalid query %j before HTTP under every error policy',
  async (query) => {
    const pdp = await startLocalPdp({ status: 200, body: [] });
    const permit = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
    for (const throwOnError of [false, true]) {
      await expect(
        Reflect.apply(permit.getLocalRoleAssignments, permit, [query, { throwOnError }]),
      ).rejects.toBeInstanceOf(PermitError);
    }
    expect(pdp.requests).toHaveLength(0);
  },
);

it.each([
  null,
  [],
  false,
  'options',
  { useOpa: true },
  { useOpa: 'true' },
  { throwOnError: 0 },
  { timeout: -1 },
  { timeout: NaN },
  { timeout: Infinity },
  { timeout: 2_147_483_648 },
  { timeout: '10' },
  { timeout: null },
  { tenant: 'east' },
  { context: {} },
])('rejects invalid or unsupported options %j before HTTP', async (config) => {
  const pdp = await startLocalPdp({ status: 200, body: [] });
  const permit = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
  await expect(
    Reflect.apply(permit.getLocalRoleAssignments, permit, [{}, config]),
  ).rejects.toBeInstanceOf(PermitError);
  expect(pdp.requests).toHaveLength(0);
});

const invalidBodies: unknown[] = [
  null,
  {},
  true,
  'rows',
  7,
  { data: [tenantRow] },
  { result: [tenantRow] },
  [null],
  [[]],
  [7],
  [true],
  ...['user', 'role', 'tenant'].flatMap((field) => [
    [tenantRow, Object.fromEntries(Object.entries(tenantRow).filter(([key]) => key !== field))],
    [tenantRow, { ...tenantRow, [field]: null }],
    [tenantRow, { ...tenantRow, [field]: 7 }],
  ]),
  ...[undefined, 7, {}, [], true].map((resource_instance) => [
    tenantRow,
    { ...tenantRow, resource_instance },
  ]),
];
it.each(invalidBodies)(
  'rejects every malformed 200 page %j without returning a partial result',
  async (body) => {
    // JSON omits explicit undefined; the direct parser still rejects it below.
    if (
      Array.isArray(body) &&
      body.some(
        (row) =>
          row &&
          typeof row === 'object' &&
          Object.hasOwn(row, 'resource_instance') &&
          row.resource_instance === undefined,
      )
    ) {
      expect(() => parseLocalRoleAssignmentsResponse(body)).toThrow();
      return;
    }
    const pdp = await startLocalPdp({ status: 200, body });
    const permit = new Permit({ ...options, pdp: pdp.url });
    for (const throwOnError of [true, false]) {
      await expect(permit.getLocalRoleAssignments({}, { throwOnError })).rejects.toMatchObject({
        name: 'PermitPDPStatusError',
        statusCode: 200,
      });
    }
  },
);

it('rejects sparse arrays and retains legal additive dictionary keys', () => {
  const sparse: unknown[] = [tenantRow];
  sparse.length = 2;
  expect(() => parseLocalRoleAssignmentsResponse(sparse)).toThrow();
  const row = {
    ...tenantRow,
    ...Object.fromEntries([
      ['__proto__', { enabled: false }],
      ['constructor', null],
    ]),
  };
  const parsed = parseLocalRoleAssignmentsResponse([row]);
  deepStrictEqual(parsed, [row]);
  expect(Object.hasOwn(parsed[0] ?? {}, '__proto__')).toBe(true);
  expect(Object.getPrototypeOf(parsed[0])).toBe(Object.prototype);
});

it.each([404, 405, 501])(
  'reports an unavailable endpoint at %s even with fallback disabled errors',
  async (status) => {
    const pdp = await startLocalPdp({ status, body: { detail: 'Unavailable' } });
    const permit = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
    const error = await rejectionOf(permit.getLocalRoleAssignments());
    expect(error).toBeInstanceOf(PermitPDPStatusError);
    expect(error).toMatchObject({ statusCode: status });
    expect(error.message).toContain('/local/role_assignments');
    expect(error.message).toContain('compatible Permit container PDP');
  },
);

it.each([201, 204, 302, 401, 403, 422, 500, 503])(
  'follows per-call and global ordinary HTTP policy for %s',
  async (status) => {
    const pdp = await startLocalPdp({ status, body: { detail: 'Rejected' } });
    const permit = new Permit({ ...options, pdp: pdp.url });
    await expect(permit.getLocalRoleAssignments()).rejects.toMatchObject({
      name: 'PermitPDPStatusError',
      statusCode: status,
    });
    expect(await permit.getLocalRoleAssignments({}, { throwOnError: false })).toStrictEqual([]);
    const fallback = new Permit({ ...options, pdp: pdp.url, throwOnError: false });
    expect(await fallback.getLocalRoleAssignments()).toStrictEqual([]);
    await expect(
      fallback.getLocalRoleAssignments({}, { throwOnError: true }),
    ).rejects.toMatchObject({ statusCode: status });
  },
);

it('snapshots filters and error policy synchronously across calls and retry attempts', async () => {
  const pdp = await startLocalPdp((index) => ({
    status: index === 0 ? 503 : 200,
    body: index === 0 ? {} : [tenantRow],
    delayMs: 5,
  }));
  const permit = new Permit({
    ...options,
    pdp: pdp.url,
    retry: { maxRetries: 1, retryDelay: 5, maxDelay: 5 },
  });
  const query = { user: 'alice', resourceInstance: 'document:original', page: 2, perPage: 1 };
  const config = { timeout: 1_000, throwOnError: true };
  const pending = permit.getLocalRoleAssignments(query, config);
  query.user = 'changed';
  query.resourceInstance = 'document:changed';
  query.page = 7;
  config.timeout = 0;
  config.throwOnError = false;
  expect(await pending).toStrictEqual([tenantRow]);
  expect(pdp.requests).toHaveLength(2);
  for (const request of pdp.requests)
    expect(requestQuery(request)).toStrictEqual({
      user: 'alice',
      resource_instance: 'document:original',
      page: '2',
      per_page: '1',
    });
  const failing = await startLocalPdp({ status: 503, body: {}, delayMs: 5 });
  const errorPermit = new Permit({ ...options, pdp: failing.url, throwOnError: false });
  const policy = { throwOnError: true };
  const failed = errorPermit.getLocalRoleAssignments({}, policy);
  policy.throwOnError = false;
  await expect(failed).rejects.toMatchObject({ statusCode: 503 });
});

it('keeps concurrent query snapshots separate', async () => {
  const pdp = await startLocalPdp({ status: 200, body: [] });
  const permit = new Permit({ ...options, pdp: pdp.url });
  const query = { user: 'alice', tenant: 'east' };
  const first = permit.getLocalRoleAssignments(query);
  query.user = 'bob';
  query.tenant = 'west';
  const second = permit.getLocalRoleAssignments(query);
  expect(await Promise.all([first, second])).toStrictEqual([[], []]);
  expect(pdp.requests.map(requestQuery)).toContainEqual({
    user: 'alice',
    tenant: 'east',
    page: '1',
    per_page: '30',
  });
  expect(pdp.requests.map(requestQuery)).toContainEqual({
    user: 'bob',
    tenant: 'west',
    page: '1',
    per_page: '30',
  });
});

it('preserves timeout zero and per-call overrides while exposing ordinary network failure', async () => {
  const pdp = await startLocalPdp({ status: 200, body: [], delayMs: 50 });
  const permit = new Permit({ ...options, pdp: pdp.url, timeout: 10 });
  await expect(permit.getLocalRoleAssignments()).rejects.toBeInstanceOf(PermitConnectionError);
  expect(await permit.getLocalRoleAssignments({}, { throwOnError: false })).toStrictEqual([]);
  expect(await permit.getLocalRoleAssignments({}, Object.freeze({ timeout: 0 }))).toStrictEqual([]);
  expect(await permit.getLocalRoleAssignments({}, { timeout: 200 })).toStrictEqual([]);
  const reset = await startLocalPdp({ status: 200, body: [], disconnect: true });
  const disconnected = new Permit({ ...options, pdp: reset.url });
  await expect(disconnected.getLocalRoleAssignments()).rejects.toBeInstanceOf(
    PermitConnectionError,
  );
  expect(await disconnected.getLocalRoleAssignments({}, { throwOnError: false })).toStrictEqual([]);
});

it('does not expose tokens, private query values or untrusted body echoes in errors or logs', async () => {
  const query = {
    user: 'private-user-8764',
    role: 'private-role-8754',
    tenant: 'private-tenant-4321',
    resource: 'private-resource-1234',
    resourceInstance: 'private-resource:private-instance-5678',
  };
  const echo = [TEST_TOKEN, ...Object.values(query)].join(' ');
  const pdp = await startLocalPdp({
    status: 422,
    body: { detail: echo, message: echo, future: echo },
  });
  let logs = '';
  const logger = pino(
    { level: 'error' },
    {
      write(value: string) {
        logs += value;
      },
    },
  );
  const enforcer = new Enforcer(ConfigFactory.build({ ...options, pdp: pdp.url }), logger);
  const error = await rejectionOf(enforcer.getLocalRoleAssignments(query));
  const diagnostic = [
    inspect(error, { depth: 10 }),
    JSON.stringify(error),
    error.message,
    logs,
  ].join(' ');
  for (const secret of [TEST_TOKEN, ...Object.values(query)])
    expect(diagnostic).not.toContain(secret);
  expect(error).toMatchObject({ name: 'PermitPDPStatusError', statusCode: 422 });
});
