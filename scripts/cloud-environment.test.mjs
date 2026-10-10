import { expect, test } from 'vitest';
import {
  cleanupCloudEnvironment,
  fetchCloudEnvironmentCredential,
  provisionCloudEnvironment,
} from '#scripts/cloud-environment.mjs';

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
const provisionRefusal =
  'Cloud setup could not capture immutable ownership; retain the saved state.';
const credentialRefusal = 'Scoped cloud credential lookup failed; owned cleanup remains required.';
const refused = (message, code) => ({ message, code });

function fixture(options = {}) {
  let current = options.existing ? structuredClone(entity) : undefined;
  const calls = [];
  const states = [];
  const request = async (input) => {
    calls.push(structuredClone(input));
    if (input.method === 'POST') {
      if (options.createStatus) return { status: options.createStatus, body: 'response-canary' };
      if (!options.noWrite) current = structuredClone(entity);
      if (options.lostReply) throw new Error('token-and-response-canary');
      return { status: 201, body: { ...structuredClone(current), ...options.ackFields } };
    }
    if (input.method === 'DELETE') {
      if (!options.failedDeletion) current = undefined;
      return { status: options.failedDeletion ? 500 : 204, body: 'response-canary' };
    }
    if (input.path === '/v2/api-key/scope') {
      expect(input.credential).toBe('synthetic-scoped-credential');
      if (options.scopeStatus) return { status: options.scopeStatus, body: 'scope-canary' };
      if (options.lostScope) throw new Error('scope-network-canary');
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
      if (options.lostCredential) throw new Error('credential-network-canary');
      if (options.unreadableCredential)
        return {
          status: 200,
          get body() {
            throw new Error('credential-body-canary');
          },
        };
      return { status: 200, body: { secret: options.secret ?? 'synthetic-scoped-credential' } };
    }
    if (options.failedInitialRead && calls.some((call) => call.method === 'POST'))
      throw new Error('secret-network-canary');
    if (options.readStatus && calls.some((call) => call.method === 'POST'))
      return { status: options.readStatus, body: 'read-canary' };
    if (options.invisible) return { status: 404 };
    if (options.missingById && input.path.endsWith(entity.id)) return { status: 404 };
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
  await expect(provisionCloudEnvironment({ ...owner, ...f })).rejects.toMatchObject(
    refused('Cloud environment namespace already exists; setup refused.', 'environment:exists'),
  );
  await expect(
    cleanupCloudEnvironment({ request: f.request, state: f.states.at(-1) }),
  ).rejects.toMatchObject({
    message: expect.stringContaining('cannot adopt'),
    code: 'environment:cleanup:adopt',
  });
  expect(f.calls.every((call) => call.method === 'GET')).toBe(true);
});

test('failed initial capture remains unverified after the read fault clears', async () => {
  const f = fixture({ failedInitialRead: true });
  await expect(provisionCloudEnvironment({ ...owner, ...f })).rejects.toMatchObject(
    refused(provisionRefusal, 'environment:transport:by_key'),
  );
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
  ).rejects.toMatchObject({ code: 'environment:cleanup:adopt' });
  expect(deletion).toEqual([]);
  expect(JSON.stringify(state)).not.toMatch(/secret|canary/u);
});

test.each([
  ['physical ID', { id: 'c'.repeat(32) }, 'environment:cleanup:ownership'],
  ['creation timestamp', { created_at: '2026-10-08T13:00:00Z' }, 'environment:cleanup:ownership'],
  ['key', { key: 'renamed-env' }, 'environment:identity:by_id'],
  ['project', { project_id: 'c'.repeat(32) }, 'environment:identity:by_id'],
  ['owner marker', { description: 'unrelated-description' }, 'environment:identity:by_id'],
])('cleanup refuses changed %s before deletion', async (_name, changes, code) => {
  const f = fixture();
  const { state } = await provisionCloudEnvironment({ ...owner, ...f });
  f.replace({ ...entity, ...changes });
  await expect(cleanupCloudEnvironment({ request: f.request, state })).rejects.toMatchObject({
    code,
  });
  expect(f.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
});

test('absence refuses late survivors and permits never-attempted true absence', async () => {
  const f = fixture({ noWrite: true, lostReply: true });
  await expect(provisionCloudEnvironment({ ...owner, ...f })).rejects.toMatchObject(
    refused(provisionRefusal, 'environment:create'),
  );
  f.replace(entity);
  await expect(
    cleanupCloudEnvironment({ request: f.request, state: f.states.at(-1) }),
  ).rejects.toMatchObject({ code: 'environment:cleanup:adopt' });
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
  await expect(provisionCloudEnvironment({ ...owner, ...f })).rejects.toMatchObject(
    refused(credentialRefusal, 'environment:http:api_key:401'),
  );
  expect(f.states.at(-1).capture).toBe('verified');
  await cleanupCloudEnvironment({ request: f.request, state: f.states.at(-1) });
});

test('failed deletion or surviving key/ID prevents verified cleanup', async () => {
  const f = fixture({ failedDeletion: true });
  const { state } = await provisionCloudEnvironment({ ...owner, ...f });
  await expect(cleanupCloudEnvironment({ request: f.request, state })).rejects.toMatchObject(
    refused(
      'Owned cloud environment deletion returned an unexpected HTTP status.',
      'environment:http:delete:500',
    ),
  );
  const surviving = fixture();
  const setup = await provisionCloudEnvironment({ ...owner, ...surviving });
  await expect(
    cleanupCloudEnvironment({
      state: setup.state,
      request: async (input) =>
        input.method === 'DELETE' ? { status: 204 } : { status: 200, body: entity },
    }),
  ).rejects.toMatchObject(
    refused(
      'Owned cloud environment cleanup has not verified key and physical ID absence.',
      'environment:cleanup:absence',
    ),
  );
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
  ).rejects.toMatchObject(refused(provisionRefusal, 'environment:create'));
  expect(states.at(-1)).toMatchObject({ attempted: true, capture: 'unverified', identity: null });
  await expect(cleanupCloudEnvironment({ request, state: states.at(-1) })).rejects.toMatchObject({
    code: 'environment:cleanup:adopt',
  });
  committed = true;
  await expect(cleanupCloudEnvironment({ request, state: states.at(-1) })).rejects.toMatchObject({
    code: 'environment:cleanup:adopt',
  });
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
    ).rejects.toMatchObject(refused(credentialRefusal, 'environment:credential:metadata'));
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
    ).rejects.toMatchObject(refused(credentialRefusal, 'environment:credential:scope'));
    await cleanupCloudEnvironment({ request: f.request, state: f.states.at(-1) });
  },
);

test.each([
  [{ createStatus: 409 }, 'environment:http:create:409'],
  [{ invisible: true }, 'environment:readback:by_key'],
  [{ ackFields: { created_at: '2026-10-08T12:30:00Z' } }, 'environment:identity-changed:by_key'],
  [{ ackFields: { project_id: 'd'.repeat(32) } }, 'environment:identity:create'],
  [{ missingById: true }, 'environment:readback:by_id'],
  [{ readStatus: 500 }, 'environment:http:by_key:500'],
])('provision classifies an unverified create: %j', async (options, code) => {
  const f = fixture(options);
  const error = await provisionCloudEnvironment({ ...owner, ...f }).catch((caught) => caught);
  expect(error).toMatchObject(refused(provisionRefusal, code));
  expect(JSON.stringify({ ...error, message: error.message })).not.toContain('canary');
  expect(f.states.at(-1).capture).toBe('unverified');
});
test.each([
  [{ lostCredential: true }, 'environment:transport:api_key'],
  [{ secret: 'two words' }, 'environment:credential:secret'],
  [{ unreadableCredential: true }, 'environment:credential:exception'],
  [{ lostScope: true }, 'environment:transport:api_key_scope'],
  [{ scopeStatus: 403 }, 'environment:http:api_key_scope:403'],
])('provision classifies a refused credential lookup: %j', async (options, code) => {
  const f = fixture(options);
  const error = await provisionCloudEnvironment({ ...owner, ...f }).catch((caught) => caught);
  expect(error).toMatchObject(refused(credentialRefusal, code));
  expect(JSON.stringify({ ...error, message: error.message })).not.toContain('canary');
  expect(f.states.at(-1).capture).toBe('verified');
});
test('provision classifies invalid inputs, boundaries and unexpected storage failures', async () => {
  const f = fixture();
  await expect(
    provisionCloudEnvironment({ ...owner, ...f, project: 'foreign' }),
  ).rejects.toMatchObject({ code: 'environment:inputs' });
  await expect(provisionCloudEnvironment({ ...owner, ...f, save: null })).rejects.toMatchObject({
    code: 'environment:boundary',
  });
  expect(f.calls).toEqual([]);
  let failures = 0;
  await expect(
    provisionCloudEnvironment({
      ...owner,
      request: f.request,
      save: async (state) => {
        if (state.capture === 'verified' && failures === 0) {
          failures += 1;
          throw new Error('storage-canary');
        }
      },
    }),
  ).rejects.toMatchObject(refused(provisionRefusal, 'environment:provision:exception'));
});
test('credential handoff classifies unverified state and changed ownership', async () => {
  const f = fixture();
  const { state } = await provisionCloudEnvironment({ ...owner, ...f });
  await expect(
    fetchCloudEnvironmentCredential({
      request: f.request,
      state: { ...state, capture: 'unverified' },
    }),
  ).rejects.toMatchObject({ code: 'environment:credential:state' });
  f.replace({ ...entity, created_at: '2026-10-08T13:00:00Z' });
  await expect(
    fetchCloudEnvironmentCredential({ request: f.request, state }),
  ).rejects.toMatchObject({
    message: 'Cloud credential handoff refused changed or ambiguous environment ownership.',
    code: 'environment:credential:ownership:by_key',
  });
});
test.each([
  ['an extra state field', (state) => ({ ...state, extra: true }), 'environment:cleanup:state'],
  [
    'a malformed identity',
    (state) => ({ ...state, identity: { ...state.identity, createdAt: 'never' } }),
    'environment:cleanup:identity',
  ],
])('cleanup refuses %s before any HTTP', async (_name, change, code) => {
  const f = fixture();
  const { state } = await provisionCloudEnvironment({ ...owner, ...f });
  const before = f.calls.length;
  await expect(
    cleanupCloudEnvironment({ request: f.request, state: change(state) }),
  ).rejects.toMatchObject({ code });
  await expect(cleanupCloudEnvironment({ request: null, state })).rejects.toMatchObject({
    code: 'environment:cleanup:boundary',
  });
  expect(f.calls).toHaveLength(before);
});
test.each([
  [
    'a lost deletion reply',
    async (input) => {
      if (input.method === 'DELETE') throw new Error('deletion-response-canary');
      return { status: 200, body: entity };
    },
    'Owned cloud environment deletion failed.',
    'environment:transport:delete',
  ],
  [
    'an unexpected read status',
    async () => ({ status: 503, body: 'read-canary' }),
    'Cloud environment ownership read returned an unexpected HTTP status.',
    'environment:http:by_id:503',
  ],
])('cleanup classifies %s', async (_name, request, message, code) => {
  const f = fixture();
  const { state } = await provisionCloudEnvironment({ ...owner, ...f });
  const error = await cleanupCloudEnvironment({ request, state }).catch((caught) => caught);
  expect(error).toMatchObject(refused(message, code));
  expect(JSON.stringify({ ...error, message: error.message })).not.toContain('canary');
});
