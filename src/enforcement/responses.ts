import {
  type IAuthorizedUserAssignment,
  type IAuthorizedUsersResult,
  type IUserPermissions,
  type TenantDetails,
} from '#src/enforcement/interfaces';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (typeof item !== 'string') return false;
  }
  return true;
}

interface TenantDetailsWire extends Record<string, unknown> {
  key: string;
  attributes?: Record<string, unknown>;
}

function isTenantDetails(value: unknown): value is TenantDetailsWire {
  return (
    isRecord(value) &&
    typeof value['key'] === 'string' &&
    (!Object.hasOwn(value, 'attributes') || isRecord(value['attributes']))
  );
}

function isResourceDetails(value: unknown): value is TenantDetailsWire & { type: string } {
  return isTenantDetails(value) && typeof value['type'] === 'string';
}

function normalizeTenant(value: TenantDetailsWire): TenantDetails {
  return { ...value, attributes: value.attributes ?? {} };
}

/** Selects the direct PDP decision or its OPA result envelope without trusting its contents. */
function decisionEnvelope(value: unknown, field: string): Record<string, unknown> {
  if (isRecord(value)) {
    if (Object.hasOwn(value, field)) return value;
    if (isRecord(value['result']) && Object.hasOwn(value['result'], field)) {
      return value['result'];
    }
  }
  throw new Error(`Expected a PDP ${field} field or an OPA result envelope`);
}

/**
 * Reads a literal boolean decision from the PDP or OPA envelope.
 *
 * @param value - Untrusted response body.
 * @returns The validated decision, without truthiness coercion.
 * @throws {Error} If the response does not contain a boolean decision.
 */
export function parseCheckResponse(value: unknown): boolean {
  const decision = decisionEnvelope(value, 'allow')['allow'];
  if (typeof decision !== 'boolean') throw new Error('Expected a boolean allow decision');
  return decision;
}

/**
 * Reads exactly one boolean decision per requested position, preserving order.
 *
 * @param value - Untrusted response body.
 * @param expectedLength - Number of requests sent to the PDP.
 * @returns The positional decisions.
 * @throws {Error} If the envelope, cardinality, or any decision is invalid.
 */
export function parseBulkResponse(value: unknown, expectedLength: number): boolean[] {
  const decisions = decisionEnvelope(value, 'allow')['allow'];
  if (!Array.isArray(decisions) || decisions.length !== expectedLength) {
    throw new Error('Expected one bulk decision per requested check');
  }
  const result: boolean[] = [];
  for (const decision of decisions) {
    if (!isRecord(decision) || typeof decision['allow'] !== 'boolean') {
      throw new Error('Expected a boolean allow decision at every bulk position');
    }
    result.push(decision['allow']);
  }
  return result;
}

function readPermissionEntry(value: unknown): IUserPermissions[string] | undefined {
  if (!isRecord(value)) return undefined;
  const { permissions, roles, tenant, resource, ...additional } = value;
  if (Object.hasOwn(value, 'permissions') && !isStringArray(permissions)) return undefined;
  if (roles !== undefined && roles !== null && !isStringArray(roles)) return undefined;
  if (tenant !== undefined && tenant !== null && !isTenantDetails(tenant)) return undefined;
  if (resource !== undefined && resource !== null && !isResourceDetails(resource)) {
    return undefined;
  }
  // PDP models default missing permissions/attributes and omit nullable optional members.
  return {
    ...additional,
    permissions: isStringArray(permissions) ? permissions : [],
    ...(isStringArray(roles) && { roles }),
    ...(isTenantDetails(tenant) && { tenant: normalizeTenant(tenant) }),
    ...(isResourceDetails(resource) && {
      resource: { ...resource, attributes: resource.attributes ?? {} },
    }),
  };
}

function readPermissionMap(value: unknown): IUserPermissions | undefined {
  if (!isRecord(value)) return undefined;
  const entries: [string, IUserPermissions[string]][] = [];
  for (const [key, entry] of Object.entries(value)) {
    const permissions = readPermissionEntry(entry);
    if (permissions === undefined) return undefined;
    entries.push([key, permissions]);
  }
  // fromEntries retains arbitrary identifiers, including __proto__, as own dictionary keys.
  return Object.fromEntries(entries);
}

/**
 * Reads a permission map, prioritizing legal raw identifiers over OPA envelope detection.
 *
 * @param value - Untrusted response body.
 * @returns Permissions with PDP defaults applied and additive fields preserved.
 * @throws {Error} If the response is not a valid direct or wrapped permission map.
 */
export function parsePermissionsResponse(value: unknown): IUserPermissions {
  const direct = readPermissionMap(value);
  if (direct !== undefined) return direct;
  if (isRecord(value) && isRecord(value['result'])) {
    const wrapped = readPermissionMap(value['result']['permissions']);
    if (wrapped !== undefined) return wrapped;
  }
  throw new Error('Expected a permission map or an OPA result.permissions map');
}

/**
 * Reads only granted tenants; a denied or malformed member invalidates the entire response.
 *
 * @param value - Untrusted response body.
 * @returns Validated tenants with missing attributes defaulted to an empty object.
 * @throws {Error} If any member is malformed or is not explicitly allowed.
 */
export function parseAllTenantsResponse(value: unknown): TenantDetails[] {
  const tenants = decisionEnvelope(value, 'allowed_tenants')['allowed_tenants'];
  if (!Array.isArray(tenants)) throw new Error('Expected an allowed_tenants array');
  const result: TenantDetails[] = [];
  for (const entry of tenants) {
    if (!isRecord(entry) || entry['allow'] !== true || !isTenantDetails(entry['tenant'])) {
      throw new Error('Expected an allowed tenant with allow:true and a string tenant key');
    }
    result.push(normalizeTenant(entry['tenant']));
  }
  return result;
}

/**
 * Reads the complete authorized-user envelope without accepting a partial assignment map.
 *
 * @param value - Untrusted direct PDP response body.
 * @returns The validated result with legal dictionary keys and additive fields preserved.
 * @throws {Error} If a required string, dictionary, array or assignment is malformed.
 */
export function parseAuthorizedUsersResponse(value: unknown): IAuthorizedUsersResult {
  if (
    !isRecord(value) ||
    typeof value['resource'] !== 'string' ||
    typeof value['tenant'] !== 'string' ||
    !isRecord(value['users'])
  ) {
    throw new Error('Expected an authorized-user result with resource, tenant and users');
  }
  const users: [string, IAuthorizedUserAssignment[]][] = [];
  for (const [key, assignments] of Object.entries(value['users'])) {
    if (!Array.isArray(assignments)) throw new Error('Expected an assignment array per user');
    const checked: IAuthorizedUserAssignment[] = [];
    for (const assignment of assignments) {
      if (
        !isRecord(assignment) ||
        typeof assignment['user'] !== 'string' ||
        typeof assignment['tenant'] !== 'string' ||
        typeof assignment['resource'] !== 'string' ||
        typeof assignment['role'] !== 'string'
      ) {
        throw new Error('Expected four string fields in every authorized-user assignment');
      }
      checked.push({
        ...assignment,
        user: assignment['user'],
        tenant: assignment['tenant'],
        resource: assignment['resource'],
        role: assignment['role'],
      });
    }
    users.push([key, checked]);
  }
  return {
    ...value,
    resource: value['resource'],
    tenant: value['tenant'],
    users: Object.fromEntries(users),
  };
}

/**
 * Reads the container PDP's tenant array, applying only its documented attributes default.
 *
 * @param value - Untrusted direct PDP response body.
 * @returns All validated tenants, preserving input order and additive fields.
 * @throws {Error} If the array or any tenant is malformed.
 */
export function parseUserTenantsResponse(value: unknown): TenantDetails[] {
  if (!Array.isArray(value)) throw new Error('Expected a user-tenants array');
  const result: TenantDetails[] = [];
  for (const tenant of value) {
    if (!isTenantDetails(tenant)) throw new Error('Expected a tenant with a string key');
    result.push(normalizeTenant(tenant));
  }
  return result;
}
