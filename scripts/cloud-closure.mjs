import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const idPattern = /^[a-f0-9-]{32,36}$/u;
const automaticRoles = ['admin', 'editor', 'viewer'];
const builtins = ['__role', '__user', '__tenant'];
const limit = 128;
const unverified = 'Cloud destructive closure is unverified; retain the environment.';
const inventories = [
  ['resources', 'schema', 'resources?include_built_in=true&include_total_count=true'],
  ['roles', 'schema', 'roles?include_total_count=true'],
  ['user_attributes', 'schema', 'users/attributes'],
  ['condition_sets', 'schema', 'condition_sets?include_total_count=true'],
  ['condition_set_rules', 'facts', 'set_rules'],
  ['users', 'facts', 'users'],
  ['tenants', 'facts', 'tenants?include_total_count=true'],
  ['groups', 'schema', 'groups'],
  ['user_invites', 'facts', 'user_invites'],
  ['resource_instances', 'facts', 'resource_instances?detailed=true&include_total_count=true'],
  ['relationship_tuples', 'facts', 'relationship_tuples?detailed=true&include_total_count=true'],
  ['role_assignments', 'facts', 'role_assignments?include_total_count=true'],
  ['proxy_configs', 'facts', 'proxy_configs'],
  ['pdp_configs', 'pdps', 'configs'],
  ['elements_configs', 'elements', 'config'],
  ['email_templates', 'facts', 'email_templates/'],
];
const singletons = ['email_configuration', 'opal_scope', 'api_keys'];
const children = ['actions', 'attributes', 'roles', 'relations', 'action_groups'];
const fixtureKinds = ['resources', 'roles', 'tenants', 'users'];

function refusal(message, code) {
  return Object.assign(new Error(message), { code });
}
function requireValid(value, code) {
  if (!value) throw refusal(unverified, code);
}
function diagnosticCode(error, fallback) {
  return typeof error?.code === 'string' ? error.code : fallback;
}
/** Maps a record kind to a static diagnostic label; resource child kinds drop the resource ID. */
function surface(kind) {
  if (inventories.some(([name]) => name === kind) || singletons.includes(kind)) return kind;
  const [scope, id, child] = typeof kind === 'string' ? kind.split(':') : [];
  return scope === 'resource' && idPattern.test(id ?? '') && children.includes(child)
    ? `resource_${child}`
    : 'unknown';
}
function httpStatus(reply) {
  return Number.isInteger(reply?.status) && reply.status >= 100 && reply.status <= 599
    ? reply.status
    : 'invalid';
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) result[key] = stable(value[key]);
    return result;
  }
  return value;
}
function fingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}
async function get(request, label, path, singleton = false) {
  let reply;
  try {
    reply = await request({ method: 'GET', path });
  } catch {
    throw refusal(unverified, `closure:transport:${label}`);
  }
  requireValid(
    reply && (reply.status === 200 || (singleton && reply.status === 404)),
    `closure:http:${label}:${httpStatus(reply)}`,
  );
  return reply;
}

/**
 * Reads complete bounded public pages, refusing partial totals, repeated IDs and malformed shapes.
 * Completeness comes from a consistent total_count and the received row count; page_count is only
 * shape-checked because the public API does not derive it from total_count and the page size.
 * @param options - Explicit GET boundary, committed public route and the static surface kind that
 * names a refusal's diagnostic code.
 * @returns Received rows after complete enumeration, without altering caller-owned response bodies.
 * @throws With a constant message and a static `code` if complete enumeration cannot be
 * established.
 */
export async function cloudClosurePages({ request, path, kind }) {
  const result = [],
    seen = new Set();
  let total;
  for (let page = 1; page <= 4; page += 1) {
    const reply = await get(
      request,
      kind,
      `${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=100`,
    );
    const body = reply.body,
      rows = Array.isArray(body) ? body : body?.data;
    requireValid(Array.isArray(rows) && rows.length <= 100, `closure:pages:shape:${kind}`);
    if (!Array.isArray(body)) {
      requireValid(
        Number.isSafeInteger(body.total_count) && body.total_count >= 0,
        `closure:pages:total-invalid:${kind}`,
      );
      requireValid(
        total === undefined || total === body.total_count,
        `closure:pages:total-changed:${kind}`,
      );
      total = body.total_count;
      if (body.page_count != null)
        requireValid(
          Number.isSafeInteger(body.page_count) && body.page_count >= 0,
          `closure:pages:page-count:${kind}`,
        );
    } else requireValid(total === undefined, `closure:pages:shape:${kind}`);
    for (const row of rows) {
      requireValid(
        row &&
          typeof row === 'object' &&
          !Array.isArray(row) &&
          typeof row.id === 'string' &&
          idPattern.test(row.id),
        `closure:pages:row:${kind}`,
      );
      requireValid(!seen.has(row.id), `closure:pages:duplicate:${kind}`);
      seen.add(row.id);
      result.push(row);
      requireValid(result.length <= limit, `closure:pages:limit:${kind}`);
    }
    if (rows.length < 100 || (total !== undefined && result.length === total)) {
      requireValid(
        total === undefined || result.length === total,
        `closure:pages:incomplete:${kind}`,
      );
      return result;
    }
    requireValid(total === undefined || result.length < total, `closure:pages:incomplete:${kind}`);
  }
  requireValid(false, `closure:pages:incomplete:${kind}`);
}

function surfaces(context) {
  return inventories.map(([kind, section, route]) => [
    kind,
    `/v2/${section}/${context.project}/${context.environment}/${route}`,
  ]);
}
function requireScope(row, context, label) {
  requireValid(
    row &&
      typeof row === 'object' &&
      row.organization_id === context.organization &&
      row.project_id === context.project &&
      row.environment_id === context.environment &&
      idPattern.test(row.id),
    `closure:scope:${label}`,
  );
}
function record(kind, row, context) {
  requireScope(row, context, surface(kind));
  if (kind !== 'pdp_configs')
    requireValid(
      typeof row.created_at === 'string' &&
        Number.isFinite(Date.parse(row.created_at)) &&
        Date.parse(row.created_at) >= Date.parse(context.createdAt),
      `closure:created-at:${surface(kind)}`,
    );
  const projection = structuredClone(row);
  const timestamped = [
    'resources',
    'roles',
    'user_attributes',
    'condition_sets',
    'condition_set_rules',
    'users',
    'tenants',
    'resource_instances',
    'relationship_tuples',
    'proxy_configs',
    'elements_configs',
    'opal_scope',
  ];
  if (timestamped.includes(kind) || kind.startsWith('resource:')) delete projection.updated_at;
  if (kind === 'tenants') delete projection.last_action_at;
  if (kind === 'resources' && projection.roles && typeof projection.roles === 'object') {
    for (const role of Object.values(projection.roles))
      if (role && typeof role === 'object' && !Array.isArray(role)) delete role.updated_at;
  }
  if (kind === 'api_keys') {
    delete projection.env;
    delete projection.project;
    delete projection.secret;
    delete projection.last_used_at;
  }
  return {
    kind,
    id: row.id,
    key: row.key ?? null,
    createdAt: row.created_at ?? null,
    digest: fingerprint(projection),
  };
}

async function observe({ request, projectRequest, context }) {
  requireValid(typeof projectRequest === 'function', 'closure:project-request');
  requireValid(
    idPattern.test(context.organization) &&
      idPattern.test(context.project) &&
      idPattern.test(context.environment) &&
      Number.isFinite(Date.parse(context.createdAt)),
    'closure:context',
  );
  const groups = new Map();
  for (const [kind, path] of surfaces(context))
    groups.set(kind, await cloudClosurePages({ request, path, kind }));
  for (const [kind, path] of [
    [
      'email_configuration',
      `/v2/facts/${context.project}/${context.environment}/email_configurations`,
    ],
    ['opal_scope', `/v2/projects/${context.project}/${context.environment}/opal_scope`],
  ]) {
    const reply = await get(request, kind, path, true);
    groups.set(kind, reply.status === 404 ? [] : [reply.body]);
  }
  const environmentKey = await get(
    projectRequest,
    'api_keys',
    `/v2/api-key/${context.project}/${context.environment}`,
  );
  groups.set('api_keys', [environmentKey.body]);
  requireValid(groups.get('resources').length <= 8, 'closure:limit:resources');
  for (const resource of groups.get('resources')) {
    requireScope(resource, context, 'resources');
    for (const child of children) {
      const path = [
        '/v2/schema',
        context.project,
        context.environment,
        'resources',
        resource.id,
        child,
      ].join('/');
      const rows = await cloudClosurePages({ request, path, kind: `resource_${child}` });
      for (const row of rows)
        requireValid(row.resource_id === resource.id, `closure:child-parent:resource_${child}`);
      groups.set(`resource:${resource.id}:${child}`, rows);
    }
  }
  const records = [];
  for (const [kind, rows] of groups)
    for (const row of rows) {
      records.push(record(kind, row, context));
      requireValid(records.length <= limit, 'closure:limit:records');
    }
  records.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  return { groups, records };
}

function ownSet(row, role) {
  return (
    row.autogenerated === true &&
    row.type === 'userset' &&
    isDeepStrictEqual(row.conditions, { 'user.roles': { contains: role.key } })
  );
}
function baselinePolicy({ groups, context }) {
  const resources = groups.get('resources'),
    roles = groups.get('roles');
  requireValid(
    resources.every((row) => builtins.includes(row.key)) &&
      new Set(resources.map((row) => row.key)).size === resources.length,
    'closure:defaults:resources',
  );
  requireValid(
    roles.every((row) => automaticRoles.includes(row.key)) &&
      new Set(roles.map((row) => row.key)).size === roles.length,
    'closure:defaults:roles',
  );
  requireValid(
    groups.get('tenants').every((row) => row.key === 'default') &&
      groups.get('tenants').length <= 1,
    'closure:defaults:tenants',
  );
  requireValid(
    groups
      .get('user_attributes')
      .every(
        (row) =>
          row.built_in === true &&
          resources.some(
            (resource) => resource.key === '__user' && resource.id === row.resource_id,
          ),
      ),
    'closure:defaults:user_attributes',
  );
  requireValid(
    groups.get('condition_sets').every((row) => roles.some((role) => ownSet(row, role))),
    'closure:defaults:condition_sets',
  );
  const pdps = groups.get('pdp_configs');
  requireValid(pdps.length <= 1, 'closure:defaults:pdp_configs');
  requireValid(groups.get('api_keys').length === pdps.length, 'closure:api-key:count');
  for (const key of groups.get('api_keys')) {
    requireValid(key.owner_type === 'pdp_config', 'closure:api-key:owner');
    requireValid(key.object_type === 'env', 'closure:api-key:object');
    requireValid(typeof key.secret === 'string' && key.secret.length > 0, 'closure:api-key:secret');
    requireValid(
      pdps.some((pdp) => pdp.client_secret === key.secret),
      'closure:api-key:secret-mismatch',
    );
  }
  for (const [kind, rows] of groups) {
    if (
      [
        'resources',
        'roles',
        'tenants',
        'user_attributes',
        'condition_sets',
        'pdp_configs',
        'api_keys',
      ].includes(kind)
    )
      continue;
    if (kind.startsWith('resource:')) {
      const resource = resources.find((row) => kind.includes(row.id));
      const child = kind.split(':').at(-1);
      requireValid(
        rows.every(
          (row) =>
            (child === 'attributes' && row.built_in === true) ||
            (child === 'roles' &&
              roles.some((role) => row.id === role.id && row.key === role.key)) ||
            (child === 'roles' &&
              resource.key === '__tenant' &&
              row.key === 'tenant-association') ||
            (child === 'actions' && ['__user', '__tenant'].includes(resource.key)),
        ),
        `closure:child:${child}`,
      );
    } else requireValid(rows.length === 0, `closure:defaults:unexpected-rows:${surface(kind)}`);
  }
  for (const [kind, rows] of groups)
    for (const row of rows) requireScope(row, context, surface(kind));
}

/**
 * Captures narrowly recognized defaults before fixture writes; no received body or credential is
 * saved. The environment's own API key is read through the project-level boundary and must match
 * the single PDP configuration. A project-level credential verifies that primary key but cannot
 * enumerate additional environment keys.
 * @param options - Environment-scoped child HTTP boundary, project-level HTTP boundary for the
 * environment key and captured organization/project/environment/birth scope.
 * @returns Finite identity and digest descriptors; a null settled inventory requires later proof.
 * @throws With a constant message when defaults, scope, credentials or pagination are unverified;
 * its static `code` names the first failed check without any received value.
 */
export async function captureCloudClosure({ request, projectRequest, context }) {
  try {
    const observed = await observe({ request, projectRequest, context });
    baselinePolicy({ ...observed, context });
    return { schema: 1, context: { ...context }, baseline: observed.records, settled: null };
  } catch (error) {
    throw refusal(
      'Cloud initial child closure failed; retain the owned environment.',
      diagnosticCode(error, 'closure:capture:exception'),
    );
  }
}

function requireClosure(closure) {
  requireValid(
    closure &&
      isDeepStrictEqual(Object.keys(closure).sort(), [
        'baseline',
        'context',
        'schema',
        'settled',
      ]) &&
      closure.schema === 1 &&
      closure.context &&
      isDeepStrictEqual(Object.keys(closure.context).sort(), [
        'createdAt',
        'environment',
        'organization',
        'project',
      ]) &&
      Array.isArray(closure.baseline) &&
      closure.baseline.length <= limit,
    'closure:state',
  );
  for (const rows of [closure.baseline, closure.settled ?? []]) {
    requireValid(Array.isArray(rows) && rows.length <= limit, 'closure:state');
    const seen = new Set();
    for (const row of rows) {
      requireValid(
        row &&
          isDeepStrictEqual(Object.keys(row).sort(), [
            'createdAt',
            'digest',
            'id',
            'key',
            'kind',
          ]) &&
          idPattern.test(row.id) &&
          typeof row.kind === 'string' &&
          /^[a-f0-9]{64}$/u.test(row.digest) &&
          (row.key === null || typeof row.key === 'string') &&
          (row.createdAt === null || Number.isFinite(Date.parse(row.createdAt))) &&
          !seen.has(`${row.kind}:${row.id}`),
        'closure:state:record',
      );
      seen.add(`${row.kind}:${row.id}`);
    }
  }
}

/**
 * Admits captured fixture IDs and finite resource/role effects, preserving every initial default.
 * @param options - Environment-scoped child read boundary, project-level read boundary for the
 * environment key, initial closure and independently captured fixture records.
 * @returns A new settled closure; the initial caller-owned closure remains intact on failure.
 * @throws With a constant message on additions, replacements or unrecognized effects; its static
 * `code` names the first failed check.
 */
export async function settleCloudClosure({ request, projectRequest, closure, fixture }) {
  try {
    requireClosure(closure);
    requireValid(
      closure.settled === null &&
        fixture?.schema === 1 &&
        fixture.active === false &&
        fixture.unknownWrite === false &&
        Array.isArray(fixture.records) &&
        fixture.records.length <= 7 &&
        new Set(fixture.records.map((row) => `${row.kind}:${row.id}`)).size ===
          fixture.records.length,
      'closure:settle:fixture-state',
    );
    const observed = await observe({ request, projectRequest, context: closure.context });
    const baseline = new Map(closure.baseline.map((row) => [`${row.kind}:${row.id}`, row]));
    const owned = new Map(fixture.records.map((row) => [`${row.kind}:${row.id}`, row]));
    for (const row of observed.records) {
      const prior = baseline.get(`${row.kind}:${row.id}`),
        own = owned.get(`${row.kind}:${row.id}`);
      if (prior && !isDeepStrictEqual(prior, row)) {
        const ownRole = fixture.records.find((entry) => entry.kind === 'roles');
        const raw = observed.groups.get(row.kind).find((entry) => entry.id === row.id);
        const trimmed = structuredClone(raw);
        const effect = trimmed.roles?.[ownRole?.key];
        requireValid(
          row.kind === 'resources' &&
            builtins.includes(raw.key) &&
            effect?.id === ownRole?.id &&
            effect?.created_at === ownRole?.createdAt,
          `closure:settle:changed:${surface(row.kind)}`,
        );
        requireScope(effect, closure.context, 'role_effect');
        delete trimmed.roles[ownRole.key];
        requireValid(
          record(row.kind, trimmed, closure.context).digest === prior.digest,
          'closure:settle:builtin-changed',
        );
      } else if (!prior && own)
        requireValid(
          own.key === row.key || row.kind === 'role_assignments',
          `closure:settle:fixture-key:${surface(row.kind)}`,
        );
      else if (!prior) {
        const resource = fixture.records.find((entry) => entry.kind === 'resources');
        const role = fixture.records.find((entry) => entry.kind === 'roles');
        const raw = observed.groups.get(row.kind).find((entry) => entry.id === row.id);
        const rawResource = observed.groups
          .get('resources')
          .find((entry) => entry.id === resource?.id);
        requireValid(
          (row.kind === `resource:${resource?.id}:actions` &&
            ['read', 'write'].includes(row.key) &&
            rawResource?.actions?.[row.key]?.id === row.id) ||
            (row.kind === 'condition_sets' && ownSet(raw, role)) ||
            (row.kind.startsWith('resource:') &&
              row.kind.endsWith(':roles') &&
              raw.id === role?.id &&
              raw.key === role?.key &&
              raw.created_at === role?.createdAt),
          `closure:settle:addition:${surface(row.kind)}`,
        );
      }
      if (own)
        requireValid(
          own.createdAt === row.createdAt,
          `closure:settle:fixture-created-at:${surface(row.kind)}`,
        );
      baseline.delete(`${row.kind}:${row.id}`);
      owned.delete(`${row.kind}:${row.id}`);
    }
    requireValid(baseline.size === 0, 'closure:settle:missing-default');
    requireValid(owned.size === 0, 'closure:settle:missing-fixture');
    return { ...closure, settled: observed.records };
  } catch (error) {
    throw refusal(
      'Cloud fixture child closure failed; retain the owned environment.',
      diagnosticCode(error, 'closure:settle:exception'),
    );
  }
}

function firstMissing(rows, others) {
  return rows.find((row) => !others.some((other) => isDeepStrictEqual(row, other)));
}

/**
 * Rereads bounded inventories and exact captured child IDs before the parent deletion is attempted.
 * @param options - Environment-scoped child HTTP boundary, project-level HTTP boundary for the
 * environment key, captured closure and fixture or known empty baseline.
 * @returns Nothing when all physical identities and definitions remain captured and complete.
 * @throws With a constant message to retain the environment on any ownership uncertainty; its
 * static `code` names the first failed check and the changed surface kind.
 */
export async function verifyCloudClosure({ request, projectRequest, closure, fixture }) {
  try {
    requireClosure(closure);
    const expected = fixture === null ? closure.baseline : closure.settled;
    requireValid(Array.isArray(expected), 'closure:verify:unsettled');
    const observed = await observe({ request, projectRequest, context: closure.context });
    if (!isDeepStrictEqual(observed.records, expected)) {
      const changed =
        firstMissing(observed.records, expected) ?? firstMissing(expected, observed.records);
      throw refusal(unverified, `closure:verify:changed:${surface(changed?.kind)}`);
    }
    if (fixture !== null) {
      for (const owned of fixture.records) {
        if (owned.kind === 'role_assignments') continue;
        requireValid(fixtureKinds.includes(owned.kind), 'closure:verify:fixture-kind');
        const section = ['resources', 'roles'].includes(owned.kind) ? 'schema' : 'facts';
        const path = [
          '/v2',
          section,
          closure.context.project,
          closure.context.environment,
          owned.kind,
          owned.id,
        ].join('/');
        const reply = await get(request, `detail_${owned.kind}`, path);
        requireScope(reply.body, closure.context, `detail_${owned.kind}`);
        requireValid(
          reply.body.id === owned.id &&
            reply.body.created_at === owned.createdAt &&
            reply.body.key === owned.key &&
            record(owned.kind, reply.body, closure.context).digest ===
              expected.find((row) => row.kind === owned.kind && row.id === owned.id)?.digest,
          `closure:verify:detail:${owned.kind}`,
        );
      }
      const grant = fixture.records.find((row) => row.kind === 'role_assignments');
      if (grant) {
        const user = fixture.records.find((row) => row.kind === 'users' && row.key === grant.key);
        const role = fixture.records.find((row) => row.kind === 'roles');
        const row = observed.groups.get('role_assignments').find((entry) => entry.id === grant.id);
        requireValid(
          row &&
            row.user_id === user?.id &&
            row.role_id === role?.id &&
            row.resource_instance == null &&
            row.resource_instance_id == null,
          'closure:verify:grant',
        );
      }
    }
  } catch (error) {
    throw refusal(
      'Cloud cleanup child closure failed; retain the owned environment.',
      diagnosticCode(error, 'closure:verify:exception'),
    );
  }
}
