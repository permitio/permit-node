import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { beforeAll, expect, onTestFinished, test } from 'vitest';

import { extractSdk } from '#scripts/api-contracts.mjs';
import {
  compareShapes,
  contractShape,
  coverageReport,
  loadContractSources,
  sdkSnapshot,
  sourceSnapshot,
  specInventory,
} from '#scripts/api-contract-report.mjs';
import { fetchInventory, inspectContracts, main } from '#scripts/check-api-contracts.mjs';

const root = resolve(import.meta.dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const baseline = readJson(join(root, 'api-coverage/baseline.json'));
const decisions = readJson(join(root, 'api-coverage/decisions.json'));
const { sources, provenance } = loadContractSources(root);
baseline.sources = Object.fromEntries(
  Object.entries(sources).map(([name, inventory]) => [name, sourceSnapshot(inventory)]),
);
let sdk;
beforeAll(() => {
  sdk = extractSdk(root);
}, 20_000);
const evidence = () => structuredClone({ sdk, sources, provenance, decisions, baseline });

function temporaryRoot() {
  const path = mkdtempSync(join(tmpdir(), 'permit-contracts-'));
  onTestFinished(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function sourceCopy() {
  const path = temporaryRoot();
  for (const name of ['src', 'tsconfig.build.json', 'package.json'])
    cpSync(join(root, name), join(path, name), { recursive: true });
  symlinkSync(join(root, 'node_modules'), join(path, 'node_modules'), 'dir');
  return path;
}

function replace(path, before, after) {
  const original = readFileSync(path, 'utf8');
  expect(original.includes(before), `Fixture ${path} must contain the mutation target`).toBe(true);
  writeFileSync(path, original.replace(before, after));
}

test('accounts for complete source denominators while leaving parity and backend gaps visible', () => {
  const report = coverageReport(evidence());
  expect(report.integrity).toBe('PASS');
  expect(report.coverage).toBe('GAPS');
  expect(report.sharedTarget.status).toBe('UNAVAILABLE');
  expect(report.realBackend.status).toBe('NOT_MEASURED');
  expect(report.operations).toHaveLength(307);
  expect(report.counts.publicHttpMethods).toBe(167);
  expect(report.operations.filter((op) => op.source === 'control-plane')).toHaveLength(263);
  expect(report.operations.filter((op) => op.source === 'pdp-container')).toHaveLength(34);
  expect(report.operations.filter((op) => op.source === 'pdp-cloud')).toHaveLength(10);
  const scope = report.operations.find((op) => op.id === 'get_api_key_scope');
  expect(scope.coverage).toBe('supporting-only');
  expect(scope.methods).toEqual([]);
  expect(scope.supporting.some((method) => method.name === 'permit.api.users.list')).toBe(true);
  expect(report.sdkOnly.every((entry) => entry.decision?.reason)).toBe(true);
  expect(report.sdkOnly.some((entry) => entry.target === 'pdp-forwarding')).toBe(true);
  expect(
    sdk.methods
      .find((method) => method.name === 'permit.check')
      .routes.map((r) => r.target)
      .sort(),
  ).toEqual(['opa', 'pdp']);
});

test('exposes eight GA core Groups operations while preserving deferred and deprecated rows', () => {
  const report = coverageReport(evidence());
  const groups = report.operations.filter(
    (operation) => operation.source === 'control-plane' && operation.tags.includes('Groups'),
  );
  expect(groups).toHaveLength(16);
  const exposed = groups.filter((operation) => operation.coverage === 'exposed');
  expect(exposed).toHaveLength(8);
  expect(exposed.every((operation) => operation.lifecycle === 'GA')).toBe(true);
  expect(
    exposed.flatMap((operation) => operation.methods.map((method) => method.name)).sort(),
  ).toEqual([
    'permit.api.groups.assignRole',
    'permit.api.groups.assignUser',
    'permit.api.groups.create',
    'permit.api.groups.delete',
    'permit.api.groups.get',
    'permit.api.groups.list',
    'permit.api.groups.removeRole',
    'permit.api.groups.removeUser',
  ]);
  const groupMembership = groups.filter((operation) => operation.path.endsWith('/assign_group'));
  expect(groupMembership).toHaveLength(2);
  for (const operation of groupMembership) {
    expect(operation.decision.action).toBe('defer');
    expect(operation.methods).toEqual([]);
  }
  expect(groups.filter((operation) => operation.lifecycle === 'EAP')).toHaveLength(4);
  expect(groups.filter((operation) => operation.lifecycle === 'deprecated')).toHaveLength(2);
  expect(groups.filter((operation) => operation.coverage !== 'exposed')).toHaveLength(8);
});

for (const [name, mutate, kind] of [
  [
    'new operation',
    (e) =>
      e.sources['pdp-cloud'].operations.push({
        source: 'pdp-cloud',
        id: 'unreviewed',
        method: 'POST',
        path: '/new',
        lifecycle: 'GA',
        tags: [],
        contract: {},
      }),
    'undecided-operation',
  ],
  ['removed operation', (e) => e.sources['pdp-cloud'].operations.pop(), 'denominator-drift'],
  [
    'zero source inventory',
    (e) => {
      e.sources['pdp-cloud'].operations = [];
    },
    'denominator-drift',
  ],
  [
    'exposed exclusion',
    (e) => {
      e.decisions.operations['pdp-cloud POST /allowed'].action = 'exclude';
    },
    'stale-exclusion',
  ],
  [
    'removed lifecycle flag',
    (e) => {
      e.sources['pdp-cloud'].operations[0].lifecycle = 'deprecated';
    },
    'stale-decision',
  ],
  [
    'orphaned decision',
    (e) => {
      e.decisions.operations['pdp-cloud POST /gone'] = { reason: 'old' };
    },
    'stale-decision',
  ],
  [
    'missing SDK-only decision',
    (e) => {
      delete e.decisions.sdkOnly['opa POST /root'];
    },
    'unresolved-sdk-route',
  ],
  [
    'orphaned SDK-only decision',
    (e) => {
      e.decisions.sdkOnly['opa GET /gone'] = {};
    },
    'stale-sdk-route',
  ],
  [
    'lost helper classification',
    (e) => {
      delete e.decisions.helpers[sdk.helpers[0].name];
    },
    'unresolved-public-method',
  ],
  [
    'orphaned helper',
    (e) => {
      e.decisions.helpers['permit.gone'] = 'local';
    },
    'stale-helper',
  ],
]) {
  test(`rejects ${name}`, () => {
    const changed = evidence();
    mutate(changed);
    const report = coverageReport(changed);
    expect(report.integrity).toBe('FAIL');
    expect(report.failures.some((failure) => failure.kind === kind)).toBe(true);
  });
}

for (const [name, mutate, pointer] of [
  [
    'path count without a new operation',
    (e) => {
      e.sources['pdp-cloud'].counts.paths += 1;
    },
    '/counts/paths',
  ],
  [
    'request field type',
    (e) => {
      e.sources['pdp-cloud'].schemas.AllowedQuery.properties.action.type = 'number';
    },
    '/schemas/AllowedQuery/properties/action/type',
  ],
  [
    'response envelope',
    (e) => {
      e.sources['pdp-cloud'].schemas.AllowedResult.type = 'array';
    },
    '/schemas/AllowedResult/type',
  ],
  [
    'additive server field',
    (e) => {
      e.sources['pdp-cloud'].schemas.AllowedResult.properties.future = { type: 'string' };
    },
    '/schemas/AllowedResult/properties/future',
  ],
  [
    'authentication type',
    (e) => {
      e.sources['pdp-cloud'].document.securitySchemes = { changed: { type: 'apiKey' } };
    },
    '/document/securitySchemes',
  ],
  [
    'operation response',
    (e) => {
      e.sources['pdp-cloud'].operations[0].contract.responses = {};
    },
    '/contracts/',
  ],
]) {
  test(`reports ${name} as source drift requiring review`, () => {
    const changed = evidence();
    mutate(changed);
    const report = coverageReport(changed);
    expect(report.integrity).toBe('FAIL');
    expect(report.sourceDrift.some((difference) => difference.path.includes(pointer))).toBe(true);
  });
}

for (const [name, file, before, after, pathPart] of [
  [
    'constructor helper default destination',
    'src/config.ts',
    "'https://api.permit.io'",
    "'https://changed.invalid'",
    '/functionShapes/src~1config.ts:defaultSettings',
  ],
  [
    'shared generated request destination',
    'src/openapi/common.ts',
    '(configuration?.basePath || basePath) + axiosArgs.url',
    "(configuration?.basePath || basePath) + '/wrong' + axiosArgs.url",
    '/generatedSupportShapes/src~1openapi~1common.ts',
  ],
  [
    'missing public facade',
    'src/api/api-client.ts',
    '  users: IUsersApi;',
    '',
    '/methods/permit.api.users.',
  ],
  [
    'changed generated route',
    'src/openapi/api/users-api.ts',
    '`/v2/facts/{proj_id}/{env_id}/users`',
    '`/v2/facts/{proj_id}/{env_id}/missing`',
    '/generated/UsersApi.',
  ],
  [
    'authored alias field',
    'src/enforcement/interfaces.ts',
    '  key: string;',
    '  key: number;',
    '/authoredShapes/',
  ],
  [
    'wrapper body mapping',
    'src/api/users.ts',
    '          ...params,',
    '          ...params, page: 999,',
    '/implementationShapes/',
  ],
  [
    'ordinary internal parameter default',
    'src/enforcement/enforcer.ts',
    'config: CheckConfig = {},',
    'config: CheckConfig = { throwOnError: false },',
    '/implementationShapes/',
  ],
  [
    'supporting constant value',
    'src/enforcement/enforcer.ts',
    "const RESOURCE_DELIMITER = ':';",
    "const RESOURCE_DELIMITER = '|';",
    '/initializationShapes/',
  ],
  [
    'authored enum value',
    'src/api/context.ts',
    "ENVIRONMENT_LEVEL_API_KEY = 'ENVIRONMENT_LEVEL_API_KEY',",
    "ENVIRONMENT_LEVEL_API_KEY = 'changed',",
    '/authoredShapes/',
  ],
  [
    'public overload hides optional context and config',
    'src/index.ts',
    '  public async check(',
    '  public check(user: IUser | string, action: string, resource: IResource | string): Promise<boolean>;\n  public async check(',
    '/methods/permit.check/publicSignatures',
  ],
  [
    'inferred generated return type',
    'src/openapi/api/users-api.ts',
    '=> AxiosPromise<PaginatedResultUserRead>',
    '=> AxiosPromise<UserRead>',
    '/generated/UsersApi.listUsers/output/returns',
  ],
  [
    'generated request field',
    'src/openapi/api/users-api.ts',
    'readonly userCreate: UserCreate;',
    'readonly userCreate: UserUpdate;',
    '/generatedRequestShapes/',
  ],
  [
    'callback parser implementation',
    'src/enforcement/responses.ts',
    '  return decision;',
    '  return !decision;',
    '/functionShapes/',
  ],
  [
    'generated response type',
    'src/openapi/types/user-read.ts',
    'email?: string',
    'email?: number',
    '/modelShapes/UserRead',
  ],
]) {
  test(`actual AST detects ${name}`, () => {
    const copy = sourceCopy();
    replace(join(copy, file), before, after);
    const changed = evidence();
    changed.baseline.sdk = sdkSnapshot(sdk);
    changed.sdk = extractSdk(copy);
    const report = coverageReport(changed);
    expect(report.integrity).toBe('FAIL');
    expect(report.failures.some((failure) => failure.path.includes(pathPart))).toBe(true);
  }, 20_000);
}

test('unsupported authored Axios dispatch cannot silently disappear into a helper', () => {
  const copy = sourceCopy();
  replace(join(copy, 'src/enforcement/enforcer.ts'), '.post<', '.request<');
  expect(() => extractSdk(copy)).toThrow(/Unsupported Axios dispatch/);
}, 20_000);

test('removing all generated models rejects extraction', () => {
  const copy = sourceCopy();
  rmSync(join(copy, 'src/openapi/types'), { recursive: true });
  expect(() => extractSdk(copy)).toThrow(/model inventory is empty/);
}, 20_000);

for (const name of ['containerFactsAlias', 'unmeasuredCapabilities']) {
  test(`rejects unexplained ${name} provenance changes`, async () => {
    const copy = temporaryRoot();
    for (const folder of ['api-coverage', 'openapi'])
      cpSync(join(root, folder), join(copy, folder), { recursive: true });
    const changed = readJson(join(copy, 'api-coverage/sources.json'));
    changed[name] = {};
    writeFileSync(join(copy, 'api-coverage/sources.json'), JSON.stringify(changed));
    await expect(inspectContracts({ root: copy })).rejects.toThrow(/provenance changed/);
  });
}

const sample = () => ({
  openapi: '3.1.0',
  paths: {
    '/sample': { post: { operationId: 'sample', responses: { 200: { description: 'OK' } } } },
  },
  components: {
    schemas: { Item: { type: 'object', properties: { description: { type: 'string' } } } },
  },
});
for (const [name, mutate, pattern] of [
  [
    'empty paths',
    (s) => {
      s.paths = {};
    },
    /inventory is empty/,
  ],
  [
    'empty schemas',
    (s) => {
      s.components.schemas = {};
    },
    /inventory is empty/,
  ],
  [
    'missing response',
    (s) => {
      s.paths['/sample'].post.responses = {};
    },
    /ID\/responses/,
  ],
  [
    'duplicate ID',
    (s) => {
      s.paths['/other'] = s.paths['/sample'];
    },
    /unique ID/,
  ],
  [
    'external reference',
    (s) => {
      s.components.schemas.Item.$ref = 'https://example.invalid';
    },
    /external reference/,
  ],
  [
    'unresolved reference',
    (s) => {
      s.components.schemas.Item.$ref = '#/components/schemas/Gone';
    },
    /unresolved/,
  ],
]) {
  test(`source parser rejects ${name}`, () => {
    const document = sample();
    mutate(document);
    expect(() => specInventory(document, 'fixture')).toThrow(pattern);
  });
}

test('retains named properties and default data while ignoring prose and examples', () => {
  const schema = {
    title: 'Documentation',
    properties: { description: { type: 'string' } },
    default: { title: 'value', $ref: 'data' },
  };
  expect(contractShape(schema)).toEqual({
    properties: { description: { type: 'string' } },
    default: schema.default,
  });
  const document = sample();
  document.components.schemas.Item.example = { $ref: 'not-a-schema-reference' };
  expect(specInventory(document, 'fixture').counts.operations).toBe(1);
});

for (const [name, fetcher, pattern] of [
  ['HTTP error', async () => new Response('', { status: 503 }), /HTTP 503/],
  ['malformed JSON', async () => new Response('<html>'), /cannot inspect/],
  [
    'zero operations',
    async () => new Response(JSON.stringify({ ...sample(), paths: {} })),
    /inventory is empty/,
  ],
  [
    'network error',
    async () => {
      throw new Error('offline');
    },
    /offline/,
  ],
  ['oversized body', async () => new Response('x'.repeat(10 * 1024 * 1024 + 1)), /response limit/],
]) {
  test(`does not report clean drift for ${name}`, async () => {
    await expect(fetchInventory(provenance.sources[0], fetcher)).rejects.toThrow(pattern);
  });
}

test('fetches only allowlisted public documentation and supplies a deadline', async () => {
  await expect(fetchInventory({ name: 'bad', url: 'http://localhost/secret' })).rejects.toThrow(
    /Unapproved/,
  );
  const inventory = await fetchInventory(provenance.sources[0], async (url, options) => {
    expect(url).toBe('https://api.permit.io/v2/openapi.json');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.redirect).toBe('error');
    expect(options.headers).toEqual({ Accept: 'application/json' });
    return new Response(JSON.stringify(sample()));
  });
  expect(inventory.counts.operations).toBe(1);
});

test('invalid command input emits a report and exit code 2', async () => {
  const output = temporaryRoot();
  expect(await main(['--output', output, '--unsupported'], root)).toBe(2);
  expect(readJson(join(output, 'report.json')).integrity).toBe('INVALID');
});

test('committed semantic snapshot omits unstable line numbers', () => {
  const changed = structuredClone(sdk);
  changed.methods[0].source.line += 100;
  changed.generated[0].source.line += 100;
  expect(sdkSnapshot(changed)).toEqual(baseline.sdk);
});

test('an empty rebaseline cannot legitimize a zero SDK inventory', () => {
  const changed = evidence();
  changed.sdk.generated = [];
  changed.baseline.sdk.generated = {};
  expect(() => coverageReport(changed)).toThrow(/must contain methods, routes and models/);
});

test('cannot save evidence into an existing file and returns INVALID exit2', async () => {
  const output = join(temporaryRoot(), 'file');
  writeFileSync(output, 'preserved');
  expect(await main(['--output', output, '--unsupported'], root)).toBe(2);
  expect(readFileSync(output, 'utf8')).toBe('preserved');
});

test('the command returns 0 for local consistency without claiming parity', async () => {
  const output = temporaryRoot();
  expect(await main(['--output', output], root)).toBe(0);
  const report = readJson(join(output, 'report.json'));
  expect(report.integrity).toBe('PASS');
  expect(report.sharedTarget.status).toBe('UNAVAILABLE');
  expect(report.realBackend.status).toBe('NOT_MEASURED');
}, 20_000);

test('the command returns 1 and retained evidence for a changed declared shape', async () => {
  const copy = sourceCopy();
  for (const folder of ['api-coverage', 'openapi'])
    cpSync(join(root, folder), join(copy, folder), { recursive: true });
  replace(join(copy, 'src/enforcement/interfaces.ts'), '  key: string;', '  key: number;');
  const output = temporaryRoot();
  expect(await main(['--output', output], copy)).toBe(1);
  const report = readJson(join(output, 'report.json'));
  expect(report.integrity).toBe('FAIL');
  expect(report.failures.some((entry) => entry.path.includes('/authoredShapes/'))).toBe(true);
}, 20_000);

for (const section of ['parameters', 'requestBodies', 'responses', 'headers']) {
  test(`retains contract-bearing reusable ${section}`, () => {
    const original = sample();
    original.components[section] = {
      description: { schema: { type: 'string', default: 'before' } },
    };
    const changed = structuredClone(original);
    changed.components[section].description.schema.default = 'after';
    const before = sourceSnapshot(specInventory(original, 'fixture'));
    const after = sourceSnapshot(specInventory(changed, 'fixture'));
    expect(after).not.toEqual(before);
    expect(after.document.reusable[section].description.schema.default).toBe('after');
  });
}

for (const section of ['properties', 'patternProperties', '$defs', 'dependentSchemas']) {
  test(`does not hide a reference under ${section}.description`, () => {
    const document = sample();
    document.components.schemas.Item[section] = {
      description: { $ref: '#/components/schemas/Missing' },
    };
    expect(() => specInventory(document, 'fixture')).toThrow(/unresolved/);
  });
}

test('keeps schema names, auth-scheme names and discriminator mapping names', () => {
  const document = sample();
  document.components.schemas.description = { $ref: '#/components/schemas/Item' };
  document.components.securitySchemes = { description: { type: 'http', scheme: 'bearer' } };
  document.components.schemas.Item.discriminator = {
    propertyName: 'kind',
    mapping: { description: '#/components/schemas/Item' },
  };
  const before = specInventory(document, 'fixture');
  document.components.securitySchemes.description.scheme = 'basic';
  const after = specInventory(document, 'fixture');
  expect(after.document.securitySchemes.description.scheme).toBe('basic');
  expect(after.document).not.toEqual(before.document);
  expect(after.schemas.description.$ref).toBe('#/components/schemas/Item');
  expect(after.schemas.Item.discriminator.mapping.description).toBe('#/components/schemas/Item');
});

for (const [name, mutate] of [
  [
    'response string',
    (s) => {
      s.paths['/sample'].post.responses = 'not a responses map';
    },
  ],
  [
    'response array',
    (s) => {
      s.paths['/sample'].post.responses = [];
    },
  ],
  [
    'response entry string',
    (s) => {
      s.paths['/sample'].post.responses[200] = 'not an object';
    },
  ],
  [
    'invalid response status',
    (s) => {
      s.paths['/sample'].post.responses = { bad: {} };
    },
  ],
  [
    'path scalar',
    (s) => {
      s.paths['/sample'] = true;
    },
  ],
  [
    'operation scalar',
    (s) => {
      s.paths['/sample'].post = 'invalid';
    },
  ],
  [
    'parameter string',
    (s) => {
      s.paths['/sample'].post.parameters = 'invalid';
    },
  ],
]) {
  test(`rejects malformed ${name} as INVALID input`, () => {
    const document = sample();
    mutate(document);
    expect(() => specInventory(document, 'fixture')).toThrow();
  });
}

for (const field of ['__proto__', 'constructor', 'toString']) {
  for (const direction of ['added', 'removed']) {
    test(`reports ${direction} schema property named ${field}`, () => {
      const document = sample();
      document.paths['/sample'].post.responses[200].content = {
        'application/json': { schema: { $ref: '#/components/schemas/Item' } },
      };
      document.components.schemas.Item = {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries([[field, {}]]),
      };
      const without = structuredClone(document);
      delete without.components.schemas.Item.properties[field];
      const withField = sourceSnapshot(specInventory(document, 'fixture'));
      const withoutField = sourceSnapshot(specInventory(without, 'fixture'));
      const [before, after] =
        direction === 'removed' ? [withField, withoutField] : [withoutField, withField];
      expect(compareShapes(before, after)).toEqual([
        {
          kind: direction,
          path: `/schemas/Item/properties/${field}`,
          [direction === 'removed' ? 'expected' : 'actual']: {},
        },
      ]);
    });
  }
}

for (const level of ['document', 'path', 'operation']) {
  test(`tracks ${level} server destination and annotation-named variable defaults`, () => {
    const document = sample();
    const target =
      level === 'document'
        ? document
        : level === 'path'
          ? document.paths['/sample']
          : document.paths['/sample'].post;
    target.servers = [
      {
        url: 'https://{description}.example.invalid',
        variables: { description: { default: 'before', enum: ['before', 'after'] } },
      },
    ];
    const before = sourceSnapshot(specInventory(document, 'fixture'));
    target.servers[0].variables.description.default = 'after';
    const changedVariable = sourceSnapshot(specInventory(document, 'fixture'));
    expect(
      compareShapes(before, changedVariable).some((entry) =>
        entry.path.endsWith('/serverRouting/effective'),
      ),
    ).toBe(true);
    expect(changedVariable.contracts['POST /sample'].serverRouting.effective[0].variables).toEqual({
      description: { default: 'after', enum: ['before', 'after'] },
    });
    target.servers[0].url = 'https://changed.invalid';
    const changedUrl = sourceSnapshot(specInventory(document, 'fixture'));
    expect(
      compareShapes(changedVariable, changedUrl).some((entry) =>
        entry.path.endsWith('/serverRouting/effective'),
      ),
    ).toBe(true);
  });
}

test('retains declared server overrides while calculating operation precedence', () => {
  const document = sample();
  document.servers = [{ url: 'https://document.invalid' }];
  document.paths['/sample'].servers = [{ url: 'https://path.invalid' }];
  document.paths['/sample'].post.servers = [{ url: 'https://operation.invalid' }];
  const before = sourceSnapshot(specInventory(document, 'fixture'));
  expect(before.contracts['POST /sample'].serverRouting).toEqual({
    path: [{ url: 'https://path.invalid' }],
    operation: [{ url: 'https://operation.invalid' }],
    effective: [{ url: 'https://operation.invalid' }],
  });
  document.paths['/sample'].servers[0].url = 'https://changed-path.invalid';
  const after = sourceSnapshot(specInventory(document, 'fixture'));
  expect(
    compareShapes(before, after).some((entry) => entry.path.endsWith('/serverRouting/path')),
  ).toBe(true);
  delete document.paths['/sample'].post.servers;
  expect(specInventory(document, 'fixture').operations[0].contract.serverRouting.effective).toEqual(
    [{ url: 'https://changed-path.invalid' }],
  );
  delete document.paths['/sample'].servers;
  expect(specInventory(document, 'fixture').operations[0].contract.serverRouting.effective).toEqual(
    [{ url: 'https://document.invalid' }],
  );
});

test('rejects a referenced Path Item even when its local target exists', async () => {
  const document = sample();
  document.components.pathItems = {
    Other: { get: { operationId: 'other', responses: { 200: { description: 'OK' } } } },
  };
  specInventory(document, 'fixture');
  document.paths['/other'] = { $ref: '#/components/pathItems/Other' };
  expect(() => specInventory(document, 'fixture')).toThrow(
    /referenced Path Item \/other is unsupported/,
  );
  await expect(
    fetchInventory(
      { name: 'fixture', url: 'https://api.permit.io/v2/openapi.json' },
      async () => new Response(JSON.stringify(document)),
    ),
  ).rejects.toThrow(/referenced Path Item \/other is unsupported/);
});

test('records a path-only denominator addition', () => {
  const document = sample();
  const before = sourceSnapshot(specInventory(document, 'fixture'));
  document.paths['/empty'] = {};
  const after = sourceSnapshot(specInventory(document, 'fixture'));
  expect(compareShapes(before, after)).toEqual([
    { kind: 'changed', path: '/counts/paths', expected: 1, actual: 2 },
  ]);
});

for (const level of ['document', 'path', 'operation']) {
  for (const value of ['not an array', [null], [{ url: 7 }]]) {
    test(`rejects malformed ${level} servers ${JSON.stringify(value)}`, () => {
      const document = sample();
      const target =
        level === 'document'
          ? document
          : level === 'path'
            ? document.paths['/sample']
            : document.paths['/sample'].post;
      target.servers = value;
      expect(() => specInventory(document, 'fixture')).toThrow(/servers must be an array/);
    });
  }
}

test('unreviewed transport factories cannot inherit a known facade classification by name', () => {
  const copy = sourceCopy();
  writeFileSync(
    join(copy, 'src/utils/unreviewed-transport.ts'),
    "import axios from 'axios'; export function createOwnedTransport() { return axios.create(); }\n",
  );
  replace(
    join(copy, 'src/enforcement/enforcer.ts'),
    "'#src/utils/http-transport'",
    "'#src/utils/unreviewed-transport'",
  );
  expect(() => extractSdk(copy)).toThrow(/Unknown HTTP client/);
}, 20_000);

test('dynamic facade routing defaults cannot silently receive static route evidence', () => {
  const copy = sourceCopy();
  replace(
    join(copy, 'src/enforcement/enforcer.ts'),
    'defaults: { baseURL: `${this.config.pdp}/`, headers }',
    'defaults: Object.assign({}, { baseURL: `${this.config.pdp}/`, headers })',
  );
  expect(() => extractSdk(copy)).toThrow(/routing defaults must be a checked object literal/);
}, 20_000);

test('changed facade destinations require an intentional contract review', () => {
  const copy = sourceCopy();
  replace(
    join(copy, 'src/enforcement/enforcer.ts'),
    'baseURL: `${this.config.pdp}/`',
    'baseURL: `${this.config.pdp}/changed/`',
  );
  const changed = evidence();
  changed.baseline.sdk = sdkSnapshot(sdk);
  changed.sdk = extractSdk(copy);
  const report = coverageReport(changed);
  expect(report.integrity).toBe('FAIL');
  expect(report.failures.some((entry) => entry.path === '/sdk/transports/Enforcer.client')).toBe(
    true,
  );
}, 20_000);
