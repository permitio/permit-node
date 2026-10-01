import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import ts from '@permitio/compiler-tools';
import { expect, onTestFinished, test } from 'vitest';

import { loadReviewedOpenApi, prepareOpenApi, validateSource } from '#scripts/openapi-source.mjs';

const root = resolve(import.meta.dirname, '..');
const source = JSON.parse(readFileSync(resolve(root, 'openapi/permit-api.json'), 'utf8'));
const supplement = JSON.parse(readFileSync(resolve(root, 'openapi/elements-login.json'), 'utf8'));

test('preserves the reviewed source and prepares only the documented corrections', () => {
  const original = structuredClone(source);
  const prepared = loadReviewedOpenApi(root);
  expect(source).toEqual(original);
  expect(prepared.openapi).toBe('3.1.0');
  expect(Object.keys(prepared.paths)).toHaveLength(165);
  expect(Object.keys(prepared.components.schemas)).toHaveLength(335);
  expect(prepared.tags.filter((tag) => tag.name === 'Bulk Operations')).toHaveLength(1);
  const tuple = prepared.components.schemas.OPALUpdateCallback.properties.callbacks.items.anyOf[1];
  expect(tuple).toEqual({
    type: 'array',
    minItems: 2,
    maxItems: 2,
    items: false,
    prefixItems: [{ type: 'string' }, { $ref: '#/components/schemas/OPALHttpFetcherConfig' }],
  });
  expect(prepared.paths['/v2/auth/elements_login_as']).toEqual(
    supplement.paths['/v2/auth/elements_login_as'],
  );
  for (const name of ['ProxyConfigCreate', 'ProxyConfigRead', 'ProxyConfigUpdate']) {
    const secret = prepared.components.schemas[name].properties.secret;
    expect(secret.anyOf.map((branch) => branch.type)).toEqual(['object', 'string', 'string']);
    expect(secret.anyOf[0].additionalProperties).toEqual({ type: 'string' });
  }
  for (const [name, schema] of Object.entries(prepared.components.schemas)) {
    if (name.endsWith('BulkOperationResult') && Object.keys(schema.properties ?? {}).length === 0) {
      expect(schema).toEqual(source.components.schemas[name]);
    }
  }
});

for (const [name, mutate, pattern] of [
  [
    'schema version',
    (s) => {
      s.openapi = '3.0.3';
    },
    /3.1.0/,
  ],
  [
    'corrected upstream tag',
    (s) => {
      s.tags.splice(19, 1);
    },
    /stale/,
  ],
  [
    'unrelated duplicated tag',
    (s) => {
      s.tags.push(s.tags[0]);
    },
    /Unexpected duplicate/,
  ],
  [
    'corrected upstream tuple',
    (s) => {
      s.components.schemas.OPALUpdateCallback.properties.callbacks.items.anyOf[1].items = false;
    },
    /stale/,
  ],
  [
    'changed proxy types',
    (s) => {
      s.components.schemas.ProxyConfigRead.properties.secret.anyOf[1].type = 'string';
    },
    /stale/,
  ],
  [
    'new proxy dictionary constraint',
    (s) => {
      s.components.schemas.ProxyConfigRead.properties.secret.anyOf[0].additionalProperties = false;
    },
    /stale/,
  ],
  [
    'new published Elements login',
    (s) => {
      s.paths['/v2/auth/elements_login_as'] = supplement.paths['/v2/auth/elements_login_as'];
    },
    /now published/,
  ],
  [
    'unresolved reference',
    (s) => {
      s.components.schemas.RoleRead.properties.name = { $ref: '#/components/schemas/Missing' };
    },
    /Unresolved.*Missing/,
  ],
  [
    'invalid primitive',
    (s) => {
      s.components.schemas.RoleRead.properties.name.type = 'NamedString';
    },
    /Invalid schema type NamedString/,
  ],
]) {
  test(`fails closed for ${name}`, () => {
    const changed = structuredClone(source);
    mutate(changed);
    expect(() => prepareOpenApi(changed, supplement)).toThrow(pattern);
  });
}

test('does not interpret application example values as schema keywords', () => {
  expect(() =>
    validateSource({
      components: {
        schemas: {
          Sample: {
            type: 'object',
            example: { type: 'custom-value', $ref: 'application-data' },
          },
        },
      },
    }),
  ).not.toThrow();
});

for (const [file, mutate, pattern] of [
  [
    'permit-api.json',
    (s) => {
      s.info.title = 'unreviewed';
    },
    /snapshot hash changed/,
  ],
  [
    'elements-login.json',
    (s) => {
      s.paths = {};
    },
    /supplement changed/,
  ],
  [
    'provenance.json',
    (s) => {
      s.counts.operations = 0;
    },
    /inventory.*stale/,
  ],
]) {
  test(`rejects unreviewed ${file} changes before generating files`, () => {
    const path = mkdtempSync(join(tmpdir(), 'permit-source-hash-'));
    onTestFinished(() => rmSync(path, { recursive: true, force: true }));
    mkdirSync(join(path, 'openapi'));
    for (const name of ['permit-api.json', 'elements-login.json', 'provenance.json']) {
      cpSync(join(root, 'openapi', name), join(path, 'openapi', name));
    }
    const changed = JSON.parse(readFileSync(join(path, 'openapi', file), 'utf8'));
    mutate(changed);
    writeFileSync(join(path, 'openapi', file), JSON.stringify(changed));
    expect(() => loadReviewedOpenApi(path)).toThrow(pattern);
  });
}

const reviewedDescriptions = [
  [
    'data_generator_lib__schemas__schema_opal_data__DerivationSettings',
    'superseded_by_direct_role',
    'If True, the derived role is superseded by a direct role.\n' +
      'Meaning role derivation is not considered if the user has a direct role.',
  ],
  ['ElementsUserInviteApprove', 'email', 'The email of the user that is being invited'],
  ...['GroupAssignment', 'GroupCreate', 'GroupReadSchema'].map((model) => [
    model,
    'group_instance_key',
    'Either the unique id of the resource instance that the group belongs to, or the\n' +
      'URL-friendly key of the <resource_key:resource_instance_key> (i.e: file:my_file)',
  ]),
  [
    'PaginatedResult_RelationshipTupleDetailedRead_',
    'data',
    'List of Detailed Relationship Tuples',
  ],
  ['PaginatedResult_ResourceInstanceDetailedRead_', 'data', 'List of Detailed Resource Instances'],
  [
    'TenantBlockRead',
    'attributes',
    'Arbitrary tenant attributes that will be used to enforce\n' +
      'attribute-based access control policies.',
  ],
];

test('preserves unique UUID arrays while correcting exactly eight descriptions', () => {
  const original = structuredClone(source);
  const prepared = prepareOpenApi(source, supplement);
  expect(source).toEqual(original);
  const tenants = prepared.components.schemas.MonthlyUsage.properties.monthly_tenants;
  expect(tenants).toEqual({
    items: { type: 'string', format: 'uuid' },
    type: 'array',
    uniqueItems: true,
    title: 'Monthly Tenants',
    default: [],
  });
  for (const [model, property, expected] of reviewedDescriptions) {
    expect(prepared.components.schemas[model].properties[property].description).toBe(expected);
    const unchanged = structuredClone(prepared.components.schemas[model]);
    unchanged.properties[property].description =
      source.components.schemas[model].properties[property].description;
    expect(unchanged).toEqual(source.components.schemas[model]);
  }
});

test.each(reviewedDescriptions)('rejects stale reviewed %s.%s description', (model, property) => {
  const changed = structuredClone(source);
  changed.components.schemas[model].properties[property].description += ' changed upstream';
  expect(() => prepareOpenApi(changed, supplement)).toThrow(/description is stale/);
});

test('preserves wrapped reviewed descriptions in generated property JSDoc', () => {
  for (const [model, property, expected] of reviewedDescriptions) {
    if (!expected.includes('\n')) continue;
    const filename =
      model === 'data_generator_lib__schemas__schema_opal_data__DerivationSettings'
        ? 'data-generator-lib-schemas-schema-opal-data-derivation-settings'
        : model.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).slice(1);
    const file = join(root, 'src/openapi/types', filename + '.ts');
    const parsed = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const declaration = parsed.statements.find(ts.isInterfaceDeclaration);
    const member = declaration?.members.find((node) => node.name?.getText(parsed) === property);
    expect(member).toBeDefined();
    const comments = ts.getJSDocCommentsAndTags(member);
    expect(comments).toHaveLength(1);
    expect(comments[0].comment).toBe(expected);
    for (const line of comments[0].getText(parsed).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(100);
    }
  }
});

test.each([
  ['uniqueItems', false],
  ['default', ['unexpected']],
  ['items', { type: 'string' }],
])('rejects changed monthly_tenants %s before generation', (field, value) => {
  const changed = structuredClone(source);
  changed.components.schemas.MonthlyUsage.properties.monthly_tenants[field] = value;
  expect(() => prepareOpenApi(changed, supplement)).toThrow(/monthly_tenants is stale/);
});

test.each(['model', 'property'])(
  'rejects a removed corrected description %s with its source location',
  (missing) => {
    const changed = structuredClone(source);
    if (missing === 'model') delete changed.components.schemas.GroupAssignment;
    else delete changed.components.schemas.GroupAssignment.properties.group_instance_key;
    expect(() => prepareOpenApi(changed, supplement)).toThrow(
      /GroupAssignment\/group_instance_key\/description is stale/,
    );
  },
);

test('rejects a removed monthly usage model with its source location', () => {
  const changed = structuredClone(source);
  delete changed.components.schemas.MonthlyUsage;
  expect(() => prepareOpenApi(changed, supplement)).toThrow(
    /MonthlyUsage.*monthly_tenants is stale/,
  );
});
