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
    details = new Map(),
    overrides = new Map();
  let fault;
  const request = async (input) => {
    calls.push(input);
    const url = new URL(input.path, 'https://api.permit.io');
    const pieces = url.pathname.split('/');
    let kind = pieces[5];
    if (url.pathname === '/v2/api-key') kind = 'api_keys';
    else if (url.pathname.startsWith('/v2/api-key/')) {
      const body = details.get(pieces[3]);
      return { status: body ? 200 : 404, body };
    } else if (url.pathname.includes('/resources/') && pieces.length === 8)
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
      body: kind === 'api_keys' ? { data, total_count: rows.length, page_count: null } : data,
    };
  };
  return {
    groups,
    calls,
    details,
    overrides,
    request,
    setFault: (value) => {
      fault = value;
    },
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
const pageRefusal = 'Cloud destructive closure is unverified; retain the environment.';
async function settled(f) {
  const closure = await captureCloudClosure({ request: f.request, context }),
    owned = fixture(f);
  return {
    closure: await settleCloudClosure({ request: f.request, closure, fixture: owned }),
    fixture: owned,
  };
}

test('captures finite public defaults and fixture children', async () => {
  const f = boundary();
  const result = await settled(f);
  expect(result.closure.settled).toHaveLength(7);
  expect(JSON.stringify(result)).not.toContain(canary);
  await expect(verifyCloudClosure({ request: f.request, ...result })).resolves.toBeUndefined();
  expect(f.calls.every((call) => call.method === 'GET')).toBe(true);
});

test.each(['resources', 'roles', 'tenants', 'users', 'role_assignments'])(
  'a replaced captured %s cannot authorize destructive closure',
  async (kind) => {
    const f = boundary(),
      result = await settled(f);
    f.groups.get(kind)[0].created_at = '2026-10-08T13:00:00Z';
    await expect(verifyCloudClosure({ request: f.request, ...result })).rejects.toThrow('retain');
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
  await expect(verifyCloudClosure({ request: f.request, ...result })).rejects.toThrow('retain');
});
test.each(['email_configuration', 'opal_scope'])(
  'a new %s singleton prevents cascade',
  async (kind) => {
    const f = boundary(),
      result = await settled(f);
    f.groups.set(kind, [row()]);
    await expect(verifyCloudClosure({ request: f.request, ...result })).rejects.toThrow('retain');
  },
);
test.each(['scope', 'missing', 'nested', 'error', 'partial', 'repeat'])(
  '%s read uncertainty refuses destructive credit',
  async (fault) => {
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
    await expect(verifyCloudClosure({ request: f.request, ...result })).rejects.toThrow('retain');
  },
);

test.each(['actions', 'attributes', 'roles', 'relations', 'action_groups'])(
  'a resource child %s outside the captured closure refuses cleanup',
  async (child) => {
    const f = boundary(),
      result = await settled(f),
      resource = f.groups.get('resources')[0];
    f.groups.set(`resource:${resource.id}:${child}`, [
      row({ resource_id: resource.id, key: 'foreign' }),
    ]);
    await expect(verifyCloudClosure({ request: f.request, ...result })).rejects.toThrow('retain');
  },
);

test('defaults bind immutable IDs and nullable API-key snapshots', async () => {
  const f = boundary(),
    user = row({ key: '__user', roles: {}, actions: {} }),
    tenant = row({ key: '__tenant', roles: {} });
  f.groups.set('resources', [user, tenant]);
  f.groups.set('tenants', [row({ key: 'default' })]);
  const pdp = row({ client_secret: canary });
  delete pdp.created_at;
  f.groups.set('pdp_configs', [pdp]);
  const key = row({ owner_type: 'pdp_config', object_type: 'env', secret: null });
  f.groups.set('api_keys', [key]);
  f.details.set(key.id, { ...key, secret: canary });
  const closure = await captureCloudClosure({ request: f.request, context });
  expect(key.secret).toBeNull();
  expect(closure.baseline).toHaveLength(5);
  expect(JSON.stringify(closure)).not.toContain(canary);
  expect(f.calls.some((call) => call.path === `/v2/api-key/${key.id}`)).toBe(true);
  await expect(
    verifyCloudClosure({ request: f.request, closure, fixture: null }),
  ).resolves.toBeUndefined();
});
test.each(['birth', 'scope', 'owner', 'credential', 'detail', 'default', 'project'])(
  'unproven initial %s defaults never acquire a closure',
  async (fault) => {
    const f = boundary(),
      pdp = row({ client_secret: canary });
    delete pdp.created_at;
    f.groups.set('pdp_configs', [pdp]);
    const key = row({ owner_type: 'pdp_config', object_type: 'env', secret: null });
    f.groups.set('api_keys', [key]);
    const detail = { ...key, secret: canary };
    f.details.set(key.id, detail);
    if (fault === 'birth') detail.created_at = '2026-10-08T13:00:00Z';
    if (fault === 'scope') detail.environment_id = 'e'.repeat(32);
    if (fault === 'owner') key.owner_type = 'member';
    if (fault === 'credential') detail.secret = 'different';
    if (fault === 'detail') f.details.clear();
    if (fault === 'default') f.groups.set('resources', [row({ key: 'foreign' })]);
    if (fault === 'project')
      f.groups.set('tenants', [row({ key: 'default', project_id: 'f'.repeat(32) })]);
    await expect(captureCloudClosure({ request: f.request, context })).rejects.toThrow(
      captureRefusal,
    );
  },
);

test('settling refuses to adopt a delayed child addition', async () => {
  const f = boundary(),
    closure = await captureCloudClosure({ request: f.request, context }),
    owned = fixture(f);
  f.groups.get('users').push(row({ key: 'late-server-commit' }));
  await expect(settleCloudClosure({ request: f.request, closure, fixture: owned })).rejects.toThrow(
    'retain',
  );
  expect(closure.settled).toBeNull();
});
test.each([
  [
    'captured default',
    (f) => {
      f.groups.set(
        'tenants',
        f.groups.get('tenants').filter((entry) => entry.key !== 'default'),
      );
    },
  ],
  [
    'captured fixture',
    (f) => {
      f.groups.get('users').pop();
    },
  ],
])('settling refuses a %s row that disappeared after capture', async (_name, remove) => {
  const f = boundary();
  f.groups.set('tenants', [row({ key: 'default' })]);
  const closure = await captureCloudClosure({ request: f.request, context }),
    owned = fixture(f);
  await expect(
    settleCloudClosure({ request: f.request, closure, fixture: owned }),
  ).resolves.toMatchObject({ settled: expect.any(Array) });
  remove(f);
  await expect(settleCloudClosure({ request: f.request, closure, fixture: owned })).rejects.toThrow(
    settleRefusal,
  );
});
test.each([
  ['an uncertain write', { unknownWrite: true }],
  ['an active writer', { active: true }],
])('settling refuses a fixture state with %s', async (_name, change) => {
  const f = boundary(),
    closure = await captureCloudClosure({ request: f.request, context }),
    owned = fixture(f);
  await expect(
    settleCloudClosure({ request: f.request, closure, fixture: owned }),
  ).resolves.toMatchObject({ settled: expect.any(Array) });
  await expect(
    settleCloudClosure({ request: f.request, closure, fixture: { ...owned, ...change } }),
  ).rejects.toThrow(settleRefusal);
});
test('unrelated mutations of builtin parent are rejected while settling role effects', async () => {
  const f = boundary(),
    builtin = row({ key: '__tenant', roles: {}, attributes: { safe: 'initial' } });
  f.groups.set('resources', [builtin]);
  const closure = await captureCloudClosure({ request: f.request, context });
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
  builtin.attributes.safe = 'foreign';
  await expect(settleCloudClosure({ request: f.request, closure, fixture: owned })).rejects.toThrow(
    'retain',
  );
});
test('only the captured role effect can change a builtin parent while settling', async () => {
  const f = boundary(),
    builtin = row({ key: '__tenant', roles: {} });
  f.groups.set('resources', [builtin]);
  const closure = await captureCloudClosure({ request: f.request, context });
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
  const final = await settleCloudClosure({ request: f.request, closure, fixture: owned });
  await expect(
    verifyCloudClosure({ request: f.request, closure: final, fixture: owned }),
  ).resolves.toBeUndefined();
});

test.each([null, {}, { data: [], total_count: 1 }, { data: [], total_count: 0, page_count: 2 }])(
  'malformed published page shape %j refuses',
  async (body) => {
    await expect(
      cloudClosurePages({ request: async () => ({ status: 200, body }), path: '/rows' }),
    ).rejects.toThrow(pageRefusal);
  },
);
test.each([
  [
    'a total_count that changes between pages',
    false,
    (broken) => {
      const rows = Array.from({ length: 101 }, () => row());
      return [
        { data: rows.slice(0, 100), total_count: broken ? 150 : 101 },
        { data: rows.slice(100), total_count: 101 },
      ];
    },
  ],
  [
    'an envelope without total_count',
    false,
    (broken) => {
      const data = [row(), row()];
      return [broken ? { data, page_count: null } : { data, total_count: 2, page_count: null }];
    },
  ],
  [
    'a bare array on an envelope route',
    true,
    (broken) => {
      const data = [row(), row()];
      return [broken ? data : { data, total_count: 2, page_count: null }];
    },
  ],
  [
    'a repeated ID within one short page',
    false,
    (broken) => {
      const first = row();
      return [[first, broken ? { ...first } : row()]];
    },
  ],
])('the page reader refuses %s', async (_name, envelope, pages) => {
  const replies = (bodies) => {
    let index = 0;
    return async () => ({ status: 200, body: bodies[index++] });
  };
  await expect(
    cloudClosurePages({ path: '/rows', envelope, request: replies(pages(false)) }),
  ).resolves.not.toHaveLength(0);
  await expect(
    cloudClosurePages({ path: '/rows', envelope, request: replies(pages(true)) }),
  ).rejects.toThrow(pageRefusal);
});
test('complete envelope pagination accepts nullable page_count with exact totals', async () => {
  const rows = Array.from({ length: 101 }, () => row());
  let requests = 0;
  const received = await cloudClosurePages({
    path: '/rows',
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

test.each(['missing', 'birth', 'scope', 'key', 'definition'])(
  'exact captured child detail %s mismatch refuses even if the list snapshot matches',
  async (fault) => {
    const f = boundary(),
      result = await settled(f),
      resource = f.groups.get('resources')[0];
    const detail = structuredClone(resource);
    if (fault === 'birth') detail.created_at = '2026-10-08T13:00:00Z';
    if (fault === 'scope') detail.project_id = 'f'.repeat(32);
    if (fault === 'key') detail.key = 'foreign';
    if (fault === 'definition') detail.attributes = { foreign: 'secret-canary' };
    f.overrides.set(resource.id, fault === 'missing' ? undefined : detail);
    await expect(verifyCloudClosure({ request: f.request, ...result })).rejects.toThrow('retain');
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
  await expect(verifyCloudClosure({ request: f.request, ...result })).rejects.toThrow('retain');
});
test.each(['last_used_at', 'last_action_at'])(
  'an undocumented resource top-level %s field remains exact',
  async (key) => {
    const f = boundary(),
      result = await settled(f);
    f.groups.get('resources')[0][key] = 'changed';
    await expect(verifyCloudClosure({ request: f.request, ...result })).rejects.toThrow('retain');
  },
);
