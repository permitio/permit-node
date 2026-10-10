import { expect, test } from 'vitest';
import {
  cloudFixtureNames,
  seedCloudFixture,
  verifyCloudFixtureSettled,
} from '#scripts/cloud-fixture.mjs';

const context = {
  organization: 'a'.repeat(32),
  project: 'b'.repeat(32),
  environment: 'c'.repeat(32),
  key: 'node-acceptance-123-1',
  marker: 'permit-node:release-acceptance:node-acceptance-123-1',
};
const owner = { ...context, identity: { id: context.environment } };
const canary = 'cloud-response-only-secret-canary';

function boundary(options = {}) {
  const entities = new Map(),
    states = [],
    calls = [];
  let writes = 0,
    grant;
  const request = async (input) => {
    calls.push(structuredClone(input));
    const path = new URL(input.path, 'https://api.permit.io');
    const kind = path.pathname.split('/')[5];
    if (input.method === 'POST') {
      writes += 1;
      const id = writes.toString(16).padStart(32, '0');
      const common = {
        id,
        organization_id: context.organization,
        project_id: context.project,
        environment_id: context.environment,
        created_at: '2026-10-08T12:00:00Z',
        secret: canary,
      };
      if (kind === 'role_assignments') {
        grant = {
          ...common,
          user_id: input.body.user,
          role_id: input.body.role,
          tenant_id: input.body.tenant,
          user: entities.get(input.body.user).key,
          role: entities.get(input.body.role).key,
          tenant: entities.get(input.body.tenant).key,
        };
      } else if (options.noWrite !== writes) {
        const row = { ...common, ...structuredClone(input.body) };
        entities.set(row.key, row);
        entities.set(row.id, row);
      }
      if (options.lost === writes || options.noWrite === writes) throw new Error(canary);
      if (options.statusAt === writes) return { status: options.status, body: { secret: canary } };
      const body = kind === 'role_assignments' ? grant : entities.get(input.body.key);
      return { status: 201, body: options.malformedAck === writes ? { secret: canary } : body };
    }
    if (kind === 'role_assignments') {
      expect(path.searchParams.get('user')).toBe(grant.user_id);
      expect(path.searchParams.get('role')).toBe(grant.role_id);
      expect(path.searchParams.get('tenant')).toBe(grant.tenant_id);
      expect(path.searchParams.get('per_page')).toBe('100');
      const row = { ...grant, ...options.grantFields };
      const rows = options.grantRows ?? [row];
      return {
        status: 200,
        body: options.envelope
          ? {
              data: rows,
              total_count: Object.hasOwn(options, 'total') ? options.total : rows.length,
            }
          : rows,
      };
    }
    if (options.readFault === writes && writes > 0) throw new Error(canary);
    const key = decodeURIComponent(path.pathname.split('/')[6]);
    let row = entities.get(key);
    if (!writes && options.preexisting) row = { id: 'd'.repeat(32), secret: canary };
    if (row && options.changedRead === writes) row = { ...row, ...options.readFields };
    return { status: row ? 200 : 404, body: structuredClone(row) };
  };
  return {
    request,
    states,
    calls,
    entities,
    save: async (state) => states.push(state),
    get writes() {
      return writes;
    },
  };
}

async function run(f) {
  return seedCloudFixture({ request: f.request, save: f.save, context });
}

test.each([false, true])(
  'captures all six entities and the exact independently read grant (%s)',
  async (envelope) => {
    const f = boundary({ envelope });
    const names = await run(f);
    expect(names).toEqual(cloudFixtureNames(context.key));
    expect(f.writes).toBe(7);
    expect(f.states[0]).toMatchObject({ active: true, unknownWrite: false, records: [] });
    expect(f.states.filter((row) => row.unknownWrite)).toHaveLength(7);
    const state = f.states.at(-1);
    expect(state).toMatchObject({ active: false, unknownWrite: false });
    expect(state.records).toHaveLength(7);
    expect(() => verifyCloudFixtureSettled(state, owner)).not.toThrow();
    expect(JSON.stringify(f.states)).not.toContain(canary);
    expect(f.calls.some((row) => row.method === 'DELETE')).toBe(false);
    expect(f.calls.filter((row) => row.method === 'POST')[0].body.actions).toEqual({
      read: {},
      write: {},
    });
    expect(f.calls.filter((row) => row.method === 'POST')[1].body.permissions).toEqual([
      names.resource + ':read',
    ]);
  },
);

test.each([1, 2, 3, 4, 5, 6, 7])(
  'immediately recovers write %s after a lost acknowledgment without retrying',
  async (lost) => {
    const f = boundary({ lost });
    await run(f);
    expect(f.writes).toBe(7);
    expect(() => verifyCloudFixtureSettled(f.states.at(-1), owner)).not.toThrow();
  },
);

test.each([1, 2, 3, 4, 5, 6])(
  'an unresolved entity write %s cannot grant cleanup before or after a late commit',
  async (noWrite) => {
    const f = boundary({ noWrite });
    await expect(run(f)).rejects.toThrow('retain saved state');
    const state = f.states.at(-1);
    expect(state.unknownWrite).toBe(true);
    expect(f.writes).toBe(noWrite);
    expect(() => verifyCloudFixtureSettled(state, owner)).toThrow('unsettled');
    f.entities.set('late-commit', { id: 'e'.repeat(32) });
    expect(() => verifyCloudFixtureSettled(state, owner)).toThrow('unsettled');
    expect(JSON.stringify(state)).not.toContain(canary);
  },
);

test.each([1, 2, 3, 4, 5, 6, 7])(
  'malformed acknowledgment %s is retained without a fresh later adoption',
  async (malformedAck) => {
    const f = boundary({ malformedAck });
    await expect(run(f)).rejects.toThrow('retain saved state');
    expect(f.writes).toBe(malformedAck);
    expect(() => verifyCloudFixtureSettled(f.states.at(-1), owner)).toThrow();
  },
);

test.each([
  { project_id: 'e'.repeat(32) },
  { environment_id: 'e'.repeat(32) },
  { organization_id: 'e'.repeat(32) },
  { id: 'e'.repeat(32) },
  { created_at: '2026-10-08T13:00:00Z' },
  { type_attributes: {} },
])('changed entity ownership is refused before later writes: %j', async (readFields) => {
  const f = boundary({ changedRead: 1, readFields });
  await expect(run(f)).rejects.toThrow('retain saved state');
  expect(f.writes).toBe(1);
  expect(() => verifyCloudFixtureSettled(f.states.at(-1), owner)).toThrow();
});

test.each([
  { user_id: 'e'.repeat(32) },
  { role_id: 'e'.repeat(32) },
  { tenant_id: 'e'.repeat(32) },
  { user: 'foreign-user' },
  { role: 'foreign-role' },
  { tenant: 'foreign-tenant' },
  { resource_instance_id: 'e'.repeat(32) },
  { resource_instance: 'foreign-unowned-instance', resource_instance_id: null },
  { environment_id: 'e'.repeat(32) },
])('foreign grant cannot credit the positive RBAC oracle: %j', async (grantFields) => {
  const f = boundary({ grantFields });
  await expect(run(f)).rejects.toThrow('retain saved state');
  expect(() => verifyCloudFixtureSettled(f.states.at(-1), owner)).toThrow();
});

test.each([
  { grantRows: [] },
  { grantRows: [{}, {}] },
  { envelope: true, total: 2 },
  { envelope: true, total: null },
])('missing, ambiguous or partial grant inventory is unsettled: %j', async (options) => {
  const f = boundary(options);
  await expect(run(f)).rejects.toThrow('retain saved state');
  expect(() => verifyCloudFixtureSettled(f.states.at(-1), owner)).toThrow();
});

test('preexisting namespace refuses writes and environment cascade', async () => {
  const f = boundary({ preexisting: true });
  await expect(run(f)).rejects.toThrow('retain saved state');
  expect(f.writes).toBe(0);
  expect(() => verifyCloudFixtureSettled(f.states.at(-1), owner)).toThrow();
});

test('response-only read and durable-save exceptions stay outside diagnostics', async () => {
  const f = boundary({ readFault: 1 });
  await expect(run(f)).rejects.toThrow('retain saved state');
  await expect(
    seedCloudFixture({
      context,
      request: f.request,
      save: async () => {
        throw new Error(canary);
      },
    }),
  ).rejects.toThrow(/^Cloud fixture setup failed; retain saved state for independent cleanup\.$/u);
});

test.each([
  (s) => {
    s.environment = 'e'.repeat(32);
  },
  (s) => {
    s.records[0].kind = 'users';
  },
  (s) => {
    s.records[0].createdAt = 0;
  },
  (s) => {
    s.records.push(s.records[0]);
  },
  (s) => {
    s.records[0].secret = canary;
  },
])('malformed saved fixture state cannot authorize cleanup', async (change) => {
  const f = boundary();
  await run(f);
  const state = structuredClone(f.states.at(-1));
  change(state);
  expect(() => verifyCloudFixtureSettled(state, owner)).toThrow();
});

test.each([
  ['an uncertain write', { unknownWrite: true }],
  ['an active writer', { active: true }],
])('a complete saved fixture state with %s cannot authorize cleanup', async (_name, change) => {
  const f = boundary();
  await run(f);
  const state = f.states.at(-1);
  expect(() => verifyCloudFixtureSettled(state, owner)).not.toThrow();
  expect(() => verifyCloudFixtureSettled({ ...state, ...change }, owner)).toThrow(
    'Cloud fixture writes remain unsettled or foreign; refuse environment cleanup.',
  );
});

test.each([null, undefined])(
  'tenant-only grant accepts logical resource_instance %s',
  async (value) => {
    const f = boundary({ grantFields: { resource_instance: value, resource_instance_id: null } });
    await run(f);
    expect(() => verifyCloudFixtureSettled(f.states.at(-1), owner)).not.toThrow();
  },
);
