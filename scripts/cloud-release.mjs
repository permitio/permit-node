import https from 'node:https';
import { isDeepStrictEqual } from 'node:util';
import { CLOUD_CASES, CLOUD_ORIGIN } from '#scripts/node-acceptance.mjs';

let observing = false;
const caseLabels = new Map([
  ['cloud.check', 'check'],
  ['cloud.bulkCheck', 'bulk-check'],
  ['cloud.getAuthorizedUsers', 'authorized-users'],
  ['cloud.getUserPermissions', 'user-permissions'],
]);
const timeoutCodes = ['ECONNABORTED', 'ETIMEDOUT'];
const networkCodes = [
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ERR_NETWORK',
];
const operationFailure = 'Cloud SDK operation did not satisfy the owned fixture proof.';

function refusal(message, code) {
  return Object.assign(new Error(message), { code });
}
function requireValid(value, message, code) {
  if (!value) throw refusal(message, code);
}
function proofCode(error) {
  return typeof error?.code === 'string' && error.code.startsWith('cloud-proof:')
    ? error.code
    : undefined;
}
function httpStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 'invalid';
}
function operationCode(caseId, entry, ...details) {
  const label = caseLabels.get(caseId) ?? 'unknown';
  const format = ['esm', 'commonjs'].includes(entry) ? entry : 'unknown';
  return ['cloud-proof', 'op', label, format, ...details].join(':');
}
/** Readiness may retry only these transport responses; any other non-200 is refused. */
function transientStatus(status) {
  return status === 404 || status === 429 || (status >= 500 && status <= 599);
}
/**
 * Classifies an SDK failure from the installed entry's error classes and codes, never messages.
 * @param error - A failure thrown by one installed entry's SDK call.
 * @param entry - That entry's exported SDK error classes.
 * @returns A static kind and, for PDP status errors, the received HTTP status.
 */
function sdkFailure(error, entry) {
  if (error instanceof entry.PermitPDPStatusError)
    return ['pdp-status', httpStatus(error.statusCode)];
  if (error instanceof entry.PermitConnectionError) {
    if (timeoutCodes.includes(error.code)) return ['timeout'];
    if (networkCodes.includes(error.code)) return ['network'];
  }
  return ['exception'];
}
function transientFailure([kind, status]) {
  return (
    kind === 'timeout' || kind === 'network' || (kind === 'pdp-status' && transientStatus(status))
  );
}

function requestDestination(args) {
  const first = args[0];
  const url = typeof first === 'string' || first instanceof URL ? new URL(first) : undefined;
  const options = url ? (typeof args[1] === 'object' ? args[1] : {}) : first;
  requireValid(options && typeof options === 'object', 'Cloud request options are missing.');
  return {
    protocol: options.protocol ?? url?.protocol ?? 'https:',
    hostname: options.hostname ?? options.host ?? url?.hostname,
    port: String(options.port ?? url?.port ?? ''),
    path: options.path ?? (url && `${url.pathname}${url.search}`),
    method: options.method ?? 'GET',
    credentials: Boolean(url?.username || url?.password),
  };
}

/**
 * Observes actual HTTPS requests without modifying SDK headers, bodies or responses.
 * In readiness mode, requests issued before `ready()` may end in a timeout, network error or a
 * 404, 429 or 5xx response; those are counted as `readinessFailures`. The request that preceded
 * `ready()` and every later request must return HTTP 200.
 * @param options - One sequential SDK operation, expected public path, module entry and whether
 * the first check readiness phase applies.
 * @returns The result and finite request observations; any foreign request refuses.
 * @throws With a static `code` naming the operation, entry and failed observation rule.
 */
export async function observeCloudHttps({ invoke, path, caseId, entry, readiness = false }) {
  requireValid(
    !observing,
    'Cloud HTTPS observations must execute sequentially.',
    'cloud-proof:observe:sequential',
  );
  requireValid(
    CLOUD_CASES.some(
      (row) => row.id === caseId && row.operationKeys[0] === `pdp-cloud POST ${path}`,
    ) &&
      ['esm', 'commonjs'].includes(entry) &&
      (!readiness || caseId === 'cloud.check'),
    'Cloud HTTPS observation identifiers differ from the public contract.',
    'cloud-proof:observe:identifiers',
  );
  observing = true;
  const original = https.request;
  const observation = (detail) => operationCode(caseId, entry, 'observation', detail);
  let attempted = 0;
  let completed = 0;
  let readinessFailures = 0;
  let requestIds = 0;
  let rejection;
  let unexpected = false;
  let waiting = readiness;
  let latest;
  https.request = function observedRequest(...args) {
    const destination = requestDestination(args);
    if (
      destination.protocol !== 'https:' ||
      destination.hostname !== new URL(CLOUD_ORIGIN).hostname ||
      !['', '443'].includes(destination.port) ||
      destination.path !== path ||
      destination.method !== 'POST' ||
      destination.credentials
    ) {
      unexpected = true;
      throw refusal(
        'Cloud operation attempted an unexpected HTTPS destination or route.',
        observation('destination'),
      );
    }
    attempted++;
    const during = waiting;
    const outcome = {};
    latest = outcome;
    const request = Reflect.apply(original, this, args);
    const header =
      typeof request.getHeader === 'function' ? request.getHeader('X-Request-ID') : undefined;
    if (typeof header === 'string' && header.length > 0) requestIds++;
    request.once('response', (response) => {
      outcome.status = response.statusCode;
      if (response.statusCode === 200) completed++;
      else if (during && transientStatus(response.statusCode)) readinessFailures++;
      else rejection ??= httpStatus(response.statusCode);
    });
    request.once('error', () => {
      if (during && outcome.status === undefined) {
        outcome.status = 'request-error';
        readinessFailures++;
      } else if (!during) rejection ??= 'request-error';
    });
    return request;
  };
  const phase = {
    ready() {
      const status = latest?.status;
      requireValid(
        status === 200,
        'Cloud readiness did not end with an observed HTTP 200 request.',
        observation(typeof status === 'number' ? httpStatus(status) : (status ?? 'readiness')),
      );
      waiting = false;
    },
  };
  try {
    let result;
    try {
      result = await invoke(phase);
    } catch (error) {
      if (unexpected)
        throw refusal(
          'Cloud operation attempted an unexpected HTTPS destination or route.',
          observation('destination'),
        );
      throw error;
    }
    const message = 'Cloud operation lacks complete observed HTTP 200 requests.';
    requireValid(!waiting, message, observation('readiness'));
    requireValid(attempted > 0, message, observation('empty'));
    requireValid(rejection === undefined, message, observation(rejection));
    requireValid(completed + readinessFailures === attempted, message, observation('incomplete'));
    return {
      result,
      observation: {
        caseId,
        entry,
        method: 'POST',
        path,
        origin: CLOUD_ORIGIN,
        status: 200,
        requests: completed,
        requestIdPresent: requestIds === attempted,
        readinessFailures,
      },
    };
  } finally {
    https.request = original;
    observing = false;
  }
}

function fixtureKeys(fixture) {
  const fields = ['allowedUser', 'deniedUser', 'tenant', 'otherTenant', 'resource', 'role'];
  requireValid(
    fixture &&
      isDeepStrictEqual(Object.keys(fixture).sort(), fields.sort()) &&
      fields.every(
        (field) =>
          typeof fixture[field] === 'string' && /^[a-z][a-z0-9_-]{1,79}$/u.test(fixture[field]),
      ) &&
      fixture.allowedUser !== fixture.deniedUser &&
      fixture.tenant !== fixture.otherTenant,
    'Cloud proof requires distinct reviewed fixture keys.',
    'cloud-proof:fixture:keys',
  );
}

/**
 * Exercises four published managed-cloud operations through both installed package entries.
 * Only the first check's convergence loop treats timeouts, transient network errors and PDP
 * 404, 429 or 5xx responses as not ready; every other failure and every later request is strict.
 * @param options - Installed constructors and SDK error classes, scoped credential, independently
 * owned fixture keys and the bounded readiness wait.
 * @returns Allowlisted phase, case and HTTPS observations, with no credentials or response bodies.
 * @throws With a constant message whose static `code` names the operation, entry, failure kind
 * and HTTP status or oracle index; SDK messages and response bodies are never copied.
 */
export async function produceCloudProof({ entries, token, fixture, pause, attempts = 30 }) {
  fixtureKeys(fixture);
  requireValid(
    typeof token === 'string' && /^[\x21-\x7e]+$/u.test(token),
    'Cloud proof requires a scoped credential.',
    'cloud-proof:credential:token',
  );
  requireValid(
    isDeepStrictEqual(
      entries.map((entry) => entry.name),
      ['esm', 'commonjs'],
    ) &&
      entries.every(
        (entry) =>
          typeof entry.Permit === 'function' &&
          typeof entry.PermitConnectionError === 'function' &&
          typeof entry.PermitPDPStatusError === 'function',
      ),
    'Cloud proof requires both installed entries and their SDK error classes.',
    'cloud-proof:entries:shape',
  );
  requireValid(
    typeof pause === 'function' && Number.isSafeInteger(attempts) && attempts > 0 && attempts <= 30,
    'Cloud proof requires a bounded readiness wait.',
    'cloud-proof:wait:bounds',
  );
  const totals = new Map(CLOUD_CASES.map((row) => [row.id, 0]));
  const httpObservations = [];
  const options = { throwOnError: true, timeout: 10_000 };
  const resource = { type: fixture.resource, tenant: fixture.tenant };
  const other = { ...resource, tenant: fixture.otherTenant };
  for (const entry of entries) {
    const { name, Permit } = entry;
    const expect = (id, index, value, code = operationCode(id, name, 'oracle', index)) => {
      requireValid(value, 'Cloud response did not match the owned fixture oracle.', code);
      totals.set(id, totals.get(id) + 1);
    };
    const permit = new Permit({
      token,
      pdp: CLOUD_ORIGIN,
      timeout: 10_000,
      throwOnError: true,
      retry: false,
      pdpRetry: false,
      log: { level: 'silent' },
    });
    const operations = [
      async (phase) => {
        let ready = false;
        let last = [];
        for (let attempt = 0; attempt < attempts; attempt++) {
          let result, failure;
          try {
            result = await permit.check(fixture.allowedUser, 'read', resource, undefined, options);
          } catch (error) {
            failure = sdkFailure(error, entry);
          }
          if (failure) {
            last = failure;
            if (!transientFailure(failure))
              throw refusal(operationFailure, operationCode('cloud.check', name, ...failure));
          } else {
            expect('cloud.check', 0, typeof result === 'boolean');
            if (result === true) {
              ready = true;
              break;
            }
            last = ['denied'];
          }
          if (attempt + 1 < attempts) await pause(2_000);
        }
        expect('cloud.check', 1, ready, operationCode('cloud.check', name, 'not-ready', ...last));
        phase.ready();
        for (const [user, action, target] of [
          [fixture.deniedUser, 'read', resource],
          [fixture.allowedUser, 'write', resource],
          [fixture.allowedUser, 'read', other],
        ])
          expect(
            'cloud.check',
            2,
            (await permit.check(user, action, target, undefined, options)) === false,
          );
      },
      async () => {
        const allowed = { user: fixture.allowedUser, action: 'read', resource };
        const denied = { user: fixture.deniedUser, action: 'read', resource };
        const input = [allowed, denied, allowed, { ...allowed, resource: other }];
        const before = structuredClone(input);
        const result = await permit.bulkCheck(input, undefined, options);
        expect('cloud.bulkCheck', 0, isDeepStrictEqual(result, [true, false, true, false]));
        expect('cloud.bulkCheck', 1, isDeepStrictEqual(input, before));
      },
      async () => {
        const result = await permit.getAuthorizedUsers('read', resource, undefined, options);
        expect('cloud.getAuthorizedUsers', 0, result?.resource === `${fixture.resource}:*`);
        expect('cloud.getAuthorizedUsers', 1, result?.tenant === fixture.tenant);
        expect(
          'cloud.getAuthorizedUsers',
          2,
          isDeepStrictEqual(Object.keys(result?.users ?? {}), [fixture.allowedUser]),
        );
        const grants = result.users[fixture.allowedUser];
        expect('cloud.getAuthorizedUsers', 3, Array.isArray(grants) && grants.length === 1);
        expect(
          'cloud.getAuthorizedUsers',
          4,
          grants[0]?.user === fixture.allowedUser &&
            grants[0]?.tenant === fixture.tenant &&
            grants[0]?.role === fixture.role &&
            grants[0]?.resource === `__tenant:${fixture.tenant}`,
        );
        const excluded = await permit.getAuthorizedUsers('read', other, undefined, options);
        expect(
          'cloud.getAuthorizedUsers',
          5,
          excluded?.resource === `${fixture.resource}:*` &&
            excluded?.tenant === fixture.otherTenant &&
            isDeepStrictEqual(excluded?.users, {}),
        );
      },
      async () => {
        const result = await permit.getUserPermissions(
          fixture.allowedUser,
          [fixture.tenant],
          undefined,
          ['__tenant'],
          options,
        );
        const key = `__tenant:${fixture.tenant}`;
        expect('cloud.getUserPermissions', 0, isDeepStrictEqual(Object.keys(result), [key]));
        expect(
          'cloud.getUserPermissions',
          1,
          isDeepStrictEqual(result[key]?.permissions, [`${fixture.resource}:read`]),
        );
        expect(
          'cloud.getUserPermissions',
          2,
          result[key]?.roles == null || isDeepStrictEqual(result[key].roles, [fixture.role]),
        );
        const details = result[key];
        expect(
          'cloud.getUserPermissions',
          3,
          details.tenant == null || details.tenant.key === fixture.tenant,
        );
        expect(
          'cloud.getUserPermissions',
          4,
          details.resource == null ||
            (details.resource.type === '__tenant' && details.resource.key === fixture.tenant),
        );
        const filtered = await permit.getUserPermissions(
          fixture.allowedUser,
          [fixture.tenant],
          undefined,
          [fixture.resource],
          options,
        );
        expect('cloud.getUserPermissions', 5, isDeepStrictEqual(filtered, {}));
        const denied = await permit.getUserPermissions(
          fixture.deniedUser,
          [fixture.tenant],
          undefined,
          ['__tenant'],
          options,
        );
        expect('cloud.getUserPermissions', 6, isDeepStrictEqual(denied, {}));
        const excluded = await permit.getUserPermissions(
          fixture.allowedUser,
          [fixture.otherTenant],
          undefined,
          ['__tenant'],
          options,
        );
        expect('cloud.getUserPermissions', 7, isDeepStrictEqual(excluded, {}));
      },
    ];
    for (let index = 0; index < operations.length; index++) {
      const definition = CLOUD_CASES[index];
      const path = definition.operationKeys[0].slice('pdp-cloud POST '.length);
      let observed;
      try {
        observed = await observeCloudHttps({
          invoke: operations[index],
          path,
          caseId: definition.id,
          entry: name,
          readiness: definition.id === 'cloud.check',
        });
      } catch (error) {
        throw refusal(
          operationFailure,
          proofCode(error) ?? operationCode(definition.id, name, ...sdkFailure(error, entry)),
        );
      }
      httpObservations.push(observed.observation);
    }
  }
  const phaseResults = CLOUD_CASES.map((definition) => ({
    id: definition.id,
    kind: 'pdp',
    status: 'PASSED',
    assertions: totals.get(definition.id),
  }));
  const caseResults = CLOUD_CASES.map((definition) => ({
    ...definition,
    phaseId: definition.id,
    status: 'PASSED',
    assertions: totals.get(definition.id),
  }));
  return { phaseResults, caseResults, httpObservations };
}
