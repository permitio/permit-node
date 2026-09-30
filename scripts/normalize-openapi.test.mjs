import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import ts from '@permitio/compiler-tools';
import { expect, onTestFinished, test } from 'vitest';

import { normalizeOpenApi } from '#scripts/normalize-openapi.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'permit normalization '));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src/openapi'), { recursive: true });
  symlinkSync(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
  writeFileSync(
    join(root, 'tsconfig.build.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        noImplicitOverride: true,
        noPropertyAccessFromIndexSignature: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        target: 'ES2023',
        types: [],
        declaration: true,
        emitDeclarationOnly: true,
        outDir: 'build',
        rootDir: 'src/openapi',
      },
      include: ['src/**/*.ts'],
    }),
  );
  return root;
}

test.each([false, true])(
  'normalizes generated source idempotently on a case-sensitive=%s filesystem',
  (caseSensitive) => {
    const original = ts.sys.useCaseSensitiveFileNames;
    ts.sys.useCaseSensitiveFileNames = caseSensitive;
    onTestFinished(() => {
      ts.sys.useCaseSensitiveFileNames = original;
    });
    const root = fixture();
    writeFileSync(
      join(root, 'src/openapi/model.ts'),
      'export interface Model { key: string }\nexport interface Unused { unused: number }',
    );
    const file = join(root, 'src/openapi/api.ts');
    writeFileSync(
      file,
      `/* eslint-disable */
// @ts-ignore
import { Model, Unused } from './model';
import { AxiosInstance, AxiosResponse } from 'axios';
/**
 * Stored API configuration.${'  '}
 * @export
 * @memberof Configuration
 */
export class Configuration {
  token?: string;
  constructor(parameters: { token?: string }) { this.token = parameters.token; }
}
export class RequiredError extends Error { name: 'RequiredError' = 'RequiredError'; }
export function read(model: Model): Model { return model; }
export function header(headers?: Record<string, string>) { return headers?.contentType; }
export const createRequestFunction = function (globalAxios: AxiosInstance) {
  return <T = unknown, R = AxiosResponse<T>>(axios: AxiosInstance = globalAxios) => {
    return axios.request<T, R>({ url: '/fixture' });
  };
};`,
    );
    normalizeOpenApi(root);
    const normalized = readFileSync(file, 'utf8');
    expect(normalized).not.toContain('eslint-disable');
    expect(normalized).not.toContain('@ts-ignore');
    expect(normalized).not.toContain('Unused');
    expect(normalized).not.toContain('@export');
    expect(normalized).not.toContain('@memberof');
    expect(normalized).not.toMatch(/configuration\. +\n/);
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const declaration = readFileSync(join(root, 'build/api.d.ts'), 'utf8');
    expect(declaration).toContain('read(model: Model): Model');
    expect(declaration).toContain('ReturnType<typeof globalAxios.request<T, R>>');
    normalizeOpenApi(root);
    expect(readFileSync(file, 'utf8')).toBe(normalized);
  },
);

test('reports a missing compiler configuration', () => {
  const root = fixture();
  rmSync(join(root, 'tsconfig.build.json'));
  expect(() => normalizeOpenApi(root)).toThrow(/repair the compiler configuration/);
});

for (const [name, source, diagnostic] of [
  ['malformed generated source', 'export interface Broken {', /TS1005/],
  [
    'unsupported generated assignment',
    'export const value: string = 123;',
    /TypeScript 7[\s\S]*TS2322/,
  ],
]) {
  test(`rejects ${name}`, () => {
    const root = fixture();
    writeFileSync(join(root, 'src/openapi/broken.ts'), source);
    expect(() => normalizeOpenApi(root)).toThrow(diagnostic);
  });
}

test('rejects invalid compiler options instead of silently normalizing a partial program', () => {
  const root = fixture();
  writeFileSync(join(root, 'tsconfig.build.json'), '{"compilerOptions":{"target":"invalid"}}');
  expect(() => normalizeOpenApi(root)).toThrow(/TS6046/);
});

test('removes imports used only by generated required-parameter documentation', () => {
  const root = fixture();
  writeFileSync(join(root, 'src/openapi/base.ts'), 'export class RequiredError extends Error {}');
  const file = join(root, 'src/openapi/api.ts');
  writeFileSync(
    file,
    `import { RequiredError } from './base';
/** @throws {RequiredError} */
export function read(): string { return 'ok'; }`,
  );
  normalizeOpenApi(root);
  const result = readFileSync(file, 'utf8');
  expect(result).not.toContain("from './base'");
  expect(result).toContain('@throws If a required parameter is missing.');
});
