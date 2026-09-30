import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
