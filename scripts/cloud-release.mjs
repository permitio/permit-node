import https from 'node:https';
import { isDeepStrictEqual } from 'node:util';
import { CLOUD_CASES, CLOUD_ORIGIN } from '#scripts/node-acceptance.mjs';

let observing = false;

function requireValid(value, message) {
  if (!value) throw new Error(message);
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
 * @param options - One sequential SDK operation, expected public path and module entry.
 * @returns The result and finite successful request observations; any foreign request refuses.
 */
export async function observeCloudHttps({ invoke, path, caseId, entry }) {
  requireValid(!observing, 'Cloud HTTPS observations must execute sequentially.');
  requireValid(
    CLOUD_CASES.some(
      (row) => row.id === caseId && row.operationKeys[0] === `pdp-cloud POST ${path}`,
    ) && ['esm', 'commonjs'].includes(entry),
    'Cloud HTTPS observation identifiers differ from the public contract.',
  );
  observing = true;
  const original = https.request;
  let attempted = 0;
  let completed = 0;
  let requestIds = 0;
  let rejected = false;
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
      rejected = true;
      throw new Error('Cloud operation attempted an unexpected HTTPS destination or route.');
    }
    attempted++;
    const request = Reflect.apply(original, this, args);
    request.once('response', (response) => {
      if (response.statusCode === 200) completed++;
      else rejected = true;
      const header =
        typeof request.getHeader === 'function' ? request.getHeader('X-Request-ID') : undefined;
      if (typeof header === 'string' && header.length > 0) requestIds++;
    });
    request.once('error', () => {
      rejected = true;
    });
    return request;
  };
  try {
    const result = await invoke();
    requireValid(
      attempted > 0 && completed === attempted && !rejected,
      'Cloud operation lacks complete observed HTTP 200 requests.',
    );
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
      fields.every((field) => /^[a-z][a-z0-9_-]{1,79}$/u.test(fixture[field])) &&
      fixture.allowedUser !== fixture.deniedUser &&
      fixture.tenant !== fixture.otherTenant,
    'Cloud proof requires distinct reviewed fixture keys.',
  );
}

/**
 * Exercises four published managed-cloud operations through both installed package entries.
 * @param options - Installed constructors, scoped credential and independently owned fixture keys.
 * @returns Allowlisted phase, case and HTTPS observations, with no credentials or response bodies.
 */
export async function produceCloudProof({ entries, token, fixture, pause, attempts = 30 }) {
  fixtureKeys(fixture);
  requireValid(
    typeof token === 'string' &&
      /^[\x21-\x7e]+$/u.test(token) &&
      isDeepStrictEqual(
        entries.map((entry) => entry.name),
        ['esm', 'commonjs'],
      ) &&
      entries.every((entry) => typeof entry.Permit === 'function') &&
      typeof pause === 'function' &&
      Number.isSafeInteger(attempts) &&
      attempts > 0 &&
      attempts <= 30,
    'Cloud proof requires both installed entries, a scoped credential and a bounded wait.',
  );
  const totals = new Map(CLOUD_CASES.map((row) => [row.id, 0]));
  const httpObservations = [];
  const options = { throwOnError: true, timeout: 10_000 };
  const resource = { type: fixture.resource, tenant: fixture.tenant };
  const other = { ...resource, tenant: fixture.otherTenant };
  const expect = (id, value) => {
    requireValid(value, 'Cloud response did not match the owned fixture oracle.');
    totals.set(id, totals.get(id) + 1);
  };
  for (const { name, Permit } of entries) {
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
      async () => {
        let ready = false;
        for (let attempt = 0; attempt < attempts; attempt++) {
          const result = await permit.check(
            fixture.allowedUser,
            'read',
            resource,
            undefined,
            options,
          );
          expect('cloud.check', typeof result === 'boolean');
          if (result === true) {
            ready = true;
            break;
          }
          if (attempt + 1 < attempts) await pause(2_000);
        }
        expect('cloud.check', ready);
        for (const [user, action, target] of [
          [fixture.deniedUser, 'read', resource],
          [fixture.allowedUser, 'write', resource],
          [fixture.allowedUser, 'read', other],
        ])
          expect(
            'cloud.check',
            (await permit.check(user, action, target, undefined, options)) === false,
          );
      },
      async () => {
        const allowed = { user: fixture.allowedUser, action: 'read', resource };
        const denied = { user: fixture.deniedUser, action: 'read', resource };
        const input = [allowed, denied, allowed, { ...allowed, resource: other }];
        const before = structuredClone(input);
        const result = await permit.bulkCheck(input, undefined, options);
        expect('cloud.bulkCheck', isDeepStrictEqual(result, [true, false, true, false]));
        expect('cloud.bulkCheck', isDeepStrictEqual(input, before));
      },
      async () => {
        const result = await permit.getAuthorizedUsers('read', resource, undefined, options);
        expect('cloud.getAuthorizedUsers', result?.resource === `${fixture.resource}:*`);
        expect('cloud.getAuthorizedUsers', result?.tenant === fixture.tenant);
        expect(
          'cloud.getAuthorizedUsers',
          isDeepStrictEqual(Object.keys(result?.users ?? {}), [fixture.allowedUser]),
        );
        const grants = result.users[fixture.allowedUser];
        expect('cloud.getAuthorizedUsers', Array.isArray(grants) && grants.length === 1);
        expect(
          'cloud.getAuthorizedUsers',
          grants[0]?.user === fixture.allowedUser &&
            grants[0]?.tenant === fixture.tenant &&
            grants[0]?.role === fixture.role &&
            grants[0]?.resource === `__tenant:${fixture.tenant}`,
        );
        const excluded = await permit.getAuthorizedUsers('read', other, undefined, options);
        expect(
          'cloud.getAuthorizedUsers',
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
        expect('cloud.getUserPermissions', isDeepStrictEqual(Object.keys(result), [key]));
        expect(
          'cloud.getUserPermissions',
          isDeepStrictEqual(result[key]?.permissions, [`${fixture.resource}:read`]),
        );
        expect(
          'cloud.getUserPermissions',
          result[key]?.roles == null || isDeepStrictEqual(result[key].roles, [fixture.role]),
        );
        const details = result[key];
        expect(
          'cloud.getUserPermissions',
          details.tenant == null || details.tenant.key === fixture.tenant,
        );
        expect(
          'cloud.getUserPermissions',
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
        expect('cloud.getUserPermissions', isDeepStrictEqual(filtered, {}));
        const denied = await permit.getUserPermissions(
          fixture.deniedUser,
          [fixture.tenant],
          undefined,
          ['__tenant'],
          options,
        );
        expect('cloud.getUserPermissions', isDeepStrictEqual(denied, {}));
        const excluded = await permit.getUserPermissions(
          fixture.allowedUser,
          [fixture.otherTenant],
          undefined,
          ['__tenant'],
          options,
        );
        expect('cloud.getUserPermissions', isDeepStrictEqual(excluded, {}));
      },
    ];
    for (let index = 0; index < operations.length; index++) {
      const definition = CLOUD_CASES[index];
      const path = definition.operationKeys[0].slice('pdp-cloud POST '.length);
      const observed = await observeCloudHttps({
        invoke: operations[index],
        path,
        caseId: definition.id,
        entry: name,
      });
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
