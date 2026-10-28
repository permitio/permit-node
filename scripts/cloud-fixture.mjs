import { isDeepStrictEqual } from 'node:util';

function refusal(message, code) {
  return Object.assign(new Error(message), { code });
}
function requireValid(value, message, code) {
  if (!value) throw refusal(message, code);
}
function diagnosticCode(error, fallback) {
  return typeof error?.code === 'string' ? error.code : fallback;
}
function httpStatus(reply) {
  return Number.isInteger(reply?.status) && reply.status >= 100 && reply.status <= 599
    ? reply.status
    : 'invalid';
}
/** Names an unestablished write by the create reply's failure status when one was received. */
function writeCode(kind, reply) {
  const status = httpStatus(reply);
  return typeof status === 'number' && status >= 300
    ? `fixture:http:${kind}:${status}`
    : `fixture:write:${kind}`;
}

/** Returns the finite independently owned RBAC names used by the public cloud oracle. */
export function cloudFixtureNames(key) {
  requireValid(
    /^node-acceptance-[1-9]\d*-[1-9]\d*$/u.test(key),
    'Cloud fixture key is invalid.',
    'fixture:names',
  );
  return {
    allowedUser: `${key}_allowed`,
    deniedUser: `${key}_denied`,
    tenant: `${key}_tenant`,
    otherTenant: `${key}_other`,
    resource: `${key}_document`,
    role: `${key}_reader`,
  };
}

function fixtureIdentity(row, context, definition) {
  requireValid(
    row &&
      typeof row === 'object' &&
      !Array.isArray(row) &&
      /^[a-f0-9-]{32,36}$/u.test(row.id) &&
      typeof row.created_at === 'string' &&
      Number.isFinite(Date.parse(row.created_at)) &&
      row.organization_id === context.organization &&
      row.project_id === context.project &&
      row.environment_id === context.environment &&
      row.key === definition.key &&
      (definition.kind === 'users'
        ? row.attributes?.release_acceptance === context.marker
        : definition.kind === 'resources'
          ? row.type_attributes?.release_acceptance === context.marker
          : row.description === context.marker),
    'Cloud fixture response does not establish owned immutable identity.',
    `fixture:identity:${definition.kind}`,
  );
  return { kind: definition.kind, key: definition.key, id: row.id, createdAt: row.created_at };
}

async function fixtureRead(request, kind, path) {
  let reply;
  try {
    reply = await request({ method: 'GET', path });
  } catch {
    throw refusal(
      'Cloud fixture read failed; retain its saved state.',
      `fixture:transport:${kind}`,
    );
  }
  requireValid(
    reply?.status === 200 || reply?.status === 404,
    'Cloud fixture read status is invalid.',
    `fixture:http:${kind}:${httpStatus(reply)}`,
  );
  return reply;
}

/**
 * Seeds a finite tenant RBAC oracle through public HTTP contracts, with no candidate execution.
 * @param options - Exact captured environment, scoped HTTP boundary and private state writer.
 * @returns Six public logical fixture names; credentials and received objects stay out of state.
 * @throws When a possible write cannot be immediately captured and independently read back.
 */
async function seedFixture({ request, context, save }) {
  requireValid(
    typeof request === 'function' &&
      typeof save === 'function' &&
      context &&
      /^[a-f0-9-]{32,36}$/u.test(context.project) &&
      /^[a-f0-9-]{32,36}$/u.test(context.environment) &&
      typeof context.organization === 'string' &&
      context.organization.length > 0 &&
      context.marker === `permit-node:release-acceptance:${context.key}`,
    'Cloud fixture requires exact environment scope and durable state storage.',
    'fixture:inputs',
  );
  const fixture = cloudFixtureNames(context.key);
  const state = {
    schema: 1,
    project: context.project,
    environment: context.environment,
    key: context.key,
    marker: context.marker,
    active: true,
    unknownWrite: false,
    records: [],
  };
  let safeFailure = true;
  await save(structuredClone(state));
  const definitions = [
    {
      kind: 'resources',
      key: fixture.resource,
      body: {
        key: fixture.resource,
        name: context.marker,
        type_attributes: { release_acceptance: context.marker },
        actions: { read: {}, write: {} },
      },
    },
    {
      kind: 'roles',
      key: fixture.role,
      body: {
        key: fixture.role,
        name: context.marker,
        description: context.marker,
        permissions: [`${fixture.resource}:read`],
      },
    },
    ...[fixture.tenant, fixture.otherTenant].map((key) => ({
      kind: 'tenants',
      key,
      body: { key, name: context.marker, description: context.marker },
    })),
    ...[fixture.allowedUser, fixture.deniedUser].map((key) => ({
      kind: 'users',
      key,
      body: { key, attributes: { release_acceptance: context.marker } },
    })),
  ];
  try {
    for (const definition of definitions) {
      const prefix = ['resources', 'roles'].includes(definition.kind) ? 'schema' : 'facts';
      const collection = [
        '/v2',
        prefix,
        context.project,
        context.environment,
        definition.kind,
      ].join('/');
      const path = `${collection}/${encodeURIComponent(definition.key)}`;
      const before = await fixtureRead(request, definition.kind, path);
      if (before.status !== 404) safeFailure = false;
      requireValid(
        before.status === 404,
        'Cloud fixture namespace already exists; refuse to adopt it.',
        `fixture:exists:${definition.kind}`,
      );
      state.unknownWrite = true;
      await save(structuredClone(state));
      let reply;
      try {
        reply = await request({ method: 'POST', path: collection, body: definition.body });
      } catch {
        reply = undefined;
      }
      let acknowledged;
      if (reply?.status === 200 || reply?.status === 201)
        acknowledged = fixtureIdentity(reply.body, context, definition);
      const byKey = await fixtureRead(request, definition.kind, path);
      requireValid(
        byKey.status === 200,
        'Cloud fixture write has not established an owned record.',
        writeCode(definition.kind, reply),
      );
      const captured = fixtureIdentity(byKey.body, context, definition);
      requireValid(
        !acknowledged || isDeepStrictEqual(acknowledged, captured),
        'Cloud fixture acknowledgment and readback differ.',
        `fixture:ack:${definition.kind}`,
      );
      const byId = await fixtureRead(request, definition.kind, `${collection}/${captured.id}`);
      requireValid(
        byId.status === 200 &&
          isDeepStrictEqual(fixtureIdentity(byId.body, context, definition), captured),
        'Cloud fixture physical identity readback differs.',
        `fixture:readback:${definition.kind}`,
      );
      state.records.push(captured);
      state.unknownWrite = false;
      await save(structuredClone(state));
    }
    const record = (key) => state.records.find((row) => row.key === key);
    const user = record(fixture.allowedUser),
      role = record(fixture.role),
      tenant = record(fixture.tenant);
    const collection = ['/v2/facts', context.project, context.environment, 'role_assignments'].join(
      '/',
    );
    const body = { user: user.id, role: role.id, tenant: tenant.id };
    state.unknownWrite = true;
    await save(structuredClone(state));
    let reply;
    try {
      reply = await request({ method: 'POST', path: collection, body });
    } catch {
      reply = undefined;
    }
    const read = await fixtureRead(
      request,
      'role_assignments',
      collection +
        '?' +
        new URLSearchParams({
          user: user.id,
          role: role.id,
          tenant: tenant.id,
          page: '1',
          per_page: '100',
          include_total_count: 'true',
        }),
    );
    const envelope = read.body;
    const rows = Array.isArray(envelope) ? envelope : envelope?.data;
    const inventory = 'Cloud fixture grant is absent, ambiguous or not exhaustively observed.';
    requireValid(read.status === 200, inventory, `fixture:http:role_assignments:${read.status}`);
    requireValid(
      !Array.isArray(rows) || rows.length > 0,
      inventory,
      writeCode('role_assignments', reply),
    );
    requireValid(
      Array.isArray(rows) &&
        rows.length === 1 &&
        (Array.isArray(envelope) || envelope.total_count === 1),
      inventory,
      'fixture:grant:inventory',
    );
    const grant = rows[0];
    requireValid(
      grant &&
        /^[a-f0-9-]{32,36}$/u.test(grant.id) &&
        typeof grant.created_at === 'string' &&
        Number.isFinite(Date.parse(grant.created_at)) &&
        grant.organization_id === context.organization &&
        grant.project_id === context.project &&
        grant.environment_id === context.environment &&
        grant.user_id === user.id &&
        grant.role_id === role.id &&
        grant.tenant_id === tenant.id &&
        grant.user === fixture.allowedUser &&
        grant.role === fixture.role &&
        (grant.tenant == null || grant.tenant === fixture.tenant) &&
        grant.resource_instance_id == null &&
        grant.resource_instance == null,
      'Cloud fixture grant does not belong to the exact owned user, role and tenant.',
      'fixture:grant:identity',
    );
    if (reply?.status === 200 || reply?.status === 201)
      requireValid(
        reply.body?.id === grant.id && reply.body.created_at === grant.created_at,
        'Cloud fixture grant acknowledgment differs from independent readback.',
        'fixture:grant:ack',
      );
    state.records.push({
      kind: 'role_assignments',
      key: fixture.allowedUser,
      id: grant.id,
      createdAt: grant.created_at,
    });
    state.unknownWrite = false;
    state.active = false;
    await save(structuredClone(state));
    return fixture;
  } catch (error) {
    if (!state.unknownWrite && safeFailure) {
      state.active = false;
      await save(structuredClone(state));
    }
    throw refusal(
      'Cloud fixture setup failed; cleanup must independently inspect its state.',
      error?.code,
    );
  }
}

/**
 * Seeds the public RBAC oracle and hides arbitrary network or storage exception details.
 * @param options - Explicit environment scope, HTTP boundary and durable state writer.
 * @returns The six owned public logical names after all seven writes are independently captured.
 * @throws With a constant message when setup or durable capture fails; its static `code` names the
 * first failed check, fixture kind and any received HTTP status.
 */
export async function seedCloudFixture(options) {
  try {
    return await seedFixture(options);
  } catch (error) {
    throw refusal(
      'Cloud fixture setup failed; retain saved state for independent cleanup.',
      diagnosticCode(error, 'fixture:seed:exception'),
    );
  }
}

/** Refuses environment cascade while any trusted fixture write remains uncertain or active. */
export function verifyCloudFixtureSettled(state, owner) {
  requireValid(
    state &&
      isDeepStrictEqual(Object.keys(state).sort(), [
        'active',
        'environment',
        'key',
        'marker',
        'project',
        'records',
        'schema',
        'unknownWrite',
      ]) &&
      state.schema === 1 &&
      state.project === owner.project &&
      state.environment === owner.identity?.id &&
      state.key === owner.key &&
      state.marker === owner.marker &&
      state.active === false &&
      state.unknownWrite === false &&
      Array.isArray(state.records) &&
      state.records.length <= 7,
    'Cloud fixture writes remain unsettled or foreign; refuse environment cleanup.',
    'fixture:settled:state',
  );
  const names = cloudFixtureNames(owner.key);
  const kinds = new Map([
    [names.resource, 'resources'],
    [names.role, 'roles'],
    [names.tenant, 'tenants'],
    [names.otherTenant, 'tenants'],
    [names.allowedUser, 'users'],
    [names.deniedUser, 'users'],
  ]);
  const ids = new Set();
  const logical = new Set();
  for (const row of state.records) {
    requireValid(
      row &&
        isDeepStrictEqual(Object.keys(row).sort(), ['createdAt', 'id', 'key', 'kind']) &&
        /^[a-f0-9-]{32,36}$/u.test(row.id) &&
        typeof row.createdAt === 'string' &&
        Number.isFinite(Date.parse(row.createdAt)) &&
        !ids.has(row.id) &&
        !logical.has(`${row.kind}:${row.key}`) &&
        (kinds.get(row.key) === row.kind ||
          (row.key === names.allowedUser && row.kind === 'role_assignments')),
      'Cloud fixture capture is malformed or ambiguous; refuse environment cleanup.',
      'fixture:settled:record',
    );
    ids.add(row.id);
    logical.add(`${row.kind}:${row.key}`);
  }
}
