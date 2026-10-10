import { isDeepStrictEqual } from 'node:util';

export const CONTROL_PLANE_ORIGIN = 'https://api.permit.io';

function requireValid(value, message) {
  if (!value) throw new Error(message);
}

function ownerInputs({ project, key, marker }) {
  requireValid(
    typeof project === 'string' &&
      /^[a-f0-9-]{32,36}$/u.test(project) &&
      typeof key === 'string' &&
      /^node-acceptance-[1-9]\d*-[1-9]\d*$/u.test(key) &&
      marker === `permit-node:release-acceptance:${key}`,
    'Cloud environment ownership inputs are invalid.',
  );
}

function ownedIdentity(body, owner) {
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
  );
  return { id: body.id, createdAt: body.created_at };
}

async function checkedRead(request, path) {
  let response;
  try {
    response = await request({ method: 'GET', path });
  } catch {
    throw new Error('Cloud environment ownership read failed before cleanup.');
  }
  requireValid(
    response?.status === 200 || response?.status === 404,
    'Cloud environment ownership read returned an unexpected HTTP status.',
  );
  return response;
}

/**
 * Registers cleanup before one public create request and captures immutable identity immediately.
 * @param options - Public HTTP boundary and the unique trusted run/attempt ownership marker.
 * @returns Durable cleanup state and scoped credential; never returns a broader credential.
 * @throws When initial identity cannot be captured, cleanup remains permanently unverified.
 */
export async function provisionCloudEnvironment({ request, project, key, marker, save }) {
  const owner = { project, key, marker };
  ownerInputs(owner);
  requireValid(
    typeof request === 'function' && typeof save === 'function',
    'Cloud setup requires a public HTTP boundary and durable state storage.',
  );
  const state = { schema: 1, ...owner, attempted: false, identity: null, capture: 'unverified' };
  await save(structuredClone(state));
  const collection = `/v2/projects/${project}/envs`;
  const keyPath = `${collection}/${key}`;
  const existing = await checkedRead(request, keyPath);
  requireValid(
    existing.status === 404,
    'Cloud environment namespace already exists; setup refused.',
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
      state.identity = ownedIdentity(reply.body, owner);
    const recovered = await checkedRead(request, keyPath);
    if (recovered.status === 404 && !state.identity) {
      throw new Error('Cloud create did not establish an owned environment.');
    }
    requireValid(
      recovered.status === 200,
      'Cloud create acknowledgment is not independently visible.',
    );
    const identity = ownedIdentity(recovered.body, owner);
    requireValid(
      !state.identity || isDeepStrictEqual(state.identity, identity),
      'Cloud create and readback identify different physical environments.',
    );
    state.identity = identity;
    const byId = await checkedRead(request, `${collection}/${identity.id}`);
    requireValid(
      byId.status === 200 && isDeepStrictEqual(ownedIdentity(byId.body, owner), identity),
      'Cloud physical environment readback differs from its initial identity.',
    );
    state.capture = 'verified';
    await save(structuredClone(state));
  } catch {
    state.capture = 'unverified';
    await save(structuredClone(state));
    throw new Error('Cloud setup could not capture immutable ownership; retain the saved state.');
  }
  const scoped = await fetchCloudEnvironmentCredential({ request, state });
  return { state, ...scoped };
}

/**
 * Revalidates immutable ownership before handing one exact environment credential to a candidate.
 * @param options - The initially captured owner and explicit trusted-step HTTP boundary.
 * @returns The environment credential and its independently observed organization identifier.
 * @throws When ownership changed or the fetched credential is broader, foreign or malformed.
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
  );
  const project = state.project;
  const collection = `/v2/projects/${project}/envs`;
  const reads = await Promise.all([
    checkedRead(request, `${collection}/${state.key}`),
    checkedRead(request, `${collection}/${state.identity.id}`),
  ]);
  requireValid(
    reads.every(
      (row) =>
        row.status === 200 && isDeepStrictEqual(ownedIdentity(row.body, state), state.identity),
    ),
    'Cloud credential handoff refused changed or ambiguous environment ownership.',
  );
  let credential, organization;
  try {
    const response = await request({
      method: 'GET',
      path: `/v2/api-key/${project}/${state.identity.id}`,
    });
    requireValid(
      response?.status === 200 &&
        typeof response.body?.secret === 'string' &&
        /^[\x21-\x7e]+$/u.test(response.body.secret) &&
        (response.body.project_id == null || response.body.project_id === project) &&
        (response.body.environment_id == null ||
          response.body.environment_id === state.identity.id) &&
        (response.body.object_type == null || response.body.object_type === 'env'),
      'Scoped cloud credential is unavailable.',
    );
    credential = response.body.secret;
    const scope = await request({ method: 'GET', path: '/v2/api-key/scope', credential });
    requireValid(
      scope?.status === 200 &&
        typeof scope.body?.organization_id === 'string' &&
        scope.body.organization_id.length > 0 &&
        (response.body.organization_id == null ||
          response.body.organization_id === scope.body.organization_id) &&
        scope.body.project_id === project &&
        scope.body.environment_id === state.identity.id,
      'Fetched cloud credential does not belong exclusively to the captured environment.',
    );
    organization = scope.body.organization_id;
  } catch {
    throw new Error('Scoped cloud credential lookup failed; owned cleanup remains required.');
  }
  return { credential, organization };
}

/**
 * Deletes only an attempted, initially verified physical environment and verifies both absences.
 * @param options - Durable state from setup and the broader credential's isolated HTTP boundary.
 * @returns Finite cleanup totals; changed, recycled or unverified identities are retained.
 * @throws When ownership, deletion or exhaustive key/ID absence is not established.
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
  );
  ownerInputs(state);
  requireValid(typeof request === 'function', 'Cloud cleanup HTTP boundary is missing.');
  const collection = `/v2/projects/${state.project}/envs`;
  const keyPath = `${collection}/${state.key}`;
  if (!state.attempted || state.capture !== 'verified') {
    const key = await checkedRead(request, keyPath);
    requireValid(
      key.status === 404 && !state.attempted,
      'Cloud cleanup cannot adopt a never-attempted or initially unverified identity.',
    );
    return { registered: 1, completed: 1, verified: 1 };
  }
  requireValid(
    state.identity &&
      isDeepStrictEqual(Object.keys(state.identity).sort(), ['createdAt', 'id']) &&
      /^[a-f0-9-]{32,36}$/u.test(state.identity.id) &&
      Number.isFinite(Date.parse(state.identity.createdAt)),
    'Cloud cleanup identity is invalid.',
  );
  const idPath = `${collection}/${state.identity.id}`;
  const [id, key] = await Promise.all([
    checkedRead(request, idPath),
    checkedRead(request, keyPath),
  ]);
  if (id.status === 404 && key.status === 404) return { registered: 1, completed: 1, verified: 1 };
  requireValid(
    id.status === 200 &&
      key.status === 200 &&
      isDeepStrictEqual(ownedIdentity(id.body, state), state.identity) &&
      isDeepStrictEqual(ownedIdentity(key.body, state), state.identity),
    'Cloud cleanup refused changed or ambiguous ownership.',
  );
  let deleted;
  try {
    deleted = await request({ method: 'DELETE', path: idPath });
  } catch {
    throw new Error('Owned cloud environment deletion failed.');
  }
  requireValid(
    [200, 204, 404].includes(deleted?.status),
    'Owned cloud environment deletion returned an unexpected HTTP status.',
  );
  const absent = await Promise.all([checkedRead(request, idPath), checkedRead(request, keyPath)]);
  requireValid(
    absent.every((response) => response.status === 404),
    'Owned cloud environment cleanup has not verified key and physical ID absence.',
  );
  return { registered: 1, completed: 1, verified: 1 };
}
