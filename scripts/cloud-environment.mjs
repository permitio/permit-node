import { isDeepStrictEqual } from 'node:util';

export const CONTROL_PLANE_ORIGIN = 'https://api.permit.io';

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

function ownerInputs({ project, key, marker }) {
  requireValid(
    typeof project === 'string' &&
      /^[a-f0-9-]{32,36}$/u.test(project) &&
      typeof key === 'string' &&
      /^node-acceptance-[1-9]\d*-[1-9]\d*$/u.test(key) &&
      marker === `permit-node:release-acceptance:${key}`,
    'Cloud environment ownership inputs are invalid.',
    'environment:inputs',
  );
}

function ownedIdentity(body, owner, source) {
  requireValid(
    body &&
      typeof body === 'object' &&
      typeof body.id === 'string' &&
      /^[a-f0-9-]{32,36}$/u.test(body.id) &&
      body.project_id === owner.project &&
      body.key === owner.key &&
      body.name === owner.key &&
      body.description === owner.marker &&
      typeof body.created_at === 'string' &&
      Number.isFinite(Date.parse(body.created_at)),
    'Cloud environment readback does not establish the exact owned identity.',
    `environment:identity:${source}`,
  );
  return { id: body.id, createdAt: body.created_at };
}

async function send(request, input, label, message) {
  try {
    return await request(input);
  } catch {
    throw refusal(message, `environment:transport:${label}`);
  }
}

async function checkedRead(request, path, label) {
  const response = await send(
    request,
    { method: 'GET', path },
    label,
    'Cloud environment ownership read failed before cleanup.',
  );
  requireValid(
    response?.status === 200 || response?.status === 404,
    'Cloud environment ownership read returned an unexpected HTTP status.',
    `environment:http:${label}:${httpStatus(response)}`,
  );
  return response;
}

/**
 * Registers cleanup before one public create request and captures immutable identity immediately.
 * @param options - Public HTTP boundary and the unique trusted run/attempt ownership marker.
 * @returns Durable cleanup state and scoped credential; never returns a broader credential.
 * @throws When initial identity cannot be captured, cleanup remains permanently unverified. The
 * error's static `code` names the first failed check and any received HTTP status.
 */
export async function provisionCloudEnvironment({ request, project, key, marker, save }) {
  const owner = { project, key, marker };
  ownerInputs(owner);
  requireValid(
    typeof request === 'function' && typeof save === 'function',
    'Cloud setup requires a public HTTP boundary and durable state storage.',
    'environment:boundary',
  );
  const state = { schema: 1, ...owner, attempted: false, identity: null, capture: 'unverified' };
  await save(structuredClone(state));
  const collection = `/v2/projects/${project}/envs`;
  const keyPath = `${collection}/${key}`;
  const existing = await checkedRead(request, keyPath, 'by_key');
  requireValid(
    existing.status === 404,
    'Cloud environment namespace already exists; setup refused.',
    'environment:exists',
  );
  state.attempted = true;
  await save(structuredClone(state));
  let reply;
  try {
    reply = await request({
      method: 'POST',
      path: collection,
      body: { key, name: key, description: marker },
    });
  } catch {
    reply = undefined;
  }
  try {
    if (reply?.status === 200 || reply?.status === 201)
      state.identity = ownedIdentity(reply.body, owner, 'create');
    const recovered = await checkedRead(request, keyPath, 'by_key');
    const status = httpStatus(reply);
    requireValid(
      recovered.status !== 404 || state.identity,
      'Cloud create did not establish an owned environment.',
      typeof status === 'number' && status >= 300
        ? `environment:http:create:${status}`
        : 'environment:create',
    );
    requireValid(
      recovered.status === 200,
      'Cloud create acknowledgment is not independently visible.',
      'environment:readback:by_key',
    );
    const identity = ownedIdentity(recovered.body, owner, 'by_key');
    requireValid(
      !state.identity || isDeepStrictEqual(state.identity, identity),
      'Cloud create and readback identify different physical environments.',
      'environment:identity-changed:by_key',
    );
    state.identity = identity;
    const byId = await checkedRead(request, `${collection}/${identity.id}`, 'by_id');
    requireValid(
      byId.status === 200 && isDeepStrictEqual(ownedIdentity(byId.body, owner, 'by_id'), identity),
      'Cloud physical environment readback differs from its initial identity.',
      'environment:readback:by_id',
    );
    state.capture = 'verified';
    await save(structuredClone(state));
  } catch (error) {
    state.capture = 'unverified';
    await save(structuredClone(state));
    throw refusal(
      'Cloud setup could not capture immutable ownership; retain the saved state.',
      diagnosticCode(error, 'environment:provision:exception'),
    );
  }
  const scoped = await fetchCloudEnvironmentCredential({ request, state });
  return { state, ...scoped };
}

/**
 * Revalidates immutable ownership before handing one exact environment credential to a candidate.
 * @param options - The initially captured owner and explicit trusted-step HTTP boundary.
 * @returns The environment credential and its independently observed organization identifier.
 * @throws When ownership changed or the fetched credential is broader, foreign or malformed. The
 * error's static `code` names the first failed check and any received HTTP status.
 */
export async function fetchCloudEnvironmentCredential({ request, state }) {
  ownerInputs(state);
  requireValid(
    state.attempted === true &&
      state.capture === 'verified' &&
      state.identity &&
      /^[a-f0-9-]{32,36}$/u.test(state.identity.id) &&
      typeof state.identity.createdAt === 'string' &&
      Number.isFinite(Date.parse(state.identity.createdAt)),
    'Cloud credential handoff requires initially captured immutable ownership.',
    'environment:credential:state',
  );
  const project = state.project;
  const collection = `/v2/projects/${project}/envs`;
  const reads = await Promise.all([
    checkedRead(request, `${collection}/${state.key}`, 'by_key'),
    checkedRead(request, `${collection}/${state.identity.id}`, 'by_id'),
  ]);
  for (const [read, label] of [
    [reads[0], 'by_key'],
    [reads[1], 'by_id'],
  ])
    requireValid(
      read.status === 200 &&
        isDeepStrictEqual(ownedIdentity(read.body, state, label), state.identity),
      'Cloud credential handoff refused changed or ambiguous environment ownership.',
      `environment:credential:ownership:${label}`,
    );
  let credential, organization;
  try {
    const unavailable = 'Scoped cloud credential is unavailable.';
    const response = await send(
      request,
      { method: 'GET', path: `/v2/api-key/${project}/${state.identity.id}` },
      'api_key',
      unavailable,
    );
    requireValid(
      response?.status === 200,
      unavailable,
      `environment:http:api_key:${httpStatus(response)}`,
    );
    requireValid(
      typeof response.body?.secret === 'string' && /^[\x21-\x7e]+$/u.test(response.body.secret),
      unavailable,
      'environment:credential:secret',
    );
    requireValid(
      (response.body.project_id == null || response.body.project_id === project) &&
        (response.body.environment_id == null ||
          response.body.environment_id === state.identity.id) &&
        (response.body.object_type == null || response.body.object_type === 'env'),
      unavailable,
      'environment:credential:metadata',
    );
    credential = response.body.secret;
    const foreign =
      'Fetched cloud credential does not belong exclusively to the captured environment.';
    const scope = await send(
      request,
      { method: 'GET', path: '/v2/api-key/scope', credential },
      'api_key_scope',
      foreign,
    );
    requireValid(
      scope?.status === 200,
      foreign,
      `environment:http:api_key_scope:${httpStatus(scope)}`,
    );
    requireValid(
      typeof scope.body?.organization_id === 'string' &&
        scope.body.organization_id.length > 0 &&
        (response.body.organization_id == null ||
          response.body.organization_id === scope.body.organization_id) &&
        scope.body.project_id === project &&
        scope.body.environment_id === state.identity.id,
      foreign,
      'environment:credential:scope',
    );
    organization = scope.body.organization_id;
  } catch (error) {
    throw refusal(
      'Scoped cloud credential lookup failed; owned cleanup remains required.',
      diagnosticCode(error, 'environment:credential:exception'),
    );
  }
  return { credential, organization };
}

/**
 * Deletes only an attempted, initially verified physical environment and verifies both absences.
 * @param options - Durable state from setup and the broader credential's isolated HTTP boundary.
 * @returns Finite cleanup totals; changed, recycled or unverified identities are retained.
 * @throws When ownership, deletion or exhaustive key/ID absence is not established. The error's
 * static `code` names the first failed check and any received HTTP status.
 */
export async function cleanupCloudEnvironment({ request, state }) {
  const fields = ['schema', 'project', 'key', 'marker', 'attempted', 'identity', 'capture'];
  requireValid(
    state &&
      isDeepStrictEqual(Object.keys(state).sort(), fields.sort()) &&
      state.schema === 1 &&
      typeof state.attempted === 'boolean' &&
      ['unverified', 'verified'].includes(state.capture),
    'Cloud cleanup state is invalid.',
    'environment:cleanup:state',
  );
  ownerInputs(state);
  requireValid(
    typeof request === 'function',
    'Cloud cleanup HTTP boundary is missing.',
    'environment:cleanup:boundary',
  );
  const collection = `/v2/projects/${state.project}/envs`;
  const keyPath = `${collection}/${state.key}`;
  if (!state.attempted || state.capture !== 'verified') {
    const key = await checkedRead(request, keyPath, 'by_key');
    requireValid(
      key.status === 404 && !state.attempted,
      'Cloud cleanup cannot adopt a never-attempted or initially unverified identity.',
      'environment:cleanup:adopt',
    );
    return { registered: 1, completed: 1, verified: 1 };
  }
  requireValid(
    state.identity &&
      isDeepStrictEqual(Object.keys(state.identity).sort(), ['createdAt', 'id']) &&
      /^[a-f0-9-]{32,36}$/u.test(state.identity.id) &&
      Number.isFinite(Date.parse(state.identity.createdAt)),
    'Cloud cleanup identity is invalid.',
    'environment:cleanup:identity',
  );
  const idPath = `${collection}/${state.identity.id}`;
  const [id, key] = await Promise.all([
    checkedRead(request, idPath, 'by_id'),
    checkedRead(request, keyPath, 'by_key'),
  ]);
  if (id.status === 404 && key.status === 404) return { registered: 1, completed: 1, verified: 1 };
  requireValid(
    id.status === 200 &&
      key.status === 200 &&
      isDeepStrictEqual(ownedIdentity(id.body, state, 'by_id'), state.identity) &&
      isDeepStrictEqual(ownedIdentity(key.body, state, 'by_key'), state.identity),
    'Cloud cleanup refused changed or ambiguous ownership.',
    'environment:cleanup:ownership',
  );
  const deleted = await send(
    request,
    { method: 'DELETE', path: idPath },
    'delete',
    'Owned cloud environment deletion failed.',
  );
  requireValid(
    [200, 204, 404].includes(deleted?.status),
    'Owned cloud environment deletion returned an unexpected HTTP status.',
    `environment:http:delete:${httpStatus(deleted)}`,
  );
  const absent = await Promise.all([
    checkedRead(request, idPath, 'by_id'),
    checkedRead(request, keyPath, 'by_key'),
  ]);
  requireValid(
    absent.every((response) => response.status === 404),
    'Owned cloud environment cleanup has not verified key and physical ID absence.',
    'environment:cleanup:absence',
  );
  return { registered: 1, completed: 1, verified: 1 };
}
