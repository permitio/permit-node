import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
  symlinkSync,
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

const project = 'deadbeef'.repeat(4),
  environment = 'facefeed'.repeat(4),
  organization = 'c0ffee00'.repeat(4),
  keyId = 'badcab1e'.repeat(4),
  pdpId = '5ca1ab1e'.repeat(4);
const credential = 'synthetic-env%credential';
const canary = 'CLOUD_LIFECYCLE_RESPONSE_ONLY_CANARY';
const diagnostic = (code) => `Cloud lifecycle diagnostic: ${code}`;
const censusKinds = [
  'resources',
  'roles',
  'user_attributes',
  'condition_sets',
  'condition_set_rules',
  'users',
  'tenants',
  'groups',
  'user_invites',
  'resource_instances',
  'relationship_tuples',
  'role_assignments',
  'proxy_configs',
  'pdp_configs',
  'elements_configs',
  'email_templates',
  'email_configuration',
  'opal_scope',
  'api_keys',
  'resource_actions',
  'resource_attributes',
  'resource_roles',
  'resource_relations',
  'resource_action_groups',
];
const censusLine = (counts) =>
  `Cloud closure census: ${censusKinds.map((kind) => `${kind}=${counts[kind] ?? 0}`).join(',')}`;
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
    calls = [],
    lines = [];
  const scope = {
    organization_id: organization,
    project_id: project,
    environment_id: environment,
  };
  const environmentKey = {
    ...scope,
    id: keyId,
    created_at: '2026-10-08T12:00:00Z',
    object_type: 'env',
    owner_type: 'pdp_config',
    secret: credential,
    last_used_at: null,
  };
  const request = async (input) => {
    calls.push(structuredClone(input));
    const path = new URL(input.path, 'https://api.permit.io');
    const responded = await options.respond?.(input, path.pathname);
    if (responded !== undefined) return responded;
    if (input.path === '/v2/api-key/scope') {
      expect(input.credential).toBe(credential);
      return { status: 200, body: { ...scope, ...options.scope } };
    }
    if (input.path === `/v2/api-key/${project}/${environment}`) {
      expect(input.credential).toBeUndefined();
      if (options.failedCredential) throw new Error(canary);
      return { status: 200, body: structuredClone(environmentKey) };
    }
    if (path.pathname.startsWith('/v2/api-key')) return { status: 403, body: { detail: canary } };
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
    if (path.pathname === `/v2/pdps/${project}/${environment}/configs`)
      return {
        status: 200,
        body: (options.pdpConfigs ?? [credential]).map((secret, index) => ({
          ...scope,
          id: index ? `${'5ca1ab1e'.repeat(3)}${index.toString(16).padStart(8, '0')}` : pdpId,
          client_secret: secret,
        })),
      };
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
    environmentKey,
    lines,
    report: (line) => {
      lines.push(line);
    },
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
  const keyReads = f.calls.filter((call) => call.path === `/v2/api-key/${project}/${environment}`);
  expect(keyReads).toHaveLength(6);
  expect(keyReads.every((call) => call.method === 'GET' && call.credential === undefined)).toBe(
    true,
  );
  expect(
    f.calls.some((call) => new URL(call.path, 'https://api.permit.io').pathname === '/v2/api-key'),
  ).toBe(false);
  expect(f.lines).toEqual([]);
});

test.each([
  ['replaced', { created_at: '2026-10-08T13:00:00Z' }],
  ['reassigned', { owner_type: 'member' }],
])('a %s environment key refuses cleanup before cascading', async (_name, change) => {
  const f = boundary();
  await setup(f);
  Object.assign(f.environmentKey, change);
  await expect(cleanupTrustedCloud(f)).rejects.toThrow('cleanup failed');
  expect(f.lines).toEqual([diagnostic('closure:verify:changed:api_keys')]);
  expect(f.hasEnvironment()).toBe(true);
  expect(f.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
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
  expect(f.lines).toEqual([diagnostic('lifecycle:trusted-run')]);
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
    expect(f.lines).toEqual([]);
    await expect(cleanupTrustedCloud(f)).rejects.toThrow('cleanup failed');
    expect(f.lines).toEqual([diagnostic('lifecycle:state')]);
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
  expect(f.lines).toEqual([diagnostic('environment:credential:ownership:by_key')]);
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
  expect(f.lines).toEqual([
    diagnostic('fixture:write:tenants'),
    diagnostic('fixture:settled:state'),
  ]);
  expect(f.hasEnvironment()).toBe(true);
  expect(f.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
});

test('failed credential lookup keeps initial closure unverified', async () => {
  const f = boundary({ failedCredential: true });
  await expect(setup(f)).rejects.toThrow('setup failed');
  expect(f.read('state.json').fixture).toBeNull();
  f.env.CLOUD_SETUP_RESULT = 'failure';
  await expect(cleanupTrustedCloud(f)).rejects.toThrow('cleanup failed');
  expect(f.lines).toEqual([
    diagnostic('environment:transport:api_key'),
    diagnostic('lifecycle:closure-context'),
  ]);
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
  expect(f.lines).toEqual([
    diagnostic('environment:cleanup:absence'),
    diagnostic('lifecycle:fixture-missing'),
  ]);
});

test('second setup refuses before replaying a create or overwriting ownership state', async () => {
  const f = boundary();
  await setup(f);
  const before = f.calls.length;
  await expect(setup(f)).rejects.toThrow('setup failed');
  expect(f.lines).toEqual([diagnostic('unclassified')]);
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
  expect(f.lines).toEqual([diagnostic('closure:verify:changed:resources')]);
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
  expect(f.lines).toEqual([diagnostic('closure:verify:changed:resources')]);
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

const foreign = 'decafbad'.repeat(4),
  child = 'feedface'.repeat(4);
const schemaPath = `/v2/schema/${project}/${environment}`,
  factsPath = `/v2/facts/${project}/${environment}`,
  environmentsPath = `/v2/projects/${project}/envs`;
const leakedBody = {
  detail: canary,
  id: keyId,
  url: `https://api.permit.io${factsPath}/users`,
  secret: credential,
};
const scopedRow = (fields) => ({
  organization_id: organization,
  project_id: project,
  environment_id: environment,
  created_at: '2026-10-08T12:00:00Z',
  ...fields,
});
test.each([
  [
    'an unexpected surface status with a response body',
    'closure:http:opal_scope:403',
    {
      respond: (_input, pathname) =>
        pathname.endsWith('/opal_scope') ? { status: 403, body: leakedBody } : undefined,
    },
  ],
  [
    'a transport exception naming IDs, URLs and secrets',
    'closure:transport:roles',
    {
      respond: (_input, pathname) => {
        if (pathname === `${schemaPath}/roles`)
          throw new Error(`${canary} ${keyId} https://api.permit.io${pathname} ${credential}`);
      },
    },
  ],
  [
    'a default row from another project',
    'closure:scope:tenants',
    {
      respond: (_input, pathname) =>
        pathname === `${factsPath}/tenants`
          ? { status: 200, body: [scopedRow({ id: foreign, key: 'default', project_id: child })] }
          : undefined,
      census: { tenants: 1 },
    },
  ],
  [
    'an unexpected group',
    'closure:defaults:unexpected-rows:groups',
    {
      respond: (_input, pathname) =>
        pathname === `${schemaPath}/groups`
          ? { status: 200, body: [scopedRow({ id: foreign, key: canary })] }
          : undefined,
      census: { groups: 1 },
    },
  ],
  [
    'an unmatched built-in resource role',
    'closure:child:roles',
    {
      respond: (_input, pathname) => {
        if (pathname === `${schemaPath}/resources`)
          return { status: 200, body: [scopedRow({ id: foreign, key: '__tenant' })] };
        if (pathname === `${schemaPath}/resources/${foreign}/roles`)
          return {
            status: 200,
            body: [scopedRow({ id: child, key: canary, resource_id: foreign })],
          };
      },
      census: { resources: 1, resource_roles: 1 },
    },
  ],
  [
    'a PDP secret that differs from the key',
    'closure:api-key:secret-unmatched',
    { pdpConfigs: [canary], census: {} },
  ],
  [
    'a rejected fixture write',
    'fixture:http:tenants:409',
    {
      respond: (input, pathname) =>
        input.method === 'POST' && pathname === `${factsPath}/tenants`
          ? { status: 409, body: leakedBody }
          : undefined,
    },
  ],
  [
    'a foreign create acknowledgment',
    'environment:identity:create',
    {
      respond: (input, pathname) =>
        input.method === 'POST' && pathname === environmentsPath
          ? { status: 201, body: { ...input.body, id: environment, description: canary } }
          : undefined,
    },
  ],
  [
    'an unexpected environment read',
    'environment:http:by_key:500',
    {
      respond: (input, pathname) =>
        input.method === 'GET' && pathname.startsWith(environmentsPath)
          ? { status: 500, body: leakedBody }
          : undefined,
    },
  ],
  [
    'a key created before its environment',
    'closure:created-at:api_keys',
    { keyBirth: true, census: {} },
  ],
  ['a changed captured child at cleanup', 'closure:verify:changed:resources', { cleanup: true }],
])('%s prints one static diagnostic without response data', async (_name, code, options) => {
  const f = boundary(options);
  if (options.keyBirth) f.environmentKey.created_at = '2026-10-08T11:00:00Z';
  if (options.cleanup) {
    await setup(f);
    const resource = [...f.entities.values()].find((row) => row.kind === 'resources');
    resource.type_attributes = { leaked: `${canary} ${keyId} ${credential}` };
    await expect(cleanupTrustedCloud(f)).rejects.toThrow(/^Trusted cloud cleanup failed;/u);
  } else await expect(setup(f)).rejects.toThrow(/^Trusted cloud setup failed;/u);
  expect(f.lines).toEqual(
    options.census
      ? [censusLine({ pdp_configs: 1, api_keys: 1, ...options.census }), diagnostic(code)]
      : [diagnostic(code)],
  );
  for (const secret of [
    project,
    environment,
    organization,
    keyId,
    pdpId,
    foreign,
    child,
    credential,
    canary,
    'https://',
    '/v2/',
    'node-acceptance',
  ])
    expect(f.lines.join('\n')).not.toContain(secret);
});
test.each([
  ['closure:http:groups:403', 'closure:http:groups:403'],
  ['closure:Upper', 'unclassified'],
  [`closure:${'z'.repeat(40)}`, `closure:${'z'.repeat(40)}`],
  [`closure:${'z'.repeat(41)}`, 'unclassified'],
  ['area:a:b:c:d:e', 'unclassified'],
  ['closure', 'unclassified'],
  ['closure:http:groups:403\nforged: line', 'unclassified'],
  [`closure:scope:${project}`, 'unclassified'],
  ['closure:scope:6f1c2d3e-4b5a-6978-8a9b-0c1d2e3f4a5b', 'unclassified'],
  [403, 'unclassified'],
])('setup and cleanup print code %j as %s', async (code, printed) => {
  for (const step of [setupTrustedCloud, cleanupTrustedCloud]) {
    const f = boundary();
    Object.defineProperty(f.env, 'GITHUB_ACTIONS', {
      get() {
        throw Object.assign(new Error(canary), { code });
      },
    });
    await expect(step(f)).rejects.toThrow(/^Trusted cloud (setup|cleanup) failed;/u);
    expect(f.lines).toEqual([diagnostic(printed)]);
    expect(f.calls).toEqual([]);
  }
});
test.each([
  [
    'a relative state directory',
    'lifecycle:directory',
    setupTrustedCloud,
    (f) => {
      f.directory = 'cloud-state';
    },
  ],
  [
    'a state directory outside the runner temporary directory',
    'lifecycle:directory',
    setupTrustedCloud,
    (f) => {
      f.directory = join(realpathSync(tmpdir()), 'foreign-cloud-state');
    },
  ],
  [
    'a symlinked state directory',
    'lifecycle:directory',
    setupTrustedCloud,
    (f) => {
      const target = join(f.env.RUNNER_TEMP, 'linked-state');
      mkdirSync(target);
      symlinkSync(target, f.directory);
    },
  ],
  [
    'a closure too large for private state',
    'lifecycle:state-size',
    setupTrustedCloud,
    (_f, options) => {
      const attributes = Array.from({ length: 120 }, (_value, index) =>
        scopedRow({
          id: (index + 1).toString(16).padStart(32, 'f'),
          key: `${index}-${'k'.repeat(600)}`,
          built_in: true,
          resource_id: foreign,
        }),
      );
      options.respond = (input, pathname) => {
        if (input.method === 'GET' && pathname === `${schemaPath}/resources`)
          return { status: 200, body: [scopedRow({ id: foreign, key: '__user' })] };
        if (pathname === `${schemaPath}/resources/${foreign}/attributes`) {
          const page = Number(
            new URL(input.path, 'https://api.permit.io').searchParams.get('page'),
          );
          return { status: 200, body: attributes.slice((page - 1) * 100, page * 100) };
        }
      };
    },
  ],
  [
    'a state record that is not a regular file',
    'lifecycle:file',
    cleanupTrustedCloud,
    (f) => {
      mkdirSync(join(f.directory, 'state.json'), { recursive: true });
    },
  ],
  [
    'a foreign saved owner',
    'lifecycle:owner',
    cleanupTrustedCloud,
    async (f) => {
      await setup(f);
      const state = f.read('state.json');
      state.owner.key = 'node-acceptance-999-1';
      writeFileSync(join(f.directory, 'state.json'), JSON.stringify(state));
    },
  ],
  [
    'an unknown setup result',
    'lifecycle:setup-result',
    cleanupTrustedCloud,
    async (f) => {
      await setup(f);
      f.env.CLOUD_SETUP_RESULT = 'skipped';
    },
  ],
  [
    'changed fixture names',
    'lifecycle:fixture-names',
    cleanupTrustedCloud,
    async (f) => {
      await setup(f);
      writeFileSync(join(f.directory, 'fixture.json'), JSON.stringify({ resource: 'foreign' }));
    },
  ],
  [
    'a credential scoped to another organization',
    'lifecycle:organization',
    cleanupTrustedCloud,
    async (f, options) => {
      await setup(f);
      options.scope = { organization_id: foreign };
      f.environmentKey.organization_id = foreign;
    },
  ],
])('%s prints %s', async (_name, code, step, prepare) => {
  const options = {},
    f = boundary(options);
  await prepare(f, options);
  expect(f.lines).toEqual([]);
  await expect(step(f)).rejects.toThrow(/^Trusted cloud (setup|cleanup) failed;/u);
  expect(f.lines).toEqual([diagnostic(code)]);
  expect(f.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
});

test('a production environment with two PDP configs completes setup, handoff and cleanup', async () => {
  const f = boundary({ pdpConfigs: [`${canary}-other`, credential] });
  expect(await setup(f)).toEqual({ schema: 2, status: 'PASS', fixtureWriteCount: 7 });
  await handoffTrustedCloud({ ...f, mask: () => {} });
  expect((await cleanupTrustedCloud(f)).cleanup.verified).toBe(1);
  expect(f.hasEnvironment()).toBe(false);
  expect(f.lines).toEqual([]);
});
test.each([
  [
    'a key matching none of two PDP configs',
    [`${canary}-first`, `${canary}-second`],
    'closure:api-key:secret-unmatched',
  ],
  ['a key matching two PDP configs', [credential, credential], 'closure:api-key:secret-ambiguous'],
  [
    'five PDP configs',
    [credential, ...Array.from({ length: 4 }, (_value, index) => `${canary}-${index}`)],
    'closure:defaults:pdp_configs',
  ],
])('%s prints the exact census before its diagnostic', async (_name, pdpConfigs, code) => {
  const f = boundary({ pdpConfigs });
  await expect(setup(f)).rejects.toThrow(/^Trusted cloud setup failed;/u);
  expect(f.lines).toEqual([
    censusLine({ pdp_configs: pdpConfigs.length, api_keys: 1 }),
    diagnostic(code),
  ]);
  for (const secret of [project, environment, organization, keyId, pdpId, credential, canary])
    expect(f.lines.join('\n')).not.toContain(secret);
  f.env.CLOUD_SETUP_RESULT = 'failure';
  await expect(cleanupTrustedCloud(f)).rejects.toThrow(/^Trusted cloud cleanup failed;/u);
  expect(f.lines.at(-1)).toBe(diagnostic('lifecycle:closure-context'));
  expect(f.lines.filter((line) => line.startsWith('Cloud closure census:'))).toHaveLength(1);
});
test('a capture refusal before the inventory is complete prints no census', async () => {
  const f = boundary({
    respond: (_input, pathname) =>
      pathname.endsWith('/configs') ? { status: 403, body: { detail: canary } } : undefined,
  });
  await expect(setup(f)).rejects.toThrow(/^Trusted cloud setup failed;/u);
  expect(f.lines).toEqual([diagnostic('closure:http:pdp_configs:403')]);
});
const fullCensus = censusKinds.map((kind) => `${kind}=0`).join(',');
test.each([
  ['pdp_configs=2,api_keys=1', 'Cloud closure census: pdp_configs=2,api_keys=1'],
  [fullCensus, `Cloud closure census: ${fullCensus}`],
  [`${'z'.repeat(40)}=128`, `Cloud closure census: ${'z'.repeat(40)}=128`],
  [
    Array(41).fill('kind=1').join(','),
    `Cloud closure census: ${Array(41).fill('kind=1').join(',')}`,
  ],
  ['pdp_configs=invalid', 'Cloud closure census: pdp_configs=invalid'],
  [Array(42).fill('kind=1').join(','), 'Cloud closure census: unavailable'],
  [`${'z'.repeat(41)}=1`, 'Cloud closure census: unavailable'],
  ['pdp_configs=129', 'Cloud closure census: unavailable'],
  ['pdp_configs=007', 'Cloud closure census: unavailable'],
  ['pdp_configs=-1', 'Cloud closure census: unavailable'],
  ['Pdp_configs=1', 'Cloud closure census: unavailable'],
  [`${project}=1`, 'Cloud closure census: unavailable'],
  ['pdp_configs=1\nforged: line', 'Cloud closure census: unavailable'],
  ['', 'Cloud closure census: unavailable'],
  [2, 'Cloud closure census: unavailable'],
  [null, 'Cloud closure census: unavailable'],
])('setup prints census %j as %j and cleanup never prints it', async (census, printed) => {
  const code = 'closure:defaults:pdp_configs';
  for (const step of [setupTrustedCloud, cleanupTrustedCloud]) {
    const f = boundary();
    Object.defineProperty(f.env, 'GITHUB_ACTIONS', {
      get() {
        throw Object.assign(new Error(canary), { code, census });
      },
    });
    await expect(step(f)).rejects.toThrow(/^Trusted cloud (setup|cleanup) failed;/u);
    expect(f.lines).toEqual(
      step === setupTrustedCloud ? [printed, diagnostic(code)] : [diagnostic(code)],
    );
  }
});
