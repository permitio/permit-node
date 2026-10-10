import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  cleanupTrustedCloud,
  handoffTrustedCloud,
  setupTrustedCloud,
  trustedCloudRun,
} from '#scripts/cloud-lifecycle.mjs';

const project = 'b'.repeat(32),
  environment = 'c'.repeat(32),
  organization = 'a'.repeat(32);
const credential = 'synthetic-env%credential';
const canary = 'CLOUD_LIFECYCLE_RESPONSE_ONLY_CANARY';
function boundary(options = {}) {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), 'public-cloud-lifecycle-')));
  const directory = join(temp, 'cloud-state'),
    output = join(temp, 'step-output');
  writeFileSync(output, '', { mode: 0o600 });
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'permitio/permit-node',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_ACTOR: 'trusted-user',
    GITHUB_EVENT_NAME: 'pull_request',
    PR_HEAD_REPOSITORY: 'permitio/permit-node',
    GITHUB_REF: 'refs/pull/123/merge',
    GITHUB_WORKFLOW_REF: 'permitio/permit-node/.github/workflows/ci.yaml@refs/pull/123/merge',
    RUNNER_TEMP: temp,
    PROJECT_ID: project,
    GITHUB_OUTPUT: output,
    CLOUD_SETUP_RESULT: 'success',
  };
  let owner,
    count = 0,
    grant;
  const entities = new Map(),
    calls = [];
  const request = async (input) => {
    calls.push(structuredClone(input));
    const path = new URL(input.path, 'https://api.permit.io');
    if (input.path === '/v2/api-key/scope') {
      expect(input.credential).toBe(credential);
      return {
        status: 200,
        body: {
          organization_id: organization,
          project_id: project,
          environment_id: environment,
          ...options.scope,
        },
      };
    }
    if (path.pathname === '/v2/api-key') return { status: 200, body: { data: [], total_count: 0 } };
    if (input.path.startsWith('/v2/api-key/')) {
      if (options.failedCredential) throw new Error(canary);
      return {
        status: 200,
        body: {
          secret: credential,
          object_type: 'env',
          organization_id: organization,
          project_id: project,
          environment_id: environment,
        },
      };
    }
    if (input.path.startsWith(`/v2/projects/${project}/envs`)) {
      if (input.method === 'POST') {
        owner = {
          ...input.body,
          id: environment,
          project_id: project,
          created_at: '2026-10-08T12:00:00Z',
          secret: canary,
        };
        return { status: 201, body: structuredClone(owner) };
      }
      if (input.method === 'DELETE') {
        if (!options.retained) owner = undefined;
        return { status: 204 };
      }
      return { status: owner ? 200 : 404, body: structuredClone(owner) };
    }
    expect(input.credential).toBe(credential);
    const kind = path.pathname.split('/')[5];
    if (input.method === 'POST') {
      count += 1;
      const base = {
        id: count.toString(16).padStart(32, '0'),
        organization_id: organization,
        project_id: project,
        environment_id: environment,
        created_at: '2026-10-08T12:00:00Z',
      };
      if (kind === 'role_assignments')
        grant = {
          ...base,
          user_id: input.body.user,
          role_id: input.body.role,
          tenant_id: input.body.tenant,
          user: entities.get(input.body.user).key,
          role: entities.get(input.body.role).key,
        };
      else if (options.unknownFixture !== count) {
        const row = { ...base, ...input.body, secret: canary, kind };
        if (kind === 'resources' && options.policyField)
          Object.defineProperty(row.type_attributes, options.policyField, {
            value: 'initial',
            writable: true,
            enumerable: true,
            configurable: true,
          });
        entities.set(row.key, row);
        entities.set(row.id, row);
      }
      if (options.unknownFixture === count) throw new Error(canary);
      return {
        status: 201,
        body: kind === 'role_assignments' ? grant : entities.get(input.body.key),
      };
    }
    if (path.pathname.includes('/users/attributes')) return { status: 200, body: [] };
    if (path.pathname.endsWith('/email_configurations') || path.pathname.endsWith('/opal_scope'))
      return { status: 404 };
    if (kind === 'role_assignments') return { status: 200, body: grant ? [grant] : [] };
    if (path.pathname.split('/').length === 6 || path.pathname.endsWith('/email_templates/')) {
      const rows = [
        ...new Map(
          [...entities.values()].filter((row) => row.kind === kind).map((row) => [row.id, row]),
        ).values(),
      ];
      return { status: 200, body: structuredClone(rows) };
    }
    if (path.pathname.split('/').length > 7) return { status: 200, body: [] };
    const row = entities.get(decodeURIComponent(path.pathname.split('/')[6]));
    return { status: row ? 200 : 404, body: structuredClone(row) };
  };
  const read = (name) => JSON.parse(readFileSync(join(directory, name), 'utf8'));
  return {
    directory,
    env,
    request,
    read,
    calls,
    output,
    replace: (change) => {
      owner = { ...owner, ...change };
    },
    hasEnvironment: () => Boolean(owner),
    entities,
  };
}

const setup = (f) => setupTrustedCloud(f);

test('trusted lifecycle stores only identifiers, masks handoff, and verifies absence', async () => {
  const f = boundary();
  expect(await setup(f)).toEqual({ schema: 2, status: 'PASS', fixtureWriteCount: 7 });
  const state = f.read('state.json');
  expect(state.fixture.records).toHaveLength(7);
  expect(statSync(join(f.directory, 'state.json')).mode & 0o777).toBe(0o600);
  expect(JSON.stringify(state)).not.toMatch(/credential|CANARY/u);
  expect(readdirSync(f.directory).sort()).toEqual(['fixture.json', 'state.json']);
  const masks = [];
  await handoffTrustedCloud({
    ...f,
    mask: (line) => {
      expect(readFileSync(f.output, 'utf8')).toBe('');
      masks.push(line);
    },
  });
  expect(masks).toEqual(['::add-mask::synthetic-env%25credential']);
  expect(readFileSync(f.output, 'utf8')).toBe(`api_key=${credential}\n`);
  const cleanup = await cleanupTrustedCloud(f);
  expect(cleanup.cleanup).toEqual({ registered: 1, completed: 1, verified: 1 });
  expect(f.hasEnvironment()).toBe(false);
  expect(JSON.stringify(cleanup)).not.toMatch(/credential|CANARY/u);
  expect(f.calls.filter((call) => call.method === 'POST')).toHaveLength(8);
  expect(f.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
});

test.each([
  ['foreign repository', { GITHUB_REPOSITORY: 'foreign/repo' }],
  ['fork', { PR_HEAD_REPOSITORY: 'fork/permit-node' }],
  ['dependabot', { GITHUB_ACTOR: 'dependabot[bot]' }],
  ['manual dispatch', { GITHUB_EVENT_NAME: 'workflow_dispatch' }],
  ['non-CI runtime', { GITHUB_ACTIONS: 'false' }],
  [
    'foreign workflow',
    { GITHUB_WORKFLOW_REF: 'permitio/permit-node/.github/workflows/foreign.yaml@refs/heads/main' },
  ],
])('untrusted %s refuses before any HTTP or state artifact', async (_name, change) => {
  const f = boundary();
  Object.assign(f.env, change);
  expect(() => trustedCloudRun(f.env)).toThrow();
  await expect(setup(f)).rejects.toThrow(/^Trusted cloud setup failed;/u);
  expect(f.calls).toEqual([]);
});

test.each(['commit', 'runAttempt', 'repository'])(
  'a %s mismatch in copied state refuses broad-key use',
  async (field) => {
    const f = boundary();
    await setup(f);
    const state = f.read('state.json');
    state.ci[field] = 'foreign-value';
    writeFileSync(join(f.directory, 'state.json'), JSON.stringify(state));
    const before = f.calls.length;
    await expect(handoffTrustedCloud({ ...f, mask: () => {} })).rejects.toThrow('handoff failed');
    await expect(cleanupTrustedCloud(f)).rejects.toThrow('cleanup failed');
    expect(f.calls.length).toBe(before);
    expect(readFileSync(f.output, 'utf8')).toBe('');
  },
);

test('recycled creation identity refuses candidate credential handoff and deletion', async () => {
  const f = boundary();
  await setup(f);
  f.replace({ created_at: '2026-10-08T13:00:00Z' });
  await expect(handoffTrustedCloud({ ...f, mask: () => {} })).rejects.toThrow('handoff failed');
  await expect(cleanupTrustedCloud(f)).rejects.toThrow('cleanup failed');
  expect(f.hasEnvironment()).toBe(true);
  expect(f.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
  expect(readFileSync(f.output, 'utf8')).toBe('');
});

test('uncertain fixture write retains environment without cascade credit', async () => {
  const f = boundary({ unknownFixture: 3 });
  await expect(setup(f)).rejects.toThrow('setup failed');
  expect(f.read('state.json').fixture.unknownWrite).toBe(true);
  f.env.CLOUD_SETUP_RESULT = 'failure';
  await expect(cleanupTrustedCloud(f)).rejects.toThrow('cleanup failed');
  expect(f.hasEnvironment()).toBe(true);
  expect(f.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
});

test('failed credential lookup keeps initial closure unverified', async () => {
  const f = boundary({ failedCredential: true });
  await expect(setup(f)).rejects.toThrow('setup failed');
  expect(f.read('state.json').fixture).toBeNull();
  f.env.CLOUD_SETUP_RESULT = 'failure';
  await expect(cleanupTrustedCloud(f)).rejects.toThrow('cleanup failed');
  expect(f.hasEnvironment()).toBe(true);
  expect(f.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
  await expect(handoffTrustedCloud({ ...f, mask: () => {} })).rejects.toThrow('handoff failed');
});

test('missing saved fixture or surviving deletion prevents positive cleanup', async () => {
  const f = boundary({ retained: true });
  await setup(f);
  await expect(cleanupTrustedCloud(f)).rejects.toThrow('cleanup failed');
  expect(f.hasEnvironment()).toBe(true);
  const state = f.read('state.json');
  state.fixture = null;
  writeFileSync(join(f.directory, 'state.json'), JSON.stringify(state));
  await expect(cleanupTrustedCloud(f)).rejects.toThrow('cleanup failed');
});

test('second setup refuses before replaying a create or overwriting ownership state', async () => {
  const f = boundary();
  await setup(f);
  const before = f.calls.length;
  await expect(setup(f)).rejects.toThrow('setup failed');
  expect(f.calls.length).toBe(before);
});

test.each(['replace', 'add'])('cleanup refuses a %s child before cascading', async (fault) => {
  const f = boundary();
  await setup(f);
  const resource = [...f.entities.values()].find((row) => row.kind === 'resources');
  if (fault === 'replace') resource.created_at = '2026-10-08T13:00:00Z';
  else {
    const row = { ...resource, key: 'unreserved', id: 'f'.repeat(32) };
    f.entities.set(row.id, row);
  }
  await expect(cleanupTrustedCloud(f)).rejects.toThrow('cleanup failed');
  expect(f.hasEnvironment()).toBe(true);
  expect(f.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
});

test.each([
  'updated_at',
  'last_used_at',
  'last_action_at',
  '__proto__',
  'constructor',
  'prototype',
])('arbitrary policy dictionary %s changes never gain cascade credit', async (policyField) => {
  const f = boundary({ policyField });
  await setup(f);
  const resource = [...f.entities.values()].find((row) => row.kind === 'resources');
  expect(Object.hasOwn(resource.type_attributes, policyField)).toBe(true);
  resource.type_attributes[policyField] = 'changed';
  await expect(cleanupTrustedCloud(f)).rejects.toThrow('cleanup failed');
  expect(f.hasEnvironment()).toBe(true);
  expect(f.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
});
test('documented top-level updated_at metadata may change without changing ownership', async () => {
  const f = boundary();
  await setup(f);
  for (const entity of new Set(f.entities.values())) entity.updated_at = '2026-10-08T13:00:00Z';
  expect((await cleanupTrustedCloud(f)).cleanup.verified).toBe(1);
  expect(f.hasEnvironment()).toBe(false);
});
