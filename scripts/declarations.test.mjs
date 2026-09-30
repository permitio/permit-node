import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, onTestFinished, test } from 'vitest';

import { rewriteDeclarationAliases } from '#scripts/declarations.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'permit declarations '));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'nested'));
  writeFileSync(join(root, 'model.d.ts'), 'export interface Model { key: string }');
  return root;
}

test('published declarations resolve import, export and import-type aliases without source files', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'nested/index.d.ts'),
    `import type { Model } from '#src/model';
export type { Model } from '#src/model';
export * from '#src/model';
export declare function read(): Model;
export type Nested = import('#src/model').Model;`,
  );
  rewriteDeclarationAliases(root);
  expect(readFileSync(join(root, 'nested/index.d.ts'), 'utf8')).not.toContain('#src');
  writeFileSync(
    join(root, 'consumer.ts'),
    `import { read, type Model, type Nested } from './nested/index.js';
const model: Model = read();
const nested: Nested = model;
export const key: string = nested.key;`,
  );
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, types: [], module: 'NodeNext' },
      files: ['consumer.ts'],
    }),
  );
  const result = spawnSync(
    process.execPath,
    [join(process.cwd(), 'node_modules/typescript/bin/tsc')],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

for (const alias of ['#src/missing', '#src/../outside']) {
  test(`rejects an unresolved published alias: ${alias}`, () => {
    const root = fixture();
    writeFileSync(join(root, 'index.d.ts'), `export type { Model } from '${alias}';`);
    expect(() => rewriteDeclarationAliases(root)).toThrow(/has no SDK declaration/);
  });
}

test('the generated request keeps default response data and custom response contracts', () => {
  const root = fixture();
  const common = join(process.cwd(), 'build/openapi/common.js');
  const axios = join(process.cwd(), 'node_modules/axios/index.js');
  writeFileSync(
    join(root, 'contract.ts'),
    `import { createRequestFunction } from ${JSON.stringify(common)};
import axios, { type AxiosResponse } from ${JSON.stringify(axios)};
const request = createRequestFunction({ url: '/fixture', options: {} }, axios, 'http://localhost');
const typed: Promise<AxiosResponse<{ key: string }>> = request<{ key: string }>();
const custom: Promise<{ transformed: boolean }> = request<unknown, { transformed: boolean }>();
const unknown: Promise<AxiosResponse<unknown>> = request();
void typed; void custom; void unknown;
// @ts-expect-error The default response's key remains a string.
const wrong: Promise<AxiosResponse<{ key: number }>> = request<{ key: string }>();
void wrong;`,
  );
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        types: [],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        target: 'ES2023',
      },
      files: ['contract.ts'],
    }),
  );
  const result = spawnSync(
    process.execPath,
    [join(process.cwd(), 'node_modules/typescript/bin/tsc')],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

test('every bulk API request declaration resolves its referenced generated models', () => {
  const root = fixture();
  const bulk = join(process.cwd(), 'build/openapi/api/bulk-operations-api.js');
  writeFileSync(
    join(root, 'bulk.ts'),
    `import type { BulkOperationsApi } from ${JSON.stringify(bulk)};
const create: Parameters<BulkOperationsApi['bulkReplaceResourceInstances']>[0] = {
  projId: 'project', envId: 'environment',
  resourceInstanceCreateBulkOperation: { operations: [{ key: 'instance', resource: 'document', tenant: 'default' }] },
};
const remove: Parameters<BulkOperationsApi['bulkDeleteResourceInstances']>[0] = {
  projId: 'project', envId: 'environment',
  resourceInstanceDeleteBulkOperation: { idents: ['document:instance'] },
};
const createUsers: Parameters<BulkOperationsApi['bulkCreateUsers']>[0] = {
  projId: 'project', envId: 'environment', userCreateBulkOperation: { operations: [] },
};
const deleteUsers: Parameters<BulkOperationsApi['bulkDeleteUsers']>[0] = {
  projId: 'project', envId: 'environment', userDeleteBulkOperation: { idents: [] },
};
const replaceUsers: Parameters<BulkOperationsApi['bulkReplaceUsers']>[0] = {
  projId: 'project', envId: 'environment', userReplaceBulkOperation: { operations: [] },
};
void create; void remove; void createUsers; void deleteUsers; void replaceUsers;`,
  );
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        types: [],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        target: 'ES2023',
      },
      files: ['bulk.ts'],
    }),
  );
  const result = spawnSync(
    process.execPath,
    [join(process.cwd(), 'node_modules/typescript/bin/tsc')],
    { cwd: root, encoding: 'utf8' },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
