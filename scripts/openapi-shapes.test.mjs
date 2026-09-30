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
