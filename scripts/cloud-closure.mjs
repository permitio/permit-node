import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const idPattern = /^[a-f0-9-]{32,36}$/u;
const automaticRoles = ['admin', 'editor', 'viewer'];
const builtins = ['__user', '__tenant'];
const limit = 128;

function requireValid(value) {
  if (!value) throw new Error('Cloud destructive closure is unverified; retain the environment.');
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
async function get(request, path, singleton = false) {
  const reply = await request({ method: 'GET', path });
  requireValid(reply && (reply.status === 200 || (singleton && reply.status === 404)));
  return reply;
}

/**
 * Reads complete bounded public pages, refusing partial totals, repeated IDs and malformed shapes.
 * @param options - Explicit GET boundary, committed public route and required envelope policy.
 * @returns Received rows after complete enumeration, without altering caller-owned response bodies.
 * @throws With a constant diagnostic if complete enumeration cannot be established.
 */
export async function cloudClosurePages({ request, path, envelope = false }) {
  const result = [],
    seen = new Set();
  let total;
  for (let page = 1; page <= 4; page += 1) {
    const reply = await get(
      request,
      `${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=100`,
    );
    const body = reply.body,
      rows = Array.isArray(body) ? body : body?.data;
    requireValid(Array.isArray(rows) && rows.length <= 100 && (!envelope || !Array.isArray(body)));
    if (!Array.isArray(body)) {
      requireValid(Number.isSafeInteger(body.total_count) && body.total_count >= 0);
      requireValid(total === undefined || total === body.total_count);
      total = body.total_count;
      if (body.page_count != null)
        requireValid(
          Number.isSafeInteger(body.page_count) &&
            body.page_count >= 0 &&
            body.page_count === Math.ceil(total / 100),
        );
    } else requireValid(total === undefined);
    for (const row of rows) {
      requireValid(
        row &&
          typeof row === 'object' &&
          !Array.isArray(row) &&
          typeof row.id === 'string' &&
          idPattern.test(row.id) &&
          !seen.has(row.id),
      );
      seen.add(row.id);
      result.push(row);
      requireValid(result.length <= limit);
    }
    if (rows.length < 100 || (total !== undefined && result.length === total)) {
      requireValid(total === undefined || result.length === total);
      return result;
    }
    requireValid(total === undefined || result.length < total);
  }
  requireValid(false);
}

function surfaces(context) {
  const schema = `/v2/schema/${context.project}/${context.environment}`;
  const facts = `/v2/facts/${context.project}/${context.environment}`;
  return [
    ['resources', `${schema}/resources?include_built_in=true&include_total_count=true`],
    ['roles', `${schema}/roles?include_total_count=true`],
    ['user_attributes', `${schema}/users/attributes`],
    ['condition_sets', `${schema}/condition_sets?include_total_count=true`],
    ['condition_set_rules', `${facts}/set_rules`],
    ['users', `${facts}/users`],
    ['tenants', `${facts}/tenants?include_total_count=true`],
    ['groups', `${schema}/groups`],
    ['user_invites', `${facts}/user_invites`],
    ['resource_instances', `${facts}/resource_instances?detailed=true&include_total_count=true`],
    ['relationship_tuples', `${facts}/relationship_tuples?detailed=true&include_total_count=true`],
    ['role_assignments', `${facts}/role_assignments?include_total_count=true`],
    ['proxy_configs', `${facts}/proxy_configs`],
    ['pdp_configs', `/v2/pdps/${context.project}/${context.environment}/configs`],
    ['elements_configs', `/v2/elements/${context.project}/${context.environment}/config`],
    ['email_templates', `${facts}/email_templates/`],
    ['api_keys', `/v2/api-key?object_type=env&proj_id=${context.project}`],
  ];
}
function requireScope(row, context) {
  requireValid(
    row.organization_id === context.organization &&
      row.project_id === context.project &&
      row.environment_id === context.environment &&
      idPattern.test(row.id),
  );
}
function record(kind, row, context) {
  requireScope(row, context);
  if (kind !== 'pdp_configs')
    requireValid(
      typeof row.created_at === 'string' &&
        Number.isFinite(Date.parse(row.created_at)) &&
        Date.parse(row.created_at) >= Date.parse(context.createdAt),
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

async function observe({ request, context }) {
  requireValid(
    idPattern.test(context.organization) &&
      idPattern.test(context.project) &&
      idPattern.test(context.environment) &&
      Number.isFinite(Date.parse(context.createdAt)),
  );
  const groups = new Map();
  for (const [kind, path] of surfaces(context)) {
    let rows = await cloudClosurePages({ request, path, envelope: kind === 'api_keys' });
    if (kind === 'api_keys') {
      for (const row of rows)
        requireValid(
          row.organization_id === context.organization &&
            row.project_id === context.project &&
            row.object_type === 'env' &&
            typeof row.environment_id === 'string',
        );
      rows = rows.filter((row) => row.environment_id === context.environment);
    }
    groups.set(kind, rows);
  }
  for (const [kind, path] of [
    [
      'email_configuration',
      `/v2/facts/${context.project}/${context.environment}/email_configurations`,
    ],
    ['opal_scope', `/v2/projects/${context.project}/${context.environment}/opal_scope`],
  ]) {
    const reply = await get(request, path, true);
    groups.set(kind, reply.status === 404 ? [] : [reply.body]);
  }
  requireValid(groups.get('resources').length <= 8);
  for (const resource of groups.get('resources')) {
    requireScope(resource, context);
    for (const child of ['actions', 'attributes', 'roles', 'relations', 'action_groups']) {
      const path = [
        '/v2/schema',
        context.project,
        context.environment,
        'resources',
        resource.id,
        child,
      ].join('/');
      const rows = await cloudClosurePages({ request, path });
      for (const row of rows) requireValid(row.resource_id === resource.id);
      groups.set(`resource:${resource.id}:${child}`, rows);
    }
  }
  const records = [];
  for (const [kind, rows] of groups)
    for (const row of rows) {
      records.push(record(kind, row, context));
      requireValid(records.length <= limit);
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
async function baselinePolicy({ groups, request, context }) {
  const resources = groups.get('resources'),
    roles = groups.get('roles');
  requireValid(
    resources.every((row) => builtins.includes(row.key)) &&
      new Set(resources.map((row) => row.key)).size === resources.length,
  );
  requireValid(
    roles.every((row) => automaticRoles.includes(row.key)) &&
      new Set(roles.map((row) => row.key)).size === roles.length,
  );
  requireValid(
    groups.get('tenants').every((row) => row.key === 'default') &&
      groups.get('tenants').length <= 1,
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
  );
  requireValid(
    groups.get('condition_sets').every((row) => roles.some((role) => ownSet(row, role))),
  );
  const pdps = groups.get('pdp_configs');
  requireValid(pdps.length <= 1);
  for (const key of groups.get('api_keys')) {
    requireValid(key.owner_type === 'pdp_config' && key.object_type === 'env');
    let secret = key.secret;
    if (secret == null) {
      const detail = await get(request, `/v2/api-key/${key.id}`);
      for (const field of [
        'id',
        'created_at',
        'organization_id',
        'project_id',
        'environment_id',
        'owner_type',
        'object_type',
      ])
        requireValid(detail.body?.[field] === key[field]);
      secret = detail.body.secret;
    }
    requireValid(
      typeof secret === 'string' &&
        secret.length > 0 &&
        pdps.some((pdp) => pdp.client_secret === secret),
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
            (child === 'actions' && ['__user', '__tenant'].includes(resource.key)),
        ),
      );
    } else requireValid(rows.length === 0);
  }
  requireValid(groups.get('api_keys').length === pdps.length);
  for (const rows of groups.values()) for (const row of rows) requireScope(row, context);
}

/**
 * Captures narrowly recognized defaults before fixture writes; no received body or credential is
 * saved.
 * @param options - Explicit HTTP boundary and captured organization/project/environment/birth
 * scope.
 * @returns Finite identity and digest descriptors; a null settled inventory requires later proof.
 * @throws With a constant diagnostic when defaults, scope, credentials or pagination are
 * unverified.
 */
export async function captureCloudClosure({ request, context }) {
  try {
    const observed = await observe({ request, context });
    await baselinePolicy({ ...observed, request, context });
    return { schema: 1, context: { ...context }, baseline: observed.records, settled: null };
  } catch {
    throw new Error('Cloud initial child closure failed; retain the owned environment.');
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
  );
  for (const rows of [closure.baseline, closure.settled ?? []]) {
    requireValid(Array.isArray(rows) && rows.length <= limit);
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
      );
      seen.add(`${row.kind}:${row.id}`);
    }
  }
}

/**
 * Admits captured fixture IDs and finite resource/role effects, preserving every initial default.
 * @param options - Public read boundary, initial closure and independently captured fixture
 * records.
 * @returns A new settled closure; the initial caller-owned closure remains intact on failure.
 * @throws With a constant diagnostic on additions, replacements or unrecognized effects.
 */
export async function settleCloudClosure({ request, closure, fixture }) {
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
    );
    const observed = await observe({ request, context: closure.context });
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
        );
        requireScope(effect, closure.context);
        delete trimmed.roles[ownRole.key];
        requireValid(record(row.kind, trimmed, closure.context).digest === prior.digest);
      } else if (!prior && own)
        requireValid(own.key === row.key || row.kind === 'role_assignments');
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
        );
      }
      if (own) requireValid(own.createdAt === row.createdAt);
      baseline.delete(`${row.kind}:${row.id}`);
      owned.delete(`${row.kind}:${row.id}`);
    }
    requireValid(baseline.size === 0 && owned.size === 0);
    return { ...closure, settled: observed.records };
  } catch {
    throw new Error('Cloud fixture child closure failed; retain the owned environment.');
  }
}

/**
 * Rereads bounded inventories and exact captured child IDs before the parent deletion is attempted.
 * @param options - Explicit HTTP boundary, captured closure and fixture or known empty baseline.
 * @returns Nothing when all physical identities and definitions remain captured and complete.
 * @throws With a constant diagnostic to retain the environment on any ownership uncertainty.
 */
export async function verifyCloudClosure({ request, closure, fixture }) {
  try {
    requireClosure(closure);
    const expected = fixture === null ? closure.baseline : closure.settled;
    requireValid(Array.isArray(expected));
    const observed = await observe({ request, context: closure.context });
    requireValid(isDeepStrictEqual(observed.records, expected));
    if (fixture !== null) {
      for (const owned of fixture.records) {
        if (owned.kind === 'role_assignments') continue;
        requireValid(['resources', 'roles', 'tenants', 'users'].includes(owned.kind));
        const section = ['resources', 'roles'].includes(owned.kind) ? 'schema' : 'facts';
        const path = [
          '/v2',
          section,
          closure.context.project,
          closure.context.environment,
          owned.kind,
          owned.id,
        ].join('/');
        const reply = await get(request, path);
        requireScope(reply.body, closure.context);
        requireValid(
          reply.body.id === owned.id &&
            reply.body.created_at === owned.createdAt &&
            reply.body.key === owned.key &&
            record(owned.kind, reply.body, closure.context).digest ===
              expected.find((row) => row.kind === owned.kind && row.id === owned.id)?.digest,
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
        );
      }
    }
  } catch {
    throw new Error('Cloud cleanup child closure failed; retain the owned environment.');
  }
}
