import { expect, test } from 'vitest';
import {
  captureCloudClosure,
  cloudClosurePages,
  settleCloudClosure,
  verifyCloudClosure,
} from '#scripts/cloud-closure.mjs';

const context = {
  organization: 'a'.repeat(32),
  project: 'b'.repeat(32),
  environment: 'c'.repeat(32),
  createdAt: '2026-10-08T12:00:00Z',
};
const canary = 'CLOUD_CHILD_RESPONSE_ONLY_CANARY';
const environmentKeyPath = `/v2/api-key/${context.project}/${context.environment}`;
let sequence = 20;
function row(fields = {}) {
  sequence += 1;
  return {
    id: sequence.toString(16).padStart(32, '0'),
    created_at: context.createdAt,
    organization_id: context.organization,
    project_id: context.project,
    environment_id: context.environment,
    secret: canary,
    ...fields,
  };
}
function boundary() {
  const groups = new Map(),
    calls = [],
    projectCalls = [],
    overrides = new Map();
  let fault;
  const pdp = row({ client_secret: canary });
  delete pdp.created_at;
  groups.set('pdp_configs', [pdp]);
  groups.set('api_keys', [
    row({
      object_type: 'env',
      owner_type: 'pdp_config',
      last_used_at: null,
      env: { id: context.environment },
      project: { id: context.project },
    }),
  ]);
  const projectRequest = async (input) => {
    projectCalls.push(input);
    if (input.method !== 'GET' || input.path !== environmentKeyPath)
      return { status: 403, body: { detail: canary } };
    if (fault?.kind === 'api_keys') {
      if (fault.throw) throw new Error(canary);
      return structuredClone(fault.reply);
    }
    const [key] = groups.get('api_keys');
    return { status: key ? 200 : 404, body: structuredClone(key) };
  };
  const request = async (input) => {
    calls.push(input);
    const url = new URL(input.path, 'https://api.permit.io');
    const pieces = url.pathname.split('/');
    let kind = pieces[5];
    if (url.pathname.startsWith('/v2/api-key')) return { status: 403, body: { detail: canary } };
    if (url.pathname.includes('/resources/') && pieces.length === 8)
      kind = `resource:${pieces[6]}:${pieces[7]}`;
    else if (url.pathname.endsWith('/users/attributes')) kind = 'user_attributes';
    else if (url.pathname.endsWith('/set_rules')) kind = 'condition_set_rules';
    else if (pieces[2] === 'pdps') kind = 'pdp_configs';
    else if (pieces[2] === 'elements') kind = 'elements_configs';
    else if (url.pathname.endsWith('/email_templates/')) kind = 'email_templates';
    if (pieces.length === 7 && ['resources', 'roles', 'tenants', 'users'].includes(kind)) {
      const body = overrides.has(pieces[6])
        ? overrides.get(pieces[6])
        : groups.get(kind)?.find((row) => row.id === pieces[6]);
      return { status: body ? 200 : 404, body: structuredClone(body) };
    }
    const singleton = kind === 'email_configurations' || kind === 'opal_scope';
    const rows = groups.get(kind === 'email_configurations' ? 'email_configuration' : kind) ?? [];
    if (fault?.kind === kind) {
      if (fault.throw) throw new Error(canary);
      return structuredClone(fault.reply);
    }
    if (singleton) return { status: rows.length ? 200 : 404, body: rows[0] };
    const page = Number(url.searchParams.get('page')),
      data = rows.slice((page - 1) * 100, page * 100);
    return {
      status: 200,
      body:
        url.searchParams.get('include_total_count') === 'true'
          ? { data, total_count: rows.length, page_count: rows.length }
          : data,
    };
  };
  return {
    groups,
    calls,
    projectCalls,
    overrides,
    request,
    projectRequest,
    setFault: (value) => {
      fault = value;
    },
  };
}
const http = (f) => ({ request: f.request, projectRequest: f.projectRequest });
function freshEnvironment(f, { role = true, association = true } = {}) {
  const resources = (role ? ['__role', '__user', '__tenant'] : ['__user', '__tenant']).map((key) =>
    row({ key, roles: {}, actions: {} }),
  );
  const user = resources.find((entry) => entry.key === '__user'),
    tenant = resources.find((entry) => entry.key === '__tenant');
  f.groups.set('resources', resources);
  f.groups.set('tenants', [row({ key: 'default' })]);
  const tenantRole = row({
    key: 'tenant-association',
    name: 'tenant-association',
    resource_id: tenant.id,
    permissions: [],
  });
  if (association) f.groups.set(`resource:${tenant.id}:roles`, [tenantRole]);
  return {
    role: resources.find((entry) => entry.key === '__role'),
    user,
    tenant,
    tenantRole,
    key: f.groups.get('api_keys')[0],
  };
}
function fixture(f) {
  const owned = [];
  for (const [kind, key] of [
    ['resources', 'document'],
    ['roles', 'reader'],
    ['tenants', 'tenant'],
    ['tenants', 'other'],
    ['users', 'allowed'],
    ['users', 'denied'],
    ['role_assignments', 'allowed'],
  ]) {
    const item = row({ key });
    if (kind === 'role_assignments') {
      item.user_id = owned.find((row) => row.kind === 'users' && row.key === 'allowed').id;
      item.role_id = owned.find((row) => row.kind === 'roles').id;
      item.tenant_id = owned.find((row) => row.kind === 'tenants' && row.key === 'tenant').id;
    }
    const values = f.groups.get(kind) ?? [];
    values.push(item);
    f.groups.set(kind, values);
    owned.push({ kind, key, id: item.id, createdAt: item.created_at });
  }
  return { schema: 1, active: false, unknownWrite: false, records: owned };
}
const captureRefusal = 'Cloud initial child closure failed; retain the owned environment.';
const settleRefusal = 'Cloud fixture child closure failed; retain the owned environment.';
const cleanupRefusal = 'Cloud cleanup child closure failed; retain the owned environment.';
const pageRefusal = 'Cloud destructive closure is unverified; retain the environment.';
const refused = (message, code) => ({ message, code });
async function settled(f) {
  const closure = await captureCloudClosure({ ...http(f), context }),
    owned = fixture(f);
  return {
    closure: await settleCloudClosure({ ...http(f), closure, fixture: owned }),
    fixture: owned,
  };
}

test('captures finite public defaults and fixture children', async () => {
  const f = boundary();
  const result = await settled(f);
  expect(result.closure.settled).toHaveLength(9);
  expect(JSON.stringify(result)).not.toContain(canary);
  await expect(verifyCloudClosure({ ...http(f), ...result })).resolves.toBeUndefined();
  expect(f.calls.every((call) => call.method === 'GET')).toBe(true);
  expect(f.calls.some((call) => call.path.startsWith('/v2/api-key'))).toBe(false);
  expect(f.projectCalls).toEqual(Array(3).fill({ method: 'GET', path: environmentKeyPath }));
});

test('an observed fresh environment captures, settles and verifies its defaults', async () => {
  const f = boundary(),
    defaults = freshEnvironment(f);
  const result = await settled(f);
  expect(result.closure.baseline).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'resources', key: '__role', id: defaults.role.id }),
      expect.objectContaining({
        kind: `resource:${defaults.tenant.id}:roles`,
        key: 'tenant-association',
        id: defaults.tenantRole.id,
      }),
      expect.objectContaining({ kind: 'api_keys', id: defaults.key.id }),
    ]),
  );
  expect(result.closure.baseline).toHaveLength(7);
  expect(JSON.stringify(result)).not.toContain(canary);
  await expect(verifyCloudClosure({ ...http(f), ...result })).resolves.toBeUndefined();
  expect(f.calls.some((call) => call.path.startsWith('/v2/api-key'))).toBe(false);
  expect(f.projectCalls).toEqual(Array(3).fill({ method: 'GET', path: environmentKeyPath }));
});
test.each([
  ['without __role', { role: false }],
  ['without a tenant-association role', { association: false }],
])('a fresh environment %s still captures', async (_name, options) => {
  const f = boundary();
  freshEnvironment(f, options);
  await expect(captureCloudClosure({ ...http(f), context })).resolves.toMatchObject({
    settled: null,
  });
});
test.each([
  [
    'an unknown built-in resource',
    'closure:defaults:resources',
    (f) => {
      f.groups.get('resources').push(row({ key: '__group', roles: {} }));
    },
  ],
  [
    'more resources than the bounded default set',
    'closure:limit:resources',
    (f) => {
      for (let index = 0; index < 6; index += 1)
        f.groups.get('resources').push(row({ key: `extra-${index}` }));
    },
  ],
  [
    'an unexpected environment role',
    'closure:defaults:roles',
    (f) => {
      f.groups.set('roles', [row({ key: 'owner' })]);
    },
  ],
  [
    'a repeated automatic role',
    'closure:defaults:roles',
    (f) => {
      f.groups.set('roles', [row({ key: 'admin' }), row({ key: 'admin' })]);
    },
  ],
  [
    'a non-default tenant',
    'closure:defaults:tenants',
    (f) => {
      f.groups.set('tenants', [row({ key: 'other' })]);
    },
  ],
  [
    'a custom user attribute',
    'closure:defaults:user_attributes',
    (f, defaults) => {
      f.groups.set('user_attributes', [
        row({ key: 'level', built_in: false, resource_id: defaults.user.id }),
      ]);
    },
  ],
  [
    'an unowned condition set',
    'closure:defaults:condition_sets',
    (f) => {
      f.groups.set('condition_sets', [row({ key: 'manual', autogenerated: false })]);
    },
  ],
  [
    'an OPAL scope',
    'closure:defaults:unexpected-rows:opal_scope',
    (f) => {
      f.groups.set('opal_scope', [row()]);
    },
  ],
  [
    'a group',
    'closure:defaults:unexpected-rows:groups',
    (f) => {
      f.groups.set('groups', [row({ key: 'team' })]);
    },
  ],
  [
    'a tenant-association role on __user',
    'closure:child:roles',
    (f, defaults) => {
      f.groups.set(`resource:${defaults.user.id}:roles`, [
        row({ key: 'tenant-association', resource_id: defaults.user.id }),
      ]);
    },
  ],
  [
    'a tenant-association role on __role',
    'closure:child:roles',
    (f, defaults) => {
      f.groups.set(`resource:${defaults.role.id}:roles`, [
        row({ key: 'tenant-association', resource_id: defaults.role.id }),
      ]);
    },
  ],
  [
    'another unmatched role on __tenant',
    'closure:child:roles',
    (f, defaults) => {
      f.groups
        .get(`resource:${defaults.tenant.id}:roles`)
        .push(row({ key: 'tenant-owner', resource_id: defaults.tenant.id }));
    },
  ],
  [
    'a renamed tenant role on __tenant',
    'closure:child:roles',
    (_f, defaults) => {
      defaults.tenantRole.key = 'tenant-associations';
    },
  ],
  [
    'an action on __role',
    'closure:child:actions',
    (f, defaults) => {
      f.groups.set(`resource:${defaults.role.id}:actions`, [
        row({ key: 'read', resource_id: defaults.role.id }),
      ]);
    },
  ],
  [
    'a custom attribute on __user',
    'closure:child:attributes',
    (f, defaults) => {
      f.groups.set(`resource:${defaults.user.id}:attributes`, [
        row({ key: 'level', resource_id: defaults.user.id }),
      ]);
    },
  ],
  [
    'a relation on __tenant',
    'closure:child:relations',
    (f, defaults) => {
      f.groups.set(`resource:${defaults.tenant.id}:relations`, [
        row({ key: 'parent', resource_id: defaults.tenant.id }),
      ]);
    },
  ],
  [
    'a child row that names another resource',
    'closure:child-parent:resource_roles',
    (f, defaults) => {
      defaults.tenantRole.resource_id = defaults.user.id;
    },
  ],
])('capture refuses %s', async (_name, code, change) => {
  const f = boundary(),
    defaults = freshEnvironment(f);
  await expect(captureCloudClosure({ ...http(f), context })).resolves.toMatchObject({
    settled: null,
  });
  change(f, defaults);
  await expect(captureCloudClosure({ ...http(f), context })).rejects.toMatchObject(
    refused(captureRefusal, code),
  );
});
test.each([
  ['email_configurations', { status: 403 }, 'closure:http:email_configuration:403'],
  ['opal_scope', { status: 500 }, 'closure:http:opal_scope:500'],
  ['pdp_configs', { status: 403 }, 'closure:http:pdp_configs:403'],
  ['elements_configs', { status: 404 }, 'closure:http:elements_configs:404'],
  ['groups', { body: [] }, 'closure:http:groups:invalid'],
  ['api_keys', { status: 401 }, 'closure:http:api_keys:401'],
])('an unexpected %s reply is classified by surface and status', async (kind, reply, code) => {
  const f = boundary();
  f.setFault({ kind, reply });
  await expect(captureCloudClosure({ ...http(f), context })).rejects.toMatchObject(
    refused(captureRefusal, code),
  );
});
test.each([
  ['opal_scope', 'closure:transport:opal_scope'],
  ['api_keys', 'closure:transport:api_keys'],
])('a %s transport failure is classified without its exception', async (kind, code) => {
  const f = boundary();
  f.setFault({ kind, throw: true });
  const error = await captureCloudClosure({ ...http(f), context }).catch((caught) => caught);
  expect(error).toMatchObject(refused(captureRefusal, code));
  expect(JSON.stringify({ ...error, message: error.message })).not.toContain(canary);
});
test.each([
  ['status', { reply: { status: 403 } }, 'closure:http:resource_roles:403'],
  ['transport', { throw: true }, 'closure:transport:resource_roles'],
])(
  'a resource child %s failure names the child, never the resource',
  async (_name, fault, code) => {
    const f = boundary(),
      defaults = freshEnvironment(f);
    f.setFault({ kind: `resource:${defaults.tenant.id}:roles`, ...fault });
    await expect(captureCloudClosure({ ...http(f), context })).rejects.toMatchObject(
      refused(captureRefusal, code),
    );
  },
);
test.each([
  ['an invalid context', { ...context, environment: 'not-an-id' }, 'closure:context'],
  ['a missing context', null, 'closure:capture:exception'],
])('capture classifies %s', async (_name, scope, code) => {
  const f = boundary();
  await expect(captureCloudClosure({ ...http(f), context: scope })).rejects.toMatchObject(
    refused(captureRefusal, code),
  );
  expect(f.calls).toEqual([]);
});
test('more records than the bounded closure limit refuses capture', async () => {
  const f = boundary();
  f.groups.set(
    'users',
    Array.from({ length: 100 }, (_value, index) => row({ key: `user-${index}` })),
  );
  f.groups.set(
    'tenants',
    Array.from({ length: 29 }, (_value, index) => row({ key: `tenant-${index}` })),
  );
  await expect(captureCloudClosure({ ...http(f), context })).rejects.toMatchObject(
    refused(captureRefusal, 'closure:limit:records'),
  );
});
test.each([
  ['settling', settleRefusal, 'closure:settle:changed:resource_roles'],
  ['cleanup', cleanupRefusal, 'closure:verify:changed:resource_roles'],
])('a changed tenant-association role is detected while %s', async (phase, refusal, code) => {
  const f = boundary(),
    defaults = freshEnvironment(f);
  const closure = await captureCloudClosure({ ...http(f), context });
  const owned = phase === 'settling' ? fixture(f) : null;
  const attempt = () =>
    owned
      ? settleCloudClosure({ ...http(f), closure, fixture: owned })
      : verifyCloudClosure({ ...http(f), closure, fixture: null });
  await attempt();
  defaults.tenantRole.permissions = ['__tenant:delete'];
  await expect(attempt()).rejects.toMatchObject(refused(refusal, code));
});

test.each(['resources', 'roles', 'tenants', 'users', 'role_assignments', 'api_keys'])(
  'a replaced captured %s cannot authorize destructive closure',
  async (kind) => {
    const f = boundary(),
      result = await settled(f);
    f.groups.get(kind)[0].created_at = '2026-10-08T13:00:00Z';
    await expect(verifyCloudClosure({ ...http(f), ...result })).rejects.toMatchObject(
      refused(cleanupRefusal, `closure:verify:changed:${kind}`),
    );
  },
);
test.each([
  'resources',
  'roles',
  'tenants',
  'users',
  'groups',
  'user_invites',
  'resource_instances',
  'relationship_tuples',
  'proxy_configs',
  'pdp_configs',
  'elements_configs',
  'email_templates',
  'condition_sets',
  'condition_set_rules',
  'user_attributes',
  'role_assignments',
])('an unreserved %s child is never admitted during cleanup', async (kind) => {
  const f = boundary(),
    result = await settled(f);
  const values = f.groups.get(kind) ?? [];
  values.push(row({ key: 'unreserved' }));
  f.groups.set(kind, values);
  await expect(verifyCloudClosure({ ...http(f), ...result })).rejects.toMatchObject(
    refused(cleanupRefusal, `closure:verify:changed:${kind}`),
  );
});
test.each(['email_configuration', 'opal_scope'])(
  'a new %s singleton prevents cascade',
  async (kind) => {
    const f = boundary(),
      result = await settled(f);
    f.groups.set(kind, [row()]);
    await expect(verifyCloudClosure({ ...http(f), ...result })).rejects.toMatchObject(
      refused(cleanupRefusal, `closure:verify:changed:${kind}`),
    );
  },
);
test.each([
  ['scope', 'closure:scope:resources'],
  ['missing', 'closure:verify:changed:resources'],
  ['nested', 'closure:verify:changed:resources'],
  ['error', 'closure:transport:resources'],
  ['partial', 'closure:pages:incomplete:resources'],
  ['repeat', 'closure:pages:duplicate:resources'],
])('%s read uncertainty refuses destructive credit', async (fault, code) => {
  const f = boundary(),
    result = await settled(f);
  const resource = f.groups.get('resources')[0];
  if (fault === 'scope') resource.project_id = 'f'.repeat(32);
  if (fault === 'missing') f.groups.set('resources', []);
  if (fault === 'nested') resource.actions = { foreign: { id: 'e'.repeat(32) } };
  if (fault === 'error') f.setFault({ kind: 'resources', throw: true });
  if (fault === 'partial')
    f.setFault({ kind: 'resources', reply: { status: 200, body: { data: [], total_count: 1 } } });
  if (fault === 'repeat')
    f.setFault({ kind: 'resources', reply: { status: 200, body: Array(100).fill(resource) } });
  await expect(verifyCloudClosure({ ...http(f), ...result })).rejects.toMatchObject(
    refused(cleanupRefusal, code),
  );
});

test.each(['actions', 'attributes', 'roles', 'relations', 'action_groups'])(
  'a resource child %s outside the captured closure refuses cleanup',
  async (child) => {
    const f = boundary(),
      result = await settled(f),
      resource = f.groups.get('resources')[0];
    f.groups.set(`resource:${resource.id}:${child}`, [
      row({ resource_id: resource.id, key: 'foreign' }),
    ]);
    await expect(verifyCloudClosure({ ...http(f), ...result })).rejects.toMatchObject(
      refused(cleanupRefusal, `closure:verify:changed:resource_${child}`),
    );
  },
);

test('the environment key is read only through the project boundary', async () => {
  const f = boundary(),
    key = f.groups.get('api_keys')[0];
  const closure = await captureCloudClosure({ ...http(f), context });
  expect(closure.baseline).toEqual([
    {
      kind: 'api_keys',
      id: key.id,
      key: null,
      createdAt: key.created_at,
      digest: expect.any(String),
    },
    expect.objectContaining({ kind: 'pdp_configs' }),
  ]);
  expect(JSON.stringify(closure)).not.toContain(canary);
  expect(f.projectCalls).toEqual([{ method: 'GET', path: environmentKeyPath }]);
  expect(f.calls.some((call) => call.path.startsWith('/v2/api-key'))).toBe(false);
  await expect(verifyCloudClosure({ ...http(f), closure, fixture: null })).resolves.toBeUndefined();
});
test('environment key usage metadata may change while its identity stays exact', async () => {
  const f = boundary(),
    result = await settled(f),
    key = f.groups.get('api_keys')[0];
  Object.assign(key, {
    last_used_at: '2026-10-08T14:00:00Z',
    env: { id: context.environment, updated_at: '2026-10-08T14:00:00Z' },
    project: { id: context.project, updated_at: '2026-10-08T14:00:00Z' },
  });
  await expect(verifyCloudClosure({ ...http(f), ...result })).resolves.toBeUndefined();
  key.owner_type = 'member';
  await expect(verifyCloudClosure({ ...http(f), ...result })).rejects.toMatchObject(
    refused(cleanupRefusal, 'closure:verify:changed:api_keys'),
  );
});
test.each([
  [
    'birth',
    'closure:created-at:api_keys',
    (key) => {
      key.created_at = '2026-10-08T11:00:00Z';
    },
  ],
  [
    'organization',
    'closure:scope:api_keys',
    (key) => {
      key.organization_id = 'e'.repeat(32);
    },
  ],
  [
    'environment',
    'closure:scope:api_keys',
    (key) => {
      key.environment_id = 'e'.repeat(32);
    },
  ],
  [
    'owner',
    'closure:api-key:owner',
    (key) => {
      key.owner_type = 'member';
    },
  ],
  [
    'object',
    'closure:api-key:object',
    (key) => {
      key.object_type = 'project';
    },
  ],
  [
    'credential',
    'closure:api-key:secret-mismatch',
    (key) => {
      key.secret = 'different';
    },
  ],
  [
    'unsigned',
    'closure:api-key:secret',
    (key, pdp) => {
      key.secret = null;
      pdp.client_secret = null;
    },
  ],
  [
    'empty credential',
    'closure:api-key:secret',
    (key, pdp) => {
      key.secret = '';
      pdp.client_secret = '';
    },
  ],
  [
    'absent key',
    'closure:http:api_keys:404',
    (_key, _pdp, f) => {
      f.groups.set('api_keys', []);
    },
  ],
  [
    'absent key and PDP',
    'closure:http:api_keys:404',
    (_key, _pdp, f) => {
      f.groups.set('api_keys', []);
      f.groups.set('pdp_configs', []);
    },
  ],
  [
    'forbidden key',
    'closure:http:api_keys:403',
    (_key, _pdp, f) => {
      f.setFault({ kind: 'api_keys', reply: { status: 403, body: { detail: canary } } });
    },
  ],
  [
    'unconfigured PDP',
    'closure:api-key:count',
    (_key, _pdp, f) => {
      f.groups.set('pdp_configs', []);
    },
  ],
  [
    'second PDP',
    'closure:defaults:pdp_configs',
    (_key, _pdp, f) => {
      f.groups.get('pdp_configs').push(row({ client_secret: 'other' }));
    },
  ],
  [
    'default',
    'closure:defaults:resources',
    (_key, _pdp, f) => {
      f.groups.set('resources', [row({ key: 'foreign' })]);
    },
  ],
  [
    'project',
    'closure:scope:tenants',
    (_key, _pdp, f) => {
      f.groups.set('tenants', [row({ key: 'default', project_id: 'f'.repeat(32) })]);
    },
  ],
])('unproven initial %s defaults never acquire a closure', async (_name, code, change) => {
  const f = boundary();
  await expect(captureCloudClosure({ ...http(f), context })).resolves.toMatchObject({
    settled: null,
  });
  change(f.groups.get('api_keys')[0], f.groups.get('pdp_configs')[0], f);
  await expect(captureCloudClosure({ ...http(f), context })).rejects.toMatchObject(
    refused(captureRefusal, code),
  );
});
test.each([
  ['missing', undefined],
  ['not a function', environmentKeyPath],
])('a %s project request refuses every phase before any HTTP', async (_name, projectRequest) => {
  const f = boundary(),
    result = await settled(f),
    before = f.calls.length;
  await expect(
    captureCloudClosure({ request: f.request, projectRequest, context }),
  ).rejects.toMatchObject(refused(captureRefusal, 'closure:project-request'));
  await expect(
    settleCloudClosure({
      request: f.request,
      projectRequest,
      closure: { ...result.closure, settled: null },
      fixture: result.fixture,
    }),
  ).rejects.toMatchObject(refused(settleRefusal, 'closure:project-request'));
  await expect(
    verifyCloudClosure({ request: f.request, projectRequest, ...result }),
  ).rejects.toMatchObject(refused(cleanupRefusal, 'closure:project-request'));
  expect(f.calls).toHaveLength(before);
});

test('settling refuses to adopt a delayed child addition', async () => {
  const f = boundary(),
    closure = await captureCloudClosure({ ...http(f), context }),
    owned = fixture(f);
  f.groups.get('users').push(row({ key: 'late-server-commit' }));
  await expect(settleCloudClosure({ ...http(f), closure, fixture: owned })).rejects.toMatchObject(
    refused(settleRefusal, 'closure:settle:addition:users'),
  );
  expect(closure.settled).toBeNull();
});
test.each([
  [
    'captured default',
    'closure:settle:missing-default',
    (f) => {
      f.groups.set(
        'tenants',
        f.groups.get('tenants').filter((entry) => entry.key !== 'default'),
      );
    },
  ],
  [
    'captured fixture',
    'closure:settle:missing-fixture',
    (f) => {
      f.groups.get('users').pop();
    },
  ],
])('settling refuses a %s row that disappeared after capture', async (_name, code, remove) => {
  const f = boundary();
  f.groups.set('tenants', [row({ key: 'default' })]);
  const closure = await captureCloudClosure({ ...http(f), context }),
    owned = fixture(f);
  await expect(settleCloudClosure({ ...http(f), closure, fixture: owned })).resolves.toMatchObject({
    settled: expect.any(Array),
  });
  remove(f);
  await expect(settleCloudClosure({ ...http(f), closure, fixture: owned })).rejects.toMatchObject(
    refused(settleRefusal, code),
  );
});
test.each([
  [
    'an uncertain write',
    'closure:settle:fixture-state',
    (owned) => ({ ...owned, unknownWrite: true }),
  ],
  ['an active writer', 'closure:settle:fixture-state', (owned) => ({ ...owned, active: true })],
  [
    'a renamed captured record',
    'closure:settle:fixture-key:users',
    (owned) => ({
      ...owned,
      records: owned.records.map((entry) =>
        entry.key === 'denied' ? { ...entry, key: 'renamed' } : entry,
      ),
    }),
  ],
  [
    'a different captured birth',
    'closure:settle:fixture-created-at:users',
    (owned) => ({
      ...owned,
      records: owned.records.map((entry) =>
        entry.key === 'denied' ? { ...entry, createdAt: '2026-10-08T13:00:00Z' } : entry,
      ),
    }),
  ],
  [
    'a malformed captured record',
    'closure:settle:exception',
    (owned) => ({ ...owned, records: [...owned.records.slice(1), null] }),
  ],
])('settling refuses a fixture state with %s', async (_name, code, change) => {
  const f = boundary(),
    closure = await captureCloudClosure({ ...http(f), context }),
    owned = fixture(f);
  await expect(settleCloudClosure({ ...http(f), closure, fixture: owned })).resolves.toMatchObject({
    settled: expect.any(Array),
  });
  await expect(
    settleCloudClosure({ ...http(f), closure, fixture: change(owned) }),
  ).rejects.toMatchObject(refused(settleRefusal, code));
});
test.each([
  ['a malformed closure envelope', 'closure:state', (closure) => ({ ...closure, schema: 2 })],
  [
    'a malformed settled inventory',
    'closure:state',
    (closure) => ({ ...closure, settled: 'invalid' }),
  ],
  [
    'a malformed closure record',
    'closure:state:record',
    (closure) => ({ ...closure, baseline: [{ ...closure.baseline[0], digest: 'short' }] }),
  ],
])('settling and cleanup refuse %s before any HTTP', async (_name, code, change) => {
  const f = boundary(),
    closure = await captureCloudClosure({ ...http(f), context }),
    owned = fixture(f),
    before = f.calls.length;
  await expect(
    settleCloudClosure({ ...http(f), closure: change(closure), fixture: owned }),
  ).rejects.toMatchObject(refused(settleRefusal, code));
  await expect(
    verifyCloudClosure({ ...http(f), closure: change(closure), fixture: null }),
  ).rejects.toMatchObject(refused(cleanupRefusal, code));
  expect(f.calls).toHaveLength(before);
});
test.each([
  [
    'an unrelated mutation',
    'closure:settle:builtin-changed',
    (builtin) => {
      builtin.attributes.safe = 'foreign';
    },
  ],
  [
    'an unscoped role effect',
    'closure:scope:role_effect',
    (builtin, role) => {
      delete builtin.roles[role.key].environment_id;
    },
  ],
])(
  '%s of a builtin parent is rejected while settling role effects',
  async (_name, code, change) => {
    const f = boundary(),
      builtin = row({ key: '__tenant', roles: {}, attributes: { safe: 'initial' } });
    f.groups.set('resources', [builtin]);
    const closure = await captureCloudClosure({ ...http(f), context });
    const owned = fixture(f),
      role = owned.records.find((entry) => entry.kind === 'roles');
    builtin.roles[role.key] = {
      id: role.id,
      key: role.key,
      created_at: role.createdAt,
      organization_id: context.organization,
      project_id: context.project,
      environment_id: context.environment,
    };
    change(builtin, role);
    await expect(settleCloudClosure({ ...http(f), closure, fixture: owned })).rejects.toMatchObject(
      refused(settleRefusal, code),
    );
  },
);
test('only the captured role effect can change a builtin parent while settling', async () => {
  const f = boundary(),
    builtin = row({ key: '__tenant', roles: {} });
  f.groups.set('resources', [builtin]);
  const closure = await captureCloudClosure({ ...http(f), context });
  const owned = fixture(f),
    role = owned.records.find((entry) => entry.kind === 'roles');
  const effect = {
    id: role.id,
    key: role.key,
    created_at: role.createdAt,
    organization_id: context.organization,
    project_id: context.project,
    environment_id: context.environment,
    resource_id: builtin.id,
  };
  builtin.roles[role.key] = effect;
  f.groups.set(`resource:${builtin.id}:roles`, [effect]);
  const final = await settleCloudClosure({ ...http(f), closure, fixture: owned });
  await expect(
    verifyCloudClosure({ ...http(f), closure: final, fixture: owned }),
  ).resolves.toBeUndefined();
});
test.each([
  [
    'an unsettled closure',
    'closure:verify:unsettled',
    (result) => ({ ...result, closure: { ...result.closure, settled: null } }),
  ],
  [
    'an unsupported captured record',
    'closure:verify:fixture-kind',
    (result) => ({
      ...result,
      fixture: {
        ...result.fixture,
        records: [...result.fixture.records, { ...result.fixture.records[0], kind: 'groups' }],
      },
    }),
  ],
  [
    'a grant without its captured user',
    'closure:verify:grant',
    (result) => ({
      ...result,
      fixture: {
        ...result.fixture,
        records: result.fixture.records.map((entry) =>
          entry.kind === 'role_assignments' ? { ...entry, key: 'nobody' } : entry,
        ),
      },
    }),
  ],
  [
    'unreadable captured records',
    'closure:verify:exception',
    (result) => ({ ...result, fixture: { ...result.fixture, records: null } }),
  ],
])('cleanup refuses %s', async (_name, code, change) => {
  const f = boundary(),
    result = await settled(f);
  await expect(verifyCloudClosure({ ...http(f), ...change(result) })).rejects.toMatchObject(
    refused(cleanupRefusal, code),
  );
});

test.each([
  [null, 'closure:pages:shape:tenants'],
  [{}, 'closure:pages:shape:tenants'],
  [
    { data: Array.from({ length: 101 }, () => row()), total_count: 101 },
    'closure:pages:shape:tenants',
  ],
  [{ data: [], total_count: 1 }, 'closure:pages:incomplete:tenants'],
  [{ data: [], total_count: 0, page_count: -1 }, 'closure:pages:page-count:tenants'],
  [{ data: [], total_count: 0, page_count: 0.5 }, 'closure:pages:page-count:tenants'],
  [{ data: [], total_count: 0, page_count: '0' }, 'closure:pages:page-count:tenants'],
  [{ data: [{ id: 'not-an-id' }], total_count: 1 }, 'closure:pages:row:tenants'],
])('malformed published page shape %j refuses', async (body, code) => {
  await expect(
    cloudClosurePages({
      request: async () => ({ status: 200, body }),
      path: '/rows',
      kind: 'tenants',
    }),
  ).rejects.toMatchObject(refused(pageRefusal, code));
});
test.each([
  ['three rows with page_count 3', 3, [3]],
  ['no rows with page_count 0', 0, [0]],
  ['101 rows with page_count 101', 101, [101, 101]],
])('page_count is not a completeness signal: %s', async (_name, total, pageCounts) => {
  const rows = Array.from({ length: total }, () => row()),
    paths = [];
  const received = await cloudClosurePages({
    path: '/rows?include_total_count=true',
    kind: 'tenants',
    request: async ({ path }) => {
      const page = paths.push(path);
      return {
        status: 200,
        body: {
          data: rows.slice((page - 1) * 100, page * 100),
          total_count: total,
          page_count: pageCounts[page - 1],
        },
      };
    },
  });
  expect(received).toEqual(rows);
  expect(paths).toEqual(
    pageCounts.map(
      (_count, index) => `/rows?include_total_count=true&page=${index + 1}&per_page=100`,
    ),
  );
});
test.each([
  [
    'a total_count that changes between pages',
    'closure:pages:total-changed:tenants',
    (broken) => {
      const rows = Array.from({ length: 101 }, () => row());
      return [
        { data: rows.slice(0, 100), total_count: broken ? 150 : 101 },
        { data: rows.slice(100), total_count: 101 },
      ];
    },
  ],
  [
    'a total_count that changes between pages with page_count equal to it',
    'closure:pages:total-changed:tenants',
    (broken) => {
      const rows = Array.from({ length: 101 }, () => row());
      return [
        { data: rows.slice(0, 100), total_count: broken ? 102 : 101, page_count: 101 },
        { data: rows.slice(100), total_count: 101, page_count: 101 },
      ];
    },
  ],
  [
    'an envelope without total_count',
    'closure:pages:total-invalid:tenants',
    (broken) => {
      const data = [row(), row()];
      return [broken ? { data, page_count: null } : { data, total_count: 2, page_count: null }];
    },
  ],
  [
    'a bare array after an envelope page',
    'closure:pages:shape:tenants',
    (broken) => {
      const rows = Array.from({ length: 101 }, () => row());
      return [
        { data: rows.slice(0, 100), total_count: 101 },
        broken ? rows.slice(100) : { data: rows.slice(100), total_count: 101 },
      ];
    },
  ],
  [
    'a repeated ID within one short page',
    'closure:pages:duplicate:tenants',
    (broken) => {
      const first = row();
      return [[first, broken ? { ...first } : row()]];
    },
  ],
  [
    'more rows on a full page than its total_count',
    'closure:pages:incomplete:tenants',
    (broken) => {
      const rows = Array.from({ length: 100 }, () => row());
      return [{ data: rows, total_count: broken ? 50 : 100 }];
    },
  ],
  [
    'more rows than the bounded closure limit',
    'closure:pages:limit:tenants',
    (broken) => {
      const rows = Array.from({ length: broken ? 129 : 128 }, () => row());
      return [
        { data: rows.slice(0, 100), total_count: rows.length },
        { data: rows.slice(100), total_count: rows.length },
      ];
    },
  ],
])('the page reader refuses %s', async (_name, code, pages) => {
  const replies = (bodies) => {
    let index = 0;
    return async () => ({ status: 200, body: bodies[index++] });
  };
  await expect(
    cloudClosurePages({ path: '/rows', kind: 'tenants', request: replies(pages(false)) }),
  ).resolves.not.toHaveLength(0);
  await expect(
    cloudClosurePages({ path: '/rows', kind: 'tenants', request: replies(pages(true)) }),
  ).rejects.toMatchObject(refused(pageRefusal, code));
});
test('complete envelope pagination accepts nullable page_count with exact totals', async () => {
  const rows = Array.from({ length: 101 }, () => row());
  let requests = 0;
  const received = await cloudClosurePages({
    path: '/rows',
    kind: 'tenants',
    request: async () => {
      requests += 1;
      return {
        status: 200,
        body: {
          data: requests === 1 ? rows.slice(0, 100) : rows.slice(100),
          total_count: 101,
          page_count: null,
        },
      };
    },
  });
  expect(received).toHaveLength(101);
  expect(requests).toBe(2);
});

test.each([
  ['missing', 'closure:http:detail_resources:404'],
  ['birth', 'closure:verify:detail:resources'],
  ['scope', 'closure:scope:detail_resources'],
  ['key', 'closure:verify:detail:resources'],
  ['definition', 'closure:verify:detail:resources'],
])(
  'exact captured child detail %s mismatch refuses even if the list snapshot matches',
  async (fault, code) => {
    const f = boundary(),
      result = await settled(f),
      resource = f.groups.get('resources')[0];
    const detail = structuredClone(resource);
    if (fault === 'birth') detail.created_at = '2026-10-08T13:00:00Z';
    if (fault === 'scope') detail.project_id = 'f'.repeat(32);
    if (fault === 'key') detail.key = 'foreign';
    if (fault === 'definition') detail.attributes = { foreign: 'secret-canary' };
    f.overrides.set(resource.id, fault === 'missing' ? undefined : detail);
    await expect(verifyCloudClosure({ ...http(f), ...result })).rejects.toMatchObject(
      refused(cleanupRefusal, code),
    );
  },
);

test.each([
  'updated_at',
  'last_used_at',
  'last_action_at',
  '__proto__',
  'constructor',
  'prototype',
])('nested arbitrary user policy %s values remain exact', async (key) => {
  const f = boundary(),
    result = await settled(f),
    resource = f.groups.get('resources')[0];
  resource.type_attributes = JSON.parse('{"nested":{"' + key + '":"changed"}}');
  await expect(verifyCloudClosure({ ...http(f), ...result })).rejects.toMatchObject(
    refused(cleanupRefusal, 'closure:verify:changed:resources'),
  );
});
test.each(['last_used_at', 'last_action_at'])(
  'an undocumented resource top-level %s field remains exact',
  async (key) => {
    const f = boundary(),
      result = await settled(f);
    f.groups.get('resources')[0][key] = 'changed';
    await expect(verifyCloudClosure({ ...http(f), ...result })).rejects.toMatchObject(
      refused(cleanupRefusal, 'closure:verify:changed:resources'),
    );
  },
);
