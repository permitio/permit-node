import { expect, test } from 'vitest';
import { provisionCloudEnvironment, cleanupCloudEnvironment } from '#scripts/cloud-environment.mjs';

const owner = {
  project: 'a'.repeat(32),
  key: 'node-acceptance-123-1',
  marker: 'permit-node:release-acceptance:node-acceptance-123-1',
};
const entity = {
  id: 'b'.repeat(32),
  key: owner.key,
  name: owner.key,
  project_id: owner.project,
  description: owner.marker,
  created_at: '2026-10-08T12:00:00Z',
};
const collection = `/v2/projects/${owner.project}/envs`;

function fixture(options = {}) {
  let current = options.existing ? structuredClone(entity) : undefined;
  const calls = [];
  const states = [];
  const request = async (input) => {
    calls.push(structuredClone(input));
    if (input.method === 'POST') {
      if (!options.noWrite) current = structuredClone(entity);
      if (options.lostReply) throw new Error('token-and-response-canary');
      return { status: 201, body: structuredClone(current) };
    }
    if (input.method === 'DELETE') {
      if (!options.failedDeletion) current = undefined;
      return { status: options.failedDeletion ? 500 : 204, body: 'response-canary' };
    }
    if (input.path === '/v2/api-key/scope') {
      expect(input.credential).toBe('synthetic-scoped-credential');
      return {
        status: 200,
        body: {
          organization_id: 'c'.repeat(32),
          project_id: owner.project,
          environment_id: entity.id,
        },
      };
    }
    if (input.path.startsWith('/v2/api-key/')) {
      if (options.failedCredential) return { status: 401, body: 'credential-response-canary' };
      return { status: 200, body: { secret: 'synthetic-scoped-credential' } };
    }
    if (options.failedInitialRead && calls.some((call) => call.method === 'POST'))
      throw new Error('secret-network-canary');
    return { status: current ? 200 : 404, body: structuredClone(current) };
  };
  return {
    request,
    calls,
    states,
    save: async (state) => {
      states.push(state);
    },
    replace: (body) => {
      current = body;
    },
  };
}

test('one create captures ownership, obtains a scoped key and verifies absence', async () => {
  const f = fixture();
  const result = await provisionCloudEnvironment({ ...owner, ...f });
  expect(result.credential).toBe('synthetic-scoped-credential');
  expect(f.states[0]).toMatchObject({ attempted: false, capture: 'unverified' });
  expect(f.states[1]).toMatchObject({ attempted: true, capture: 'unverified' });
  expect(result.state).toMatchObject({
    capture: 'verified',
    identity: {
      id: entity.id,
      createdAt: entity.created_at,
    },
  });
  const cleanup = await cleanupCloudEnvironment({ request: f.request, state: result.state });
  expect(cleanup).toEqual({ registered: 1, completed: 1, verified: 1 });
  expect(f.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  expect(f.calls.filter((call) => call.method === 'DELETE')).toEqual([
    { method: 'DELETE', path: `${collection}/${entity.id}` },
  ]);
  expect(JSON.stringify(f.states)).not.toContain('credential');
});

test('lost acknowledgment recovers immediately without retrying create', async () => {
  const f = fixture({ lostReply: true });
  const result = await provisionCloudEnvironment({ ...owner, ...f });
  expect(result.state.capture).toBe('verified');
  expect(f.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  await cleanupCloudEnvironment({ request: f.request, state: result.state });
});

test('preexisting namespace refuses POST and cleanup adoption', async () => {
  const f = fixture({ existing: true });
  await expect(provisionCloudEnvironment({ ...owner, ...f })).rejects.toThrow('already exists');
  await expect(
    cleanupCloudEnvironment({ request: f.request, state: f.states.at(-1) }),
  ).rejects.toThrow('cannot adopt');
  expect(f.calls.every((call) => call.method === 'GET')).toBe(true);
});

test('failed initial capture remains unverified after the read fault clears', async () => {
  const f = fixture({ failedInitialRead: true });
  await expect(provisionCloudEnvironment({ ...owner, ...f })).rejects.toThrow('retain');
  const state = f.states.at(-1);
  const deletion = [];
  await expect(
    cleanupCloudEnvironment({
      state,
      request: async (input) => {
        if (input.method === 'DELETE') deletion.push(input);
        return { status: 200, body: { ...entity, created_at: '2026-10-08T13:00:00Z' } };
      },
    }),
  ).rejects.toThrow('cannot adopt');
  expect(deletion).toEqual([]);
  expect(JSON.stringify(state)).not.toMatch(/secret|canary/u);
});

test.each([
  ['physical ID', { id: 'c'.repeat(32) }],
  ['creation timestamp', { created_at: '2026-10-08T13:00:00Z' }],
  ['key', { key: 'renamed-env' }],
  ['project', { project_id: 'c'.repeat(32) }],
  ['owner marker', { description: 'unrelated-description' }],
])('cleanup refuses changed %s before deletion', async (_name, changes) => {
  const f = fixture();
  const { state } = await provisionCloudEnvironment({ ...owner, ...f });
  f.replace({ ...entity, ...changes });
  await expect(cleanupCloudEnvironment({ request: f.request, state })).rejects.toThrow();
  expect(f.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
});

test('absence refuses late survivors and permits never-attempted true absence', async () => {
  const f = fixture({ noWrite: true, lostReply: true });
  await expect(provisionCloudEnvironment({ ...owner, ...f })).rejects.toThrow('retain');
  f.replace(entity);
  await expect(
    cleanupCloudEnvironment({ request: f.request, state: f.states.at(-1) }),
  ).rejects.toThrow('cannot adopt');
  const initial = fixture();
  const state = { schema: 1, ...owner, attempted: false, identity: null, capture: 'unverified' };
  expect(await cleanupCloudEnvironment({ request: initial.request, state })).toEqual({
    registered: 1,
    completed: 1,
    verified: 1,
  });
});

test('failed credential lookup keeps ownership and sanitizes diagnostics', async () => {
  const f = fixture({ failedCredential: true });
  await expect(provisionCloudEnvironment({ ...owner, ...f })).rejects.toThrow(
    'Scoped cloud credential lookup failed',
  );
  expect(f.states.at(-1).capture).toBe('verified');
  await cleanupCloudEnvironment({ request: f.request, state: f.states.at(-1) });
});

test('failed deletion or surviving key/ID prevents verified cleanup', async () => {
  const f = fixture({ failedDeletion: true });
  const { state } = await provisionCloudEnvironment({ ...owner, ...f });
  await expect(cleanupCloudEnvironment({ request: f.request, state })).rejects.toThrow(
    'unexpected HTTP status',
  );
  const surviving = fixture();
  const setup = await provisionCloudEnvironment({ ...owner, ...surviving });
  await expect(
    cleanupCloudEnvironment({
      state: setup.state,
      request: async (input) =>
        input.method === 'DELETE' ? { status: 204 } : { status: 200, body: entity },
    }),
  ).rejects.toThrow('absence');
});

test('timed-out create refuses cleanup credit before delayed commit', async () => {
  let committed = false;
  const states = [];
  const request = async ({ method }) => {
    if (method === 'POST') throw new Error('Client timeout before server settlement');
    return { status: committed ? 200 : 404, body: committed ? entity : undefined };
  };
  await expect(
    provisionCloudEnvironment({
      ...owner,
      request,
      save: async (state) => {
        states.push(state);
      },
    }),
  ).rejects.toThrow('retain');
  expect(states.at(-1)).toMatchObject({ attempted: true, capture: 'unverified', identity: null });
  await expect(cleanupCloudEnvironment({ request, state: states.at(-1) })).rejects.toThrow(
    'cannot adopt',
  );
  committed = true;
  await expect(cleanupCloudEnvironment({ request, state: states.at(-1) })).rejects.toThrow(
    'cannot adopt',
  );
});

test.each([
  { project_id: 'd'.repeat(32) },
  { environment_id: 'd'.repeat(32) },
  { object_type: 'org' },
  { object_type: 'project' },
])(
  'contradictory fetched credential metadata cannot be handed to the candidate: %j',
  async (fields) => {
    const f = fixture();
    await expect(
      provisionCloudEnvironment({
        ...owner,
        save: f.save,
        request: async (input) =>
          input.path.startsWith('/v2/api-key/') && input.path !== '/v2/api-key/scope'
            ? { status: 200, body: { secret: 'synthetic-scoped-credential', ...fields } }
            : f.request(input),
      }),
    ).rejects.toThrow('Scoped cloud credential lookup failed');
    expect(f.states.at(-1).capture).toBe('verified');
    await cleanupCloudEnvironment({ request: f.request, state: f.states.at(-1) });
  },
);
test.each([
  { organization_id: 'c'.repeat(32), project_id: null, environment_id: null },
  { organization_id: 'c'.repeat(32), project_id: owner.project, environment_id: null },
  { organization_id: 'c'.repeat(32), project_id: owner.project, environment_id: 'd'.repeat(32) },
  { organization_id: 'c'.repeat(32), project_id: 'd'.repeat(32), environment_id: entity.id },
  {},
])(
  'scope read with the fetched key refuses broader, foreign or missing ownership: %j',
  async (scope) => {
    const f = fixture();
    await expect(
      provisionCloudEnvironment({
        ...owner,
        save: f.save,
        request: async (input) =>
          input.path === '/v2/api-key/scope' ? { status: 200, body: scope } : f.request(input),
      }),
    ).rejects.toThrow('Scoped cloud credential');
    await cleanupCloudEnvironment({ request: f.request, state: f.states.at(-1) });
  },
);
