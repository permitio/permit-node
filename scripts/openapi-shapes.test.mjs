import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, onTestFinished, test } from 'vitest';

import { assertSameOutput } from '#scripts/generate-openapi.mjs';
import { assertModelShapes } from '#scripts/openapi-shapes.mjs';

const types = resolve(import.meta.dirname, '../src/openapi/types');

function temporaryModels() {
  const path = mkdtempSync(join(tmpdir(), 'permit-openapi-shapes-'));
  onTestFinished(() => rmSync(path, { recursive: true, force: true }));
  cpSync(types, path, { recursive: true });
  return path;
}

test('accepts every current model including exact unconstrained source fields', async () => {
  await expect(assertModelShapes(types, readdirSync(types))).resolves.toBeUndefined();
});

for (const [file, source, pattern] of [
  ['secret.ts', 'export interface Secret {}', /empty interface/],
  [
    'callbacks-inner.ts',
    'export type CallbacksInner = Array<any> | string;',
    /callbacks-inner.*any/,
  ],
  [
    'response-list-roles-v2-schema-proj-id-env-id-roles-get.ts',
    'export interface ResponseListRoles { data: Array<RoleRead>; total_count: number; }',
    /expected union/,
  ],
  [
    'monthly-usage.ts',
    'export interface MonthlyUsage { monthly_tenants?: Set<string>; }',
    /monthly-usage.ts:monthly_tenants: expected Array<string>, got Set<string>/,
  ],
  ['data.ts', 'export type Data = any;', /data.ts.*any/],
]) {
  test(`rejects the previous generator degradation in ${file}`, async () => {
    const path = temporaryModels();
    writeFileSync(join(path, file), source);
    await expect(assertModelShapes(path, readdirSync(path))).rejects.toThrow(pattern);
  });
}

test('detects content drift, additions and deletions across the entire output tree', () => {
  const path = temporaryModels();
  expect(() => assertSameOutput(types, path, 'drift')).not.toThrow();
  const file = join(path, 'role-create.ts');
  const original = readFileSync(file);
  writeFileSync(file, '// changed');
  expect(() => assertSameOutput(types, path, 'drift')).toThrow(/differs/);
  writeFileSync(file, original);
  writeFileSync(join(path, 'stale.ts'), 'export type Stale = string;');
  expect(() => assertSameOutput(types, path, 'drift')).toThrow(/added or removed/);
  rmSync(join(path, 'stale.ts'));
  rmSync(file);
  expect(() => assertSameOutput(types, path, 'drift')).toThrow(/added or removed/);
});

test.each(['project_id', 'environment_id'])(
  'rejects loss of nullable API-key scope %s in production declarations',
  async (field) => {
    const path = temporaryModels();
    const file = join(path, 'apikey-scope-read.ts');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(`${field}?: string | null`, `${field}?: string`),
    );
    await expect(assertModelShapes(path, readdirSync(path))).rejects.toThrow(
      new RegExp(`apikey-scope-read\\.ts:${field}: expected string\\|null`),
    );
  },
);

test.each(['organization_id', 'project_id', 'environment_id'])(
  'rejects changed scope %s requiredness in production declarations',
  async (field) => {
    const path = temporaryModels();
    const file = join(path, 'apikey-scope-read.ts');
    const original = readFileSync(file, 'utf8');
    writeFileSync(
      file,
      field === 'organization_id'
        ? original.replace('organization_id:', 'organization_id?:')
        : original.replace(`${field}?:`, `${field}:`),
    );
    await expect(assertModelShapes(path, readdirSync(path))).rejects.toThrow(
      new RegExp(`apikey-scope-read\\.ts:${field}: expected .* field`),
    );
  },
);

test.each([
  ...[
    'project_id',
    'environment_id',
    'object_type',
    'access_level',
    'name',
    'secret',
    'created_by_member',
    'last_used_at',
    'env',
    'project',
  ].map((field) => ['apikey-read.ts', field]),
  ['paginated-result-apikey-read.ts', 'page_count'],
])('rejects lost %s:%s readonly nullability in production declarations', async (name, field) => {
  const path = temporaryModels();
  const file = join(path, name);
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(new RegExp(`(${field}\\?: [^;]+) \\| null;`), '$1;'),
  );
  await expect(assertModelShapes(path, readdirSync(path))).rejects.toThrow(
    new RegExp(`${name}:${field}: expected`),
  );
});
test.each([
  ...['organization_id', 'owner_type', 'id', 'created_at'].map((field) => [
    'apikey-read.ts',
    field,
  ]),
  ['paginated-result-apikey-read.ts', 'data'],
  ['paginated-result-apikey-read.ts', 'total_count'],
])('rejects lost %s:%s readonly requiredness', async (name, field) => {
  const path = temporaryModels();
  const file = join(path, name);
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(new RegExp(`^(\\s*)${field}:`, 'm'), `$1${field}?:`),
  );
  await expect(assertModelShapes(path, readdirSync(path))).rejects.toThrow(
    new RegExp(`${name}:${field}: expected required field`),
  );
});

test.each(['result', 'error'])('rejects loss of nullable environment task %s', async (field) => {
  const path = temporaryModels();
  const file = join(path, 'task-result-environment-read.ts');
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(new RegExp(`(${field}\\?: [^;]+) \\| null;`), '$1;'),
  );
  await expect(assertModelShapes(path, readdirSync(path))).rejects.toThrow(
    new RegExp(`task-result-environment-read.ts:${field}: expected`),
  );
});
test.each(['task_id', 'status', 'result', 'error'])(
  'rejects changed environment task %s requiredness',
  async (field) => {
    const path = temporaryModels();
    const file = join(path, 'task-result-environment-read.ts');
    const original = readFileSync(file, 'utf8');
    writeFileSync(
      file,
      ['result', 'error'].includes(field)
        ? original.replace(`${field}?:`, `${field}:`)
        : original.replace(`${field}:`, `${field}?:`),
    );
    await expect(assertModelShapes(path, readdirSync(path))).rejects.toThrow(
      new RegExp(`task-result-environment-read.ts:${field}: expected .* field`),
    );
  },
);
test.each(['any', 'unknown', 'object', 'EnvironmentRead'])(
  'rejects a collapsed environment task result %s',
  async (type) => {
    const path = temporaryModels();
    const file = join(path, 'task-result-environment-read.ts');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(/result\?: [^;]+;/, `result?: ${type};`),
    );
    await expect(assertModelShapes(path, readdirSync(path))).rejects.toThrow(
      /task-result-environment-read.ts:result/,
    );
  },
);
