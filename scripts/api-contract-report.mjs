import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonical, compareStrings, digest } from '#scripts/api-contracts.mjs';

const verbs = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const annotations = new Set([
  'title',
  'description',
  'summary',
  'example',
  'examples',
  'externalDocs',
]);
const dictionaries = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
  'dependentRequired',
  'schemas',
  'securitySchemes',
  'parameters',
  'requestBodies',
  'responses',
  'headers',
  'content',
  'encoding',
  'links',
  'callbacks',
  'pathItems',
  'paths',
  'webhooks',
  'mapping',
  'scopes',
  'variables',
]);
const literalValues = new Set(['default', 'const', 'enum', 'security']);
const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
export const routeKey = (operation) => `${operation.method} ${operation.path}`;

/** Removes documentation annotations while preserving property names and literal defaults. */
export function contractShape(value, names = false) {
  if (Array.isArray(value)) return value.map((item) => contractShape(item));
  if (!value || typeof value !== 'object') return value;
  return canonical(
    Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => names || !annotations.has(key))
        .map(([key, entry]) => [
          key,
          !names && (literalValues.has(key) || key.startsWith('x-'))
            ? entry
            : contractShape(entry, !names && dictionaries.has(key)),
        ]),
    ),
  );
}

function validateServers(servers, context) {
  if (servers === undefined) return;
  if (!Array.isArray(servers) || servers.some((server) => !isMap(server) || !nonempty(server.url)))
    throw new Error(`${context}: servers must be an array of objects with nonempty URLs.`);
}

/** Enumerates supported OpenAPI structures; empty or unsupported route inputs cannot pass. */
export function specInventory(spec, source) {
  if (
    !isMap(spec) ||
    typeof spec.openapi !== 'string' ||
    !/^3\.\d+\.\d+$/.test(spec.openapi) ||
    !isMap(spec.paths) ||
    !isMap(spec.components?.schemas)
  )
    throw new Error(`${source}: expected an OpenAPI 3 document with paths and schemas.`);
  validateServers(spec.servers, source);
  const operations = [];
  const ids = new Set();
  for (const [path, item] of Object.entries(spec.paths)) {
    if (!isMap(item)) throw new Error(`${source}: path ${path} is not an object.`);
    if (Object.hasOwn(item, '$ref'))
      throw new Error(
        `${source}: referenced Path Item ${path} is unsupported; review and resolve its routes before adoption.`,
      );
    validateServers(item.servers, `${source}: path ${path}`);
    if (item.parameters !== undefined && !Array.isArray(item.parameters))
      throw new Error(`${source}: path ${path} parameters must be an array.`);
    if (!path.startsWith('/')) throw new Error(`${source}: invalid API path ${path}.`);
    for (const [method, operation] of Object.entries(item)) {
      if (!verbs.has(method)) continue;
      if (
        !isMap(operation) ||
        !nonempty(operation.operationId) ||
        ids.has(operation.operationId) ||
        !isMap(operation.responses) ||
        !Object.keys(operation.responses).length
      )
        throw new Error(`${source}: operation ${method} ${path} has no unique ID/responses.`);
      validateServers(operation.servers, `${source}: ${method} ${path}`);
      if (operation.requestBody !== undefined && !isMap(operation.requestBody))
        throw new Error(`${source}: ${method} ${path} requestBody must be an object.`);
      if (operation.deprecated !== undefined && typeof operation.deprecated !== 'boolean')
        throw new Error(`${source}: ${method} ${path} deprecated must be boolean.`);
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!isMap(response) || (status !== 'default' && !/^[1-5][0-9X]{2}$/.test(status)))
          throw new Error(`${source}: invalid response map for ${method} ${path}.`);
        for (const field of ['headers', 'content']) {
          if (response[field] !== undefined && !isMap(response[field]))
            throw new Error(`${source}: invalid response ${field} for ${method} ${path}.`);
        }
      }
      if (operation.parameters !== undefined && !Array.isArray(operation.parameters))
        throw new Error(`${source}: ${method} ${path} parameters must be an array.`);
      if (
        operation.tags !== undefined &&
        (!Array.isArray(operation.tags) || operation.tags.some((tag) => typeof tag !== 'string'))
      )
        throw new Error(`${source}: ${method} ${path} tags must be string arrays.`);
      for (const parameter of [...(item.parameters ?? []), ...(operation.parameters ?? [])]) {
        if (!isMap(parameter))
          throw new Error(`${source}: invalid parameter object for ${method} ${path}.`);
      }
      ids.add(operation.operationId);
      const tags = operation.tags ?? [];
      const lifecycle = operation.deprecated
        ? 'deprecated'
        : /\bEAP\b/.test([...tags, operation.summary ?? ''].join(' '))
          ? 'EAP'
          : 'GA';
      operations.push({
        source,
        method: method.toUpperCase(),
        path,
        id: operation.operationId,
        tags,
        lifecycle,
        contract: contractShape({
          parameters: [...(item.parameters ?? []), ...(operation.parameters ?? [])],
          requestBody: operation.requestBody ?? null,
          responses: operation.responses,
          security: operation.security ?? spec.security ?? [],
          serverRouting: {
            path: item.servers ?? null,
            operation: operation.servers ?? null,
            effective: operation.servers ?? item.servers ?? spec.servers ?? [],
          },
        }),
      });
    }
  }
  if (!operations.length || !Object.keys(spec.components.schemas).length)
    throw new Error(`${source}: operation or schema inventory is empty.`);
  function validateRefs(value, names = false) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item) => validateRefs(item));
      return;
    }
    if (!names && Object.hasOwn(value, '$ref')) {
      if (typeof value.$ref !== 'string' || !value.$ref.startsWith('#/'))
        throw new Error(`${source}: unsupported external reference.`);
      const target = value.$ref
        .slice(2)
        .split('/')
        .reduce((parent, key) => {
          const name = key.replace(/~1/g, '/').replace(/~0/g, '~');
          return parent && typeof parent === 'object' && Object.hasOwn(parent, name)
            ? parent[name]
            : undefined;
        }, spec);
      if (target === undefined) throw new Error(`${source}: unresolved ${value.$ref}.`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (names || (!annotations.has(key) && !literalValues.has(key) && !key.startsWith('x-')))
        validateRefs(child, !names && dictionaries.has(key));
    }
  }
  validateRefs(spec);
  return {
    operations: operations.sort((a, b) => compareStrings(routeKey(a), routeKey(b))),
    schemas: contractShape(spec.components.schemas, true),
    document: contractShape({
      openapi: spec.openapi,
      securitySchemes: spec.components.securitySchemes ?? {},
      reusable: Object.fromEntries(
        Object.entries(spec.components).filter(
          ([key]) => key !== 'schemas' && key !== 'securitySchemes',
        ),
      ),
      jsonSchemaDialect: spec.jsonSchemaDialect ?? null,
      servers: spec.servers ?? [],
    }),
    counts: {
      paths: Object.keys(spec.paths).length,
      operations: operations.length,
      schemas: Object.keys(spec.components.schemas).length,
    },
  };
}

/** Loads immutable reviewed source documents, checking hashes and every denominator. */
export function loadContractSources(root) {
  const provenance = JSON.parse(readFileSync(join(root, 'api-coverage/sources.json'), 'utf8'));
  const sources = {};
  for (const record of provenance.sources) {
    if (sources[record.name]) throw new Error(`Duplicate source ${record.name}.`);
    const bytes = readFileSync(join(root, record.file));
    if (createHash('sha256').update(bytes).digest('hex') !== record.sha256)
      throw new Error(
        `${record.name}: snapshot hash changed without a reviewed provenance update.`,
      );
    const inventory = specInventory(JSON.parse(bytes), record.name);
    if (digest(inventory.counts) !== digest(record.counts))
      throw new Error(`${record.name}: reviewed denominator differs from the source document.`);
    sources[record.name] = inventory;
  }
  if (Object.keys(sources).sort().join(',') !== 'control-plane,pdp-cloud,pdp-container')
    throw new Error('Control-plane, container PDP and cloud PDP source inventories are required.');
  return { provenance, sources };
}

/** Captures route, signature and model semantics without unstable source line numbers. */
export function sdkSnapshot(sdk) {
  const route = (value) =>
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'source'));
  return canonical({
    generated: Object.fromEntries(
      sdk.generated.map((entry) => [entry.generatedMethod, route(entry)]),
    ),
    methods: Object.fromEntries(
      [...sdk.methods, ...sdk.helpers].map((entry) => [
        entry.name,
        {
          deprecated: entry.deprecated,
          factsProxy: entry.factsProxy,
          signature: entry.signature,
          publicSignatures: entry.publicSignatures,
          routes: entry.routes
            .map((call) =>
              call.generatedMethod
                ? {
                    generatedMethod: call.generatedMethod,
                    method: call.method,
                    path: call.path,
                    supporting: call.supporting ?? false,
                  }
                : route(call),
            )
            .sort((a, b) => compareStrings(routeKey(a), routeKey(b))),
        },
      ]),
    ),
    modelShapes: sdk.modelShapes,
    authoredShapes: sdk.authoredShapes,
    generatedRequestShapes: sdk.generatedRequestShapes,
    functionShapes: sdk.functionShapes,
    initializationShapes: sdk.initializationShapes,
    implementationShapes: sdk.implementationShapes,
    authoredClassShapes: sdk.authoredClassShapes,
    generatedSupportShapes: sdk.generatedSupportShapes,
    transports: sdk.transports,
  });
}

/** Reports semantic changes with JSON pointers, preserving array and literal semantics. */
export function compareShapes(expected, actual, path = '', differences = []) {
  if (Object.is(expected, actual)) return differences;
  if (expected === undefined || actual === undefined) {
    differences.push({
      kind: expected === undefined ? 'added' : 'removed',
      path,
      expected,
      actual,
    });
    return differences;
  }
  if (digest(expected) === digest(actual)) return differences;
  if (
    expected &&
    actual &&
    !Array.isArray(expected) &&
    !Array.isArray(actual) &&
    typeof expected === 'object' &&
    typeof actual === 'object'
  ) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      const pointer = `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      if (!Object.hasOwn(actual, key))
        differences.push({ kind: 'removed', path: pointer, expected: expected[key] });
      else if (!Object.hasOwn(expected, key))
        differences.push({ kind: 'added', path: pointer, actual: actual[key] });
      else compareShapes(expected[key], actual[key], pointer, differences);
    }
  } else differences.push({ kind: 'changed', path, expected, actual });
  return differences;
}

export function sourceSnapshot(inventory) {
  return canonical({
    operations: inventory.operations.map((operation) => `${operation.id} ${routeKey(operation)}`),
    contracts: Object.fromEntries(
      inventory.operations.map((operation) => [routeKey(operation), operation.contract]),
    ),
    schemas: inventory.schemas,
    document: inventory.document,
    counts: inventory.counts,
  });
}

function operationDecision(decisions, source, operation) {
  return decisions.operations[`${source} ${routeKey(operation)}`];
}

/** Builds operation evidence without turning source/type checks into backend execution claims. */
export function coverageReport({ sdk, sources, provenance, decisions, baseline }) {
  if (
    !sdk.methods.length ||
    !sdk.generated.length ||
    !Object.keys(sdk.modelShapes).length ||
    !Object.keys(baseline.sdk?.methods ?? {}).length ||
    !Object.keys(baseline.sdk?.generated ?? {}).length ||
    !Object.keys(baseline.sdk?.modelShapes ?? {}).length
  )
    throw new Error(
      'SDK extraction and reviewed baseline must contain methods, routes and models.',
    );
  const failures = [];
  const sourceDrift = [];
  const rows = [];
  const usedDecisions = new Set();
  const snapshot = sdkSnapshot(sdk);
  for (const difference of compareShapes(baseline.sdk, snapshot, '/sdk'))
    failures.push({
      ...difference,
      reason: 'SDK route or declared shape changed; review its contract baseline.',
    });
  const generated = new Set(sdk.generated.map(routeKey));
  const aliases = provenance.containerFactsAlias;
  const allMethods = [...sdk.methods, ...sdk.helpers];
  const runtime = { status: 'NOT_MEASURED', reason: 'This command performs no backend requests.' };
  for (const [source, inventory] of Object.entries(sources)) {
    for (const operation of inventory.operations) {
      const key = `${source} ${routeKey(operation)}`;
      const decision = operationDecision(decisions, source, operation);
      usedDecisions.add(key);
      if (
        !decision ||
        !['add', 'defer', 'exclude', 'undecided', 'retain'].includes(decision.action) ||
        !nonempty(decision.reason) ||
        !nonempty(decision.owner) ||
        !nonempty(decision.source)
      )
        failures.push({
          kind: 'undecided-operation',
          path: key,
          reason: 'No reviewed operation decision with an owner and reason.',
        });
      else if (decision.lifecycle !== operation.lifecycle)
        failures.push({
          kind: 'stale-decision',
          path: key,
          reason: 'Operation lifecycle changed; review the decision.',
        });
      const methods = [];
      const supporting = [];
      for (const method of sdk.methods) {
        for (const call of method.routes) {
          let matches = false;
          let mode = 'control-plane';
          if (source === 'control-plane' && !call.target)
            matches = routeKey(call) === routeKey(operation);
          else if (source.startsWith('pdp-') && call.target === 'pdp') {
            matches = routeKey(call) === routeKey(operation);
            mode = source;
          } else if (
            source === 'pdp-container' &&
            method.factsProxy &&
            !call.supporting &&
            !call.target &&
            call.path.startsWith(aliases.from + '/')
          ) {
            const path = aliases.to + call.path.slice(aliases.from.length);
            matches = call.method === operation.method && path === operation.path;
            mode = 'container-facts-compatibility-alias';
          }
          if (matches)
            (call.supporting ? supporting : methods).push({
              name: method.name,
              deprecated: method.deprecated,
              mode,
              source: method.source,
            });
        }
      }
      const exposed = methods.length > 0;
      if (exposed && decision?.action === 'exclude')
        failures.push({
          kind: 'stale-exclusion',
          path: key,
          reason: 'The excluded operation now has a public SDK method.',
        });
      const coverage = exposed
        ? methods.every((method) => method.deprecated)
          ? 'deprecated-only'
          : 'exposed'
        : supporting.length
          ? 'supporting-only'
          : source === 'control-plane' && generated.has(routeKey(operation))
            ? 'generated-only'
            : 'missing';
      rows.push({
        ...operation,
        contract: undefined,
        coverage,
        decision: decision ?? null,
        methods,
        supporting,
        runtime,
      });
    }
    const expected = baseline.sources[source];
    const countChanges = compareShapes(
      expected?.counts,
      inventory.counts,
      `/sources/${source}/counts`,
    );
    sourceDrift.push(...countChanges);
    failures.push(
      ...countChanges.map((change) => ({
        ...change,
        reason: 'Published path, operation or schema denominator changed; review source drift.',
      })),
    );
    const documentChanges = compareShapes(
      expected?.document,
      inventory.document,
      `/sources/${source}/document`,
    );
    sourceDrift.push(...documentChanges);
    failures.push(
      ...documentChanges.map((change) => ({
        ...change,
        reason: 'OpenAPI version or authentication scheme changed; review source drift.',
      })),
    );
    const changes = compareShapes(
      expected?.contracts,
      sourceSnapshot(inventory).contracts,
      `/sources/${source}/contracts`,
    );
    sourceDrift.push(...changes);
    failures.push(
      ...changes.map((change) => ({
        ...change,
        reason: 'Published request, response, or model shape changed; review source drift.',
      })),
    );
    const schemaChanges = compareShapes(
      expected?.schemas,
      inventory.schemas,
      `/sources/${source}/schemas`,
    );
    sourceDrift.push(...schemaChanges);
    failures.push(
      ...schemaChanges.map((change) => ({
        ...change,
        reason: 'Published schema changed; review source drift.',
      })),
    );
    const expectedRoutes = expected?.operations ?? [];
    const actualRoutes = inventory.operations.map(
      (operation) => `${operation.id} ${routeKey(operation)}`,
    );
    if (digest(expectedRoutes) !== digest(actualRoutes))
      failures.push({
        kind: 'denominator-drift',
        path: source,
        expected: expectedRoutes,
        actual: actualRoutes,
        reason: 'Published operation inventory changed; review additions and removals explicitly.',
      });
  }
  for (const key of Object.keys(decisions.operations)) {
    if (!usedDecisions.has(key))
      failures.push({
        kind: 'stale-decision',
        path: key,
        reason: 'The decision refers to an operation absent from the source inventory.',
      });
  }
  for (const method of sdk.helpers) {
    if (!nonempty(decisions.helpers[method.name]))
      failures.push({
        kind: 'unresolved-public-method',
        path: method.name,
        reason: 'No extracted HTTP route and no reviewed local-helper reason.',
      });
  }
  for (const name of Object.keys(decisions.helpers)) {
    if (!sdk.helpers.some((method) => method.name === name))
      failures.push({
        kind: 'stale-helper',
        path: name,
        reason: 'The reviewed helper is no longer a route-free public method.',
      });
  }
  const sdkOnly = [];
  for (const method of allMethods) {
    for (const call of method.routes) {
      if (call.supporting) continue;
      const source = call.target === 'pdp' ? 'pdp-container' : 'control-plane';
      if (
        call.target === 'opa' ||
        !sources[source].operations.some((entry) => routeKey(entry) === routeKey(call))
      )
        sdkOnly.push({ name: method.name, ...call, runtime });
      if (
        method.factsProxy &&
        !call.target &&
        call.path.startsWith(aliases.from + '/') &&
        !rows.some(
          (row) =>
            row.methods.some(
              (entry) =>
                entry.name === method.name && entry.mode === 'container-facts-compatibility-alias',
            ) &&
            row.method === call.method &&
            row.path === aliases.to + call.path.slice(aliases.from.length),
        )
      )
        sdkOnly.push({ name: method.name, ...call, target: 'pdp-forwarding', runtime });
    }
  }
  const usedSdkOnly = new Set();
  for (const entry of sdkOnly) {
    const key = `${entry.target ?? 'control-plane'} ${routeKey(entry)}`;
    usedSdkOnly.add(key);
    const decision = decisions.sdkOnly[key];
    if (!nonempty(decision?.reason) || !nonempty(decision?.owner) || !nonempty(decision?.source))
      failures.push({
        kind: 'unresolved-sdk-route',
        path: key,
        reason: 'SDK-only route lacks reviewed provenance and an owner.',
      });
    entry.decision = decision ?? null;
  }
  for (const key of Object.keys(decisions.sdkOnly)) {
    if (!usedSdkOnly.has(key))
      failures.push({
        kind: 'stale-sdk-route',
        path: key,
        reason: 'SDK-only route decision no longer matches an extracted route.',
      });
  }
  for (const route of sdk.generated) {
    if (
      !sources['control-plane'].operations.some((op) => routeKey(op) === routeKey(route)) &&
      !decisions.sdkOnly[`control-plane ${routeKey(route)}`]
    )
      failures.push({
        kind: 'unresolved-generated-route',
        path: routeKey(route),
        reason: 'Generated route is absent from the reviewed public source and supplements.',
      });
  }
  return {
    integrity: failures.length ? 'FAIL' : 'PASS',
    sharedTarget: provenance.unmeasuredCapabilities.sharedTarget,
    capabilityLimits: provenance.unmeasuredCapabilities,
    coverage: rows.some(
      (row) =>
        !row.decision ||
        row.decision.action === 'undecided' ||
        (['add', 'retain'].includes(row.decision?.action) && row.coverage !== 'exposed'),
    )
      ? 'GAPS'
      : 'DECISIONS_ACCOUNTED_FOR',
    shapeEvidence:
      'Reviewed declaration and source-contract drift only; not complete wire or backend validation.',
    realBackend: runtime,
    counts: {
      publicHttpMethods: sdk.methods.length,
      localHelpers: sdk.helpers.length,
      generatedMethods: sdk.generated.length,
      generatedModels: Object.keys(sdk.modelShapes).length,
      authoredShapes: Object.keys(sdk.authoredShapes).length,
    },
    operations: rows,
    sdkOnly,
    sourceDrift,
    failures,
  };
}
