import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const sourceScript = resolve('skills/permit-node-3-migration/scripts/scan.mjs');
const skillSource = resolve('skills/permit-node-3-migration');
let script;
let scan;
let NOT_DETECTED;
let decoyRoot;
let toolDirectory;
const directories = [];

// Packages named like the scanner's prerequisites in an ancestor node_modules, where Node's
// default resolution would find them if the skill's own install were missing. Loading one
// writes the marker file and throws.
async function plantDecoys(root) {
  for (const name of ['typescript', 'semver']) {
    const directory = join(root, 'node_modules', name);
    await mkdir(directory, { recursive: true });
    const version = name === 'typescript' ? '6.0.3' : '7.8.5';
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ name, version, main: 'index.js' }),
    );
    await writeFile(
      join(directory, 'index.js'),
      "require('node:fs').writeFileSync(require('node:path').join(__dirname, '..', '..', " +
        "'DECOY_LOADED'), 'yes'); throw new Error('DECOY_LOADED');\n",
    );
  }
}

async function copySkill(target) {
  await mkdir(join(target, 'scripts'), { recursive: true });
  for (const name of ['package.json', 'pnpm-workspace.yaml', 'compiler-lock.yaml']) {
    await cp(join(skillSource, name), join(target, name));
  }
  await cp(sourceScript, join(target, 'scripts/scan.mjs'));
}

beforeAll(async () => {
  decoyRoot = await mkdtemp(join(tmpdir(), 'permit-migration-scanner-root-'));
  await plantDecoys(decoyRoot);
  toolDirectory = join(decoyRoot, 'skill');
  const skill = skillSource;
  await mkdir(toolDirectory);
  for (const name of ['package.json', 'pnpm-workspace.yaml', 'compiler-lock.yaml']) {
    await cp(join(skill, name), join(toolDirectory, name));
  }
  await cp(join(skill, 'compiler-lock.yaml'), join(toolDirectory, 'pnpm-lock.yaml'));
  await mkdir(join(toolDirectory, 'scripts'));
  script = join(toolDirectory, 'scripts/scan.mjs');
  await cp(sourceScript, script);
  const install = spawnSync('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], {
    cwd: toolDirectory,
    encoding: 'utf8',
    timeout: 120_000,
  });
  if (install.error || install.status !== 0) {
    throw new Error(
      `Copied scanner dependency install failed: ` +
        `${install.error?.message ?? install.stderr + install.stdout}`,
    );
  }
  ({ scan, NOT_DETECTED } = await import(pathToFileURL(script).href));
}, 125_000);

afterAll(async () => {
  if (decoyRoot) {
    // Every scan in this file ran beneath the decoys; none may have been loaded.
    await expect(readFile(join(decoyRoot, 'DECOY_LOADED'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await rm(decoyRoot, { recursive: true });
  }
});

async function project(files) {
  const path = await mkdtemp(join(tmpdir(), 'permit-migration-scan-'));
  directories.push(path);
  for (const [name, text] of Object.entries(files)) {
    const target = join(path, name);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, text);
  }
  return path;
}

afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

const construct = "import { Permit } from 'permitio'; const p = new Permit({ token: 'opaque' });";

describe('customer migration scanner', () => {
  it.each([
    "import Permit from 'permitio'; const p = new Permit({ token: 'opaque' });",
    "import { Permit as Auth } from 'permitio'; const p = new Auth({ token: 'opaque' });",
    "import * as SDK from 'permitio'; const p = new SDK.Permit({ token: 'opaque' });",
    "const { Permit: Auth } = require('permitio'); const p = new Auth({ token: 'opaque' });",
    "const SDK = require('permitio'); const p = new SDK.Permit({ token: 'opaque' });",
    "const SDK = await import('permitio'); const p = new SDK.Permit({ token: 'opaque' });",
    "import SDK = require('permitio'); const p = new SDK.Permit({ token: 'opaque' });",
  ])('recognizes SDK construction provenance: %s', async (prefix) => {
    const path = await project({ 'customer.ts': `${prefix} p.api.getUser('u');` });
    const report = await scan(path);
    expect(report.status).toBe('COMPLETE');
    expect(report.exitCode).toBe(1);
    expect(report.findings).toContainEqual(expect.objectContaining({ id: 'A1', line: 1 }));
  });

  it.each([
    "const client = p; const api = client.api; api.getUser('u');",
    "const { api: a } = p; a['getUser']('u');",
    "const { getUser: get } = p.api; get('u');",
    "p.api?.['getUser']?.('u');",
    "const methods = p.api.getMethods(); methods.getUser('u');",
    "const a = p.api; const other = a; other.getUser('u');",
    'const {api:{listUsers}} = p; await listUsers();',
    'const groups = p.api.actionGroups; useElsewhere(groups);',
  ])('preserves local alias and literal member provenance: %s', async (source) => {
    const report = await scan(await project({ 'customer.mts': `${construct} ${source}` }));
    expect(report.findings.some((item) => item.id === 'A1')).toBe(true);
    expect(report.exitCode).toBe(1);
  });

  it('tracks nested grouped results without labeling the supported call removed', async () => {
    const source = `${construct}
      const {api:{users:{unassignRole}}} = p;
      const result = await unassignRole({}); result.data;`;
    const report = await scan(await project({ 'customer.ts': source }));
    expect(report.findings.some((item) => item.id === 'A3')).toBe(true);
    expect(report.findings.some((item) => item.id === 'A1')).toBe(false);
    expect(report.exitCode).toBe(1);
  });

  it.each([
    "import { IPermitClient } from 'permitio';" +
      " function f(p: IPermitClient) { p.api.getUser('u'); }",
    "import { IPermitApi } from 'permitio'; function f(a: IPermitApi) { a.getUser('u'); }",
    "import { ApiClient } from 'permitio'; const a = new ApiClient(c, l); a.getUser('u');",
    "import { IPermitApi } from 'permitio'; function f({getUser}: IPermitApi) { getUser('u'); }",
    "import * as SDK from 'permitio'; function f(p: SDK.Permit) { p.api.getUser('u'); }",
    "import { Permit } from 'permitio'; (unknown as Permit).api.getUser('u');",
    "import { Permit } from 'permitio'; let p; p = new Permit(); p.api.getUser('u');",
    "function app(p: import('permitio').Permit) { p.api.listUsers(); }",
    "import type { Permit } from 'permitio';" +
      ' function app(p: Permit | undefined) { p?.api.listUsers(); }',
  ])('recognizes SDK typed/direct clients: %s', async (source) => {
    const report = await scan(await project({ 'customer.ts': source }));
    expect(report.findings.some((item) => item.id === 'A1')).toBe(true);
  });

  it.each([
    "p.api[key]('u');",
    "let client = p; client = unrelated; client.api.getUser('u');",
    'sendElsewhere(p);',
    'export default p;',
    'export const api = p.api;',
    'const client = flag ? p : unrelated; client.api.getUser();',
    'const client = p || unrelated; client.api.getUser();',
    'let client; client = p; client = unrelated; client.api.getUser();',
    'const {...rest} = p.api; rest.getUser();',
    'returnValue({ client: p });',
    'returnValue([p.api]);',
    'returnValue({ ...p.api });',
    'function getUsers() { return p.api.users; }' +
      ' const result = await getUsers().unassignRole({}); result.data;',
    'const box = {}; box.client = p; box.client.api.getUser();',
    'const box = []; box[0] = p.api; box[0].getUser();',
    'class App { constructor() { this.client = p; } run() { this.client.api.getUser(); } }',
    "class App { client = new Permit({token:'opaque'}); run() {this.client.api.getUser();} }",
    'let a; ({api:a}=p); a.getUser();',
    'let a; a??=p.api; a.getUser();',
    'throw p.api;',
    'function* stream() { yield p.api; }',
    'class Child extends Permit {}; new Child().api.getUser();',
  ])('requires review for known unresolved/dynamic/escaped SDK sites: %s', async (source) => {
    const report = await scan(await project({ 'customer.ts': `${construct} ${source}` }));
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: 'A1',
        classification: 'REVIEW_REQUIRED',
      }),
    );
  });

  it.each([
    "import type { Permit } from 'permitio';" +
      " function app(p: Pick<Permit, 'api'>) { p.api.getUser(); }",
    "import type { Permit } from 'permitio';" +
      ' function app<T extends Permit>(p: T) { p.api.getUser(); }',
    "import('permitio').then(({Permit}) => {new Permit({token:'opaque'}).api.getUser();});",
    "import { Permit } from 'permitio';" +
      " class App { constructor() {this.client = new Permit({token:'opaque'});} }",
    "import type { Permit } from 'permitio'; function app(p: Holder<Permit>) {p.api.getUser();}",
    "import type { Permit } from 'permitio'; function app(p: Permit[]) {p[0].api.getUser();}",
    "import type { Permit } from 'permitio'; function app(p: Permit['api']) {p.getUser();}",
  ])('qualifies known unsupported SDK type/import boundaries: %s', async (source) => {
    const report = await scan(await project({ 'customer.ts': source }));
    expect(report.status).toBe('COMPLETE');
    expect(report.exitCode).toBe(1);
    expect(report.findings).toContainEqual(
      expect.objectContaining({ id: 'A1', classification: 'REVIEW_REQUIRED' }),
    );
  });

  it('ignores unrelated lookalikes, strings, comments and shadowed imported bindings', async () => {
    const report = await scan(
      await project({
        'customer.ts': `${construct}
      p.api.users.get('u');
      function other(Permit: any) { new Permit().api.getUser('u'); }
      function local(p: any) { p.api.getUser('u'); }
      const unrelated = { api: { getUser() {} } }; unrelated.api.getUser();
      const box = {}; box.client = unrelated; box.client.api.getUser();
      class App { client = unrelated; run() {this.client.api.getUser();} }
      function typed<T extends Other>(x: Pick<Other, 'api'>) {x.api.getUser();}
      function collections(x: Other[], y: Other['api']) {x[0].api.getUser();y.getUser();}
      class Derived extends Other {}; new Derived().api.getUser();
      let alias; ({api:alias} = unrelated); alias ??= unrelated.api;
      function* stream() {yield unrelated.api;} function fail() {throw unrelated.api;}
      import('permitio-other').then(({Permit}) => {new Permit().api.getUser();});
      const text = 'p.api.getMethods()'; // p.api.getUser('u');
    `,
      }),
    );
    expect(report.findings).toEqual([]);
    expect(report.exitCode).toBe(0);
  });

  it('ignores shadowed require and similarly named packages', async () => {
    const report = await scan(
      await project({
        'customer.js': `
      function other(require) { const SDK = require('permitio'); new SDK.Permit().api.getUser(); }
      import { Permit } from 'permitio-other'; new Permit().api.getUser();
    `,
      }),
    );
    expect(report.findings).toEqual([]);
  });

  it('reports selected result/config/error migrations on actual SDK-derived values', async () => {
    const report = await scan(
      await project({
        'customer.ts': `${construct}
      import { PermitApiError, EnvironmentCopyConflictStrategyEnum, Statistics } from 'permitio';
      const page = await p.api.users.list(); page.length;
      const result = await p.api.users.unassignRole({}); result.data;
      const bulk = await p.api.users.bulkUserCreate([]); bulk.operations;
      const config = p.config; config.token = 'new';
      const context = config.apiContext; context.level;
      function failure(error: PermitApiError<{secret: string}>) { error.originalError.request; }
    `,
      }),
    );
    expect(new Set(report.findings.map((item) => item.id))).toEqual(
      new Set(['A3', 'T2', 'F2', 'A2', 'E2', 'T1', 'T3']),
    );
  });

  it('finds removed named/CJS exports and deep entry imports', async () => {
    const report = await scan(
      await project({
        'customer.ts': `
      import { DeprecatedApiClient, ContextTransform } from 'permitio';
      import model from 'permitio/build/openapi';
      const { IDeprecatedPermitApi } = require('permitio');
    `,
      }),
    );
    expect(report.findings.filter((item) => item.id === 'A2')).toHaveLength(3);
    expect(report.findings.filter((item) => item.id === 'C2')).toHaveLength(1);
  });

  it('reports constructor, OPA hook and all-tenants review sites', async () => {
    const report = await scan(
      await project({
        'customer.ts': `
      import { Permit } from 'permitio';
      const p = new Permit({ token: '', opaAxiosInstance: transport });
      p.checkAllTenants('u', 'read', 'document');
    `,
      }),
    );
    expect(new Set(report.findings.map((item) => item.id))).toEqual(new Set(['F1', 'W2', 'W3']));
  });

  it('detects old dependency and runtime metadata separately from source', async () => {
    const report = await scan(
      await project({
        'customer.ts': 'const value = 1;',
        'package.json': JSON.stringify({
          dependencies: { permitio: '^2.7.5' },
          engines: { node: '>=18' },
        }),
        '.node-version': '22.12.0',
        Dockerfile: 'FROM node:20.0.0-alpine',
        '.tool-versions': 'nodejs 21.0.0',
      }),
    );
    expect(report.findings.filter((item) => item.id === 'P1')).toHaveLength(1);
    expect(report.findings.filter((item) => item.id === 'C1')).toHaveLength(4);
  });

  it('keeps explicit target metadata and exact supported runtime pins clean', async () => {
    const report = await scan(
      await project({
        'customer.ts': `${construct} p.api.users.get('u');`,
        'package.json': JSON.stringify({
          dependencies: { permitio: '^3.0.0' },
          engines: { node: '>=22.13.0' },
        }),
        '.nvmrc': '22.13.0',
        Dockerfile: 'FROM node:24.0.0-alpine',
      }),
    );
    expect(report.exitCode).toBe(0);
  });

  it.each(['^22.13.0 || ^24.0.0', '^23.0.0', '>=25.0.0', '26.x', '>=22.13.0 <27'])(
    'accepts customer engine ranges contained in the supported Node range: %s',
    async (node) => {
      const report = await scan(
        await project({
          'customer.ts': 'const value = 1;',
          'package.json': JSON.stringify({ engines: { node } }),
        }),
      );
      expect(report.exitCode).toBe(0);
      expect(report.findings).toEqual([]);
    },
  );

  it.each(['>=22', '22.x', '>=20 || >=25', '<22.13.0', '*', 'not-a-range', 26])(
    'requires review for engines admitting unsupported or unspecified Node versions: %s',
    async (node) => {
      const report = await scan(
        await project({
          'customer.ts': 'const value = 1;',
          'package.json': JSON.stringify({ engines: { node } }),
        }),
      );
      expect(report.exitCode).toBe(1);
      expect(report.findings).toContainEqual(
        expect.objectContaining({ id: 'C1', classification: 'REVIEW_REQUIRED' }),
      );
    },
  );

  it.each(['22.13.0', '23.0.0', '25.0.0', '26.11.0', '27.0.0'])(
    'accepts literal pins across supported Node majors: %s',
    async (node) => {
      const report = await scan(
        await project({
          'customer.ts': 'const value = 1;',
          '.node-version': node,
          '.nvmrc': `v${node}`,
          '.tool-versions': `nodejs ${node}`,
          Dockerfile: `FROM node:${node}-alpine`,
        }),
      );
      expect(report.exitCode).toBe(0);
      expect(report.findings).toEqual([]);
    },
  );

  it.each(['22.12.9', '20.0.0', '026.0.0', '26', '26.0.0-rc.1'])(
    'requires review for unsupported or ambiguous literal runtime pins: %s',
    async (node) => {
      const report = await scan(
        await project({ 'customer.ts': 'const value = 1;', '.node-version': node }),
      );
      expect(report.exitCode).toBe(1);
      expect(report.findings).toContainEqual(expect.objectContaining({ id: 'C1' }));
    },
  );

  it.each([
    '22.13.0-rc.1',
    '26.11.0-beta.1',
    '26.11.0-alpine-rc.1',
    '26.11.0-custom',
    '26.11.0@sha256:invalid',
    `22.13.0-rc.1@sha256:${'a'.repeat(64)}`,
  ])('requires review for prerelease or ambiguous Docker tags: %s', async (tag) => {
    const report = await scan(
      await project({ 'customer.ts': 'const value = 1;', Dockerfile: `FROM node:${tag}` }),
    );
    expect(report.exitCode).toBe(1);
    expect(report.findings).toContainEqual(expect.objectContaining({ id: 'C1' }));
  });

  it.each([
    '22.13.0',
    '26.11.0-alpine',
    '26.11.0-alpine3.23',
    '26.11.0-bookworm',
    '26.11.0-bookworm-slim',
    '26.11.0-trixie-slim',
    '26.11.0-slim',
    `26.11.0@sha256:${'a'.repeat(64)}`,
    `26.11.0-alpine@sha256:${'b'.repeat(64)}`,
  ])('accepts stable Docker tags with recognized distributions and digests: %s', async (tag) => {
    const report = await scan(
      await project({ 'customer.ts': 'const value = 1;', Dockerfile: `FROM node:${tag}` }),
    );
    expect(report.exitCode).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it.each([
    'FROM --platform=linux/arm64 node:20.0.0-alpine AS final',
    'from --platform=linux/amd64 node:22.12.9',
    'FROM --platform=$BUILDPLATFORM node:26.11.0',
    'FROM --platform=${TARGETPLATFORM} node:26.11.0',
    'FROM --platform=linux/arm64 ${BASE_IMAGE} AS final',
    'FROM --platform=linux/arm64 node:${NODE_VERSION}',
    'FROM --platform linux/arm64 node:26.11.0',
    'FROM --platform=linux/arm64 docker.io/library/node:20.0.0',
  ])('reviews every unsupported or ambiguous Docker stage: %s', async (stage) => {
    const report = await scan(
      await project({
        'customer.ts': 'const value = 1;',
        Dockerfile: `FROM node:26.11.0 AS build\n${stage}\n`,
      }),
    );
    expect(report.exitCode).toBe(1);
    expect(report.findings).toContainEqual(expect.objectContaining({ id: 'C1' }));
  });

  it('accepts supported literal Node pins across platform-qualified Docker stages', async () => {
    const report = await scan(
      await project({
        'customer.ts': 'const value = 1;',
        Dockerfile: `FROM --platform=linux/arm64 node:22.13.0-alpine AS build
from --platform=linux/amd64 docker.io/library/node:26.11.0-bookworm-slim AS final`,
      }),
    );
    expect(report.exitCode).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it.each([
    'FROM node AS final',
    'from library/node AS final',
    'FROM docker.io/node AS final',
    'FROM --platform=linux/amd64 docker.io/library/node AS final',
    `FROM node@sha256:${'a'.repeat(64)} AS final`,
    `from --platform=linux/arm64 node@sha256:${'a'.repeat(64)} AS final`,
    `FROM library/node@sha256:${'a'.repeat(64)} AS final`,
    `FROM --platform=linux/amd64 docker.io/library/node@sha256:${'a'.repeat(64)} AS final`,
    'FROM node: AS final',
    'FROM --platform=linux/amd64 node@ AS final',
  ])('reviews official Node stages without a literal stable version: %s', async (stage) => {
    const report = await scan(
      await project({
        'customer.ts': 'const value = 1;',
        Dockerfile: `FROM node:26.11.0 AS build\n${stage}\n`,
      }),
    );
    expect(report.status).toBe('COMPLETE');
    expect(report.exitCode).toBe(1);
    expect(report.failures).toEqual([]);
    expect(report.findings).toEqual([
      expect.objectContaining({ id: 'C1', classification: 'REVIEW_REQUIRED' }),
    ]);
  });

  it.each([
    'FROM node:26.11.0 AS node\nFROM node AS final',
    'FROM node:26.11.0 AS Node\nfrom --platform=linux/arm64 node AS final',
    'FROM node:26.11.0 AS build\nFROM build AS final',
    'FROM node:26.11.0 AS build\nFROM alpine:3.23 AS final',
    'FROM node:26.11.0 AS build\nFROM example/node:latest AS final',
  ])('keeps prior stage aliases and non-Node images clean: %s', async (dockerfile) => {
    const report = await scan(
      await project({ 'customer.ts': 'const value = 1;', Dockerfile: dockerfile }),
    );
    expect(report.status).toBe('COMPLETE');
    expect(report.exitCode).toBe(0);
    expect(report.failures).toEqual([]);
    expect(report.findings).toEqual([]);
  });

  it('makes partial parse failure incomplete even when migration findings exist', async () => {
    const report = await scan(
      await project({
        'old.ts': `${construct} p.api.getUser('u');`,
        'broken.ts': 'function broken( {',
      }),
    );
    expect(report.findings.some((item) => item.id === 'A1')).toBe(true);
    expect(report.status).toBe('INCOMPLETE');
    expect(report.exitCode).toBe(2);
    expect(report.failures).not.toEqual([]);
  });

  it.each([
    { 'component.vue': '<script>new Permit()</script>', 'ok.ts': 'const x = 1;' },
    { 'package.json': '{invalid', 'ok.ts': 'const x = 1;' },
    { 'README.md': 'No source in this project.' },
    { 'package.json': '{"dependencies": []}', 'ok.ts': 'const x = 1;' },
    { 'package.json': '{"engines": "node22"}', 'ok.ts': 'const x = 1;' },
    { 'package.json': '{"peerDependencies": null}', 'ok.ts': 'const x = 1;' },
  ])('does not report clean for unsupported/malformed/empty inputs', async (files) => {
    const report = await scan(await project(files));
    expect(report.status).toBe('INCOMPLETE');
    expect(report.exitCode).toBe(2);
  });

  it('does not follow symlinks or dependency/build exclusions', async () => {
    const path = await project({
      'customer.ts': 'const x = 1;',
      'package.json': '{}',
      'node_modules/dep.ts': `${construct} p.api.getUser('u');`,
      'dist/bundle.js': `${construct} p.api.getUser('u');`,
    });
    await symlink(path, join(path, 'loop'));
    await symlink(tmpdir(), join(path, 'escape'));
    const report = await scan(path);
    expect(report.findings).toEqual([]);
    expect(report.exitCode).toBe(2);
    expect(report.excluded.map((item) => item.path)).toEqual([
      'dist',
      'escape',
      'loop',
      'node_modules',
    ]);
    expect(report.failures[0].reason).toContain('escapes');
  });

  it('does not execute target code, scripts or target dependencies', async () => {
    const path = await project({
      'customer.js': `throw new Error('MUST NOT EXECUTE');
      const { Permit } = require('permitio'); new Permit().api.getUser('u');`,
      'package.json': JSON.stringify({ scripts: { prepare: 'touch EXECUTED' } }),
      'node_modules/permitio/index.js': "throw new Error('MUST NOT LOAD');",
    });
    const report = await scan(path);
    expect(report.findings.some((item) => item.id === 'A1')).toBe(true);
    await expect(readFile(join(path, 'EXECUTED'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns an actionable incomplete result for an unavailable root', async () => {
    const report = await scan(join(await project({}), 'missing'));
    expect(report.exitCode).toBe(2);
    expect(report.failures[0].reason).toContain('Cannot read scan root');
  });

  it('qualifies known SDK local-module indirection instead of declaring it clean', async () => {
    const report = await scan(
      await project({
        'client.ts': `${construct} export { p };`,
        'forward.ts': "export { p } from './client.js';",
        'use.ts': "import { p } from './forward.js'; p.api.getUser('u');",
      }),
    );
    expect(report.findings.map((item) => item.path)).toEqual(
      expect.arrayContaining(['client.ts', 'forward.ts', 'use.ts']),
    );
    expect(report.findings.every((item) => item.classification === 'REVIEW_REQUIRED')).toBe(true);
  });

  it.each([
    'function factory() { return p; } const value = factory(); value.api.getUser();',
    'module.exports = p;',
    'export { p };',
  ])('qualifies known SDK returns and exports: %s', async (source) => {
    const report = await scan(await project({ 'customer.ts': `${construct} ${source}` }));
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: 'A1',
        classification: 'REVIEW_REQUIRED',
      }),
    );
  });

  it('detects nested settings writes but permits live caller transport defaults', async () => {
    const report = await scan(
      await project({
        'customer.ts': `${construct}
      p.config.log.level = 'silent';
      p.config.multiTenancy.defaultTenant = 'other';
      p.config = unrelated;
      p.config.axiosInstance.defaults.headers.common['X-Caller'] = 'live';
    `,
      }),
    );
    expect(report.findings.filter((item) => item.id === 'F2')).toHaveLength(3);
  });

  it('does not merge unrelated globals across independent source files', async () => {
    const report = await scan(
      await project({
        'sdk.js':
          "const { Permit } = require('permitio'); const p = new Permit(); p.api.users.get('u');",
        'other.js': "const p = { api: { getUser() {} } }; p.api.getUser('u');",
      }),
    );
    expect(report.findings).toEqual([]);
  });

  it.each(['latest', 'workspace:*', '^3.malformed', '>=2 <4'])(
    'reviews ambiguous dependency %s',
    async (version) => {
      const report = await scan(
        await project({
          'source.ts': 'const x = 1;',
          'package.json': JSON.stringify({ dependencies: { permitio: version } }),
        }),
      );
      expect(report.findings).toContainEqual(
        expect.objectContaining({
          id: 'P1',
          classification: 'REVIEW_REQUIRED',
        }),
      );
    },
  );

  it('uses the documented real CLI status and parseable report', async () => {
    const path = await project({ 'customer.ts': `${construct} p.api.getUser('u');` });
    const result = spawnSync(process.execPath, [script, path], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).status).toBe('COMPLETE');
    expect(result.stderr).toBe('');
  });

  it('excludes build output only at a package root and scans same-named source folders', async () => {
    const sdk = `${construct} p.api.getUser('u');`;
    const report = await scan(
      await project({
        'package.json': '{}',
        'dist/bundle.js': sdk,
        'src/build/helper.ts': sdk,
        'packages/app/package.json': '{}',
        'packages/app/coverage/report.js': sdk,
        'packages/app/src/dist/tool.ts': sdk,
      }),
    );
    expect(report.excluded.map((item) => item.path)).toEqual(['dist', 'packages/app/coverage']);
    expect(new Set(report.findings.map((item) => item.path))).toEqual(
      new Set(['src/build/helper.ts', 'packages/app/src/dist/tool.ts']),
    );
    const bare = await scan(await project({ 'dist/bundle.js': sdk }));
    expect(bare.scanned).toEqual(['dist/bundle.js']);
    expect(bare.findings.some((item) => item.id === 'A1')).toBe(true);
  });

  it('scans extensionless Node shebang scripts under their real path', async () => {
    const report = await scan(
      await project({
        'bin/cli':
          "#!/usr/bin/env node\nconst { Permit } = require('permitio');\n" +
          "new Permit({ token: 'opaque' }).api.getUser('u');\n",
        'bin/tool':
          "#!/usr/bin/env -S npx tsx\nimport { Permit } from 'permitio';\n" +
          "const p: Permit = new Permit({ token: 'opaque' }); p.api.listUsers();\n",
        'bin/notes': 'plain text\n',
        '.env': '#!/usr/bin/env node\nTOKEN=never-read\n',
        LICENSE: 'MIT\n',
      }),
    );
    expect(report.status).toBe('COMPLETE');
    expect(report.scanned).toEqual(['bin/cli', 'bin/tool']);
    expect(report.findings).toContainEqual(
      expect.objectContaining({ id: 'A1', path: 'bin/cli', line: 3 }),
    );
    expect(report.findings).toContainEqual(expect.objectContaining({ id: 'A1', path: 'bin/tool' }));
    expect(report.excluded.map((item) => item.path)).toEqual(['.env', 'bin/notes', 'LICENSE']);
  });

  it.each([
    ['an MDX document', 'docs/page.mdx', "import { Permit } from 'permitio';\n\n# Page\n"],
    ['inline HTML script', 'index.html', '<html><script type="module">run()</script></html>'],
  ])('reports %s it cannot parse as incomplete coverage', async (_name, file, text) => {
    const report = await scan(await project({ 'customer.ts': 'const x = 1;', [file]: text }));
    expect(report.status).toBe('INCOMPLETE');
    expect(report.exitCode).toBe(2);
    expect(report.failures).toContainEqual(expect.objectContaining({ path: file }));
  });

  it('keeps HTML that only references external scripts out of the coverage status', async () => {
    const report = await scan(
      await project({
        'customer.ts': 'const x = 1;',
        'index.html': '<html><script type="module" src="./customer.js"></script></html>',
      }),
    );
    expect(report.status).toBe('COMPLETE');
    expect(report.excluded).toContainEqual(expect.objectContaining({ path: 'index.html' }));
  });

  it('records files over the size cap as incomplete without reading them', async () => {
    const report = await scan(
      await project({
        'customer.ts': `${construct} p.api.getUser('u');`,
        'large.ts': `const x = '${'x'.repeat(200)}';`,
        'large-notes': 'y'.repeat(200),
        'bin/large-cli': `#!/usr/bin/env node\n// ${'z'.repeat(200)}\n`,
      }),
      { maxFileBytes: 128 },
    );
    expect(report.status).toBe('INCOMPLETE');
    expect(report.exitCode).toBe(2);
    expect(report.failures.map((item) => item.path)).toEqual(['bin/large-cli', 'large.ts']);
    expect(report.failures[0].reason).toContain('128-byte scan limit');
    expect(report.excluded).toContainEqual(expect.objectContaining({ path: 'large-notes' }));
    expect(report.scanned).toEqual(['customer.ts']);
    expect(report.limitations.some((line) => line.includes('over 128 bytes'))).toBe(true);
  });

  it('ends an expired run as incomplete', async () => {
    const report = await scan(
      await project({ 'customer.ts': `${construct} p.api.getUser('u');` }),
      { deadlineMs: -1 },
    );
    expect(report.status).toBe('INCOMPLETE');
    expect(report.exitCode).toBe(2);
    expect(report.failures).toContainEqual(
      expect.objectContaining({ reason: expect.stringContaining('deadline') }),
    );
  });

  it.each([
    ['only a connection check', ['PermitConnectionError'], 1],
    ['the status check first', ['PermitPDPStatusError', 'PermitConnectionError'], 0],
    ['the connection check first', ['PermitConnectionError', 'PermitPDPStatusError'], 2],
  ])('reviews PDP error checks with %s', async (_name, order, count) => {
    const checks = order.map((name) => `if (error instanceof SDK.${name}) return 1;`).join(' ');
    const report = await scan(
      await project({
        'customer.ts': `import * as SDK from 'permitio';
        function handle(error: unknown) { ${checks} return 0; }`,
      }),
    );
    expect(report.findings.filter((item) => item.id === 'E1')).toHaveLength(count);
  });

  it('reviews throwOnError: false only in SDK-bearing files', async () => {
    const report = await scan(
      await project({
        'customer.ts': `${construct} await p.check('u', 'read', 'doc', {}, { throwOnError: false });`,
        'other.ts': 'export const options = { throwOnError: false };',
      }),
    );
    expect(report.findings.filter((item) => item.id === 'E1')).toEqual([
      expect.objectContaining({ path: 'customer.ts' }),
    ]);
  });

  it.each([
    ['log: { json: false }', 1],
    ['log: { level: "debug", json: process.env.JSON === "1" }', 1],
    ['log: logOptions', 1],
    ['log: { json: true }', 0],
    ['log: { level: "silent" }', 0],
  ])('reviews constructor log option %s', async (option, count) => {
    const report = await scan(
      await project({
        'customer.ts': `import { Permit } from 'permitio'; const logOptions = {};
        new Permit({ token: 'opaque', ${option} });`,
      }),
    );
    expect(report.findings.filter((item) => item.id === 'F1')).toHaveLength(count);
  });

  it.each([
    ["import merge from 'lodash/merge';", {}, ['lodash']],
    ["const retry = require('axios-retry');", {}, ['axios-retry']],
    ["import { x } from '@bitauth/libauth';", {}, ['@bitauth/libauth']],
    ["export { pathToRegexp } from 'path-to-regexp';", {}, ['path-to-regexp']],
    ["import parse = require('url-parse');", {}, ['url-parse']],
    ["const hook = await import('require-in-the-middle');", {}, ['require-in-the-middle']],
    ["import _ from 'lodash';", { 'package.json': '{"dependencies":{"lodash":"4.17.21"}}' }, []],
    [
      "import _ from 'lodash';",
      {
        'package.json': '{"devDependencies":{"lodash":"4.17.21"}}',
        'packages/app/package.json': '{}',
      },
      [],
    ],
    ["import _ from 'lodash-es'; import x from './lodash';", {}, []],
  ])('reviews former transitive package use: %s', async (source, extra, packages) => {
    const file = Object.keys(extra).some((name) => name.startsWith('packages/'))
      ? 'packages/app/customer.ts'
      : 'customer.ts';
    const report = await scan(await project({ ...extra, [file]: source }));
    expect(
      report.findings.filter((item) => item.id === 'C3').map((item) => item.action.split(' ')[1]),
    ).toEqual(packages);
  });

  it('keeps the packed-tooling fixture expectations with the current rules', async () => {
    const fixtures = resolve('scripts/fixtures/migration');
    const before = await scan(join(fixtures, 'before'));
    expect(before.status).toBe('COMPLETE');
    expect(new Set(before.findings.map((item) => item.id))).toEqual(
      new Set(['A1', 'A3', 'P1', 'C1']),
    );
    const after = await scan(join(fixtures, 'after'));
    expect(after.status).toBe('COMPLETE');
    expect(after.findings).toEqual([]);
    expect(after.scanned).toEqual(['consumer.cts', 'consumer.mts', 'package.json']);
  });

  it('lists every migration ID without a scanner rule in the limitations', async () => {
    const source = await readFile(sourceScript, 'utf8');
    const guide = await readFile(resolve('MIGRATION.md'), 'utf8');
    const ids = [...guide.matchAll(/^### ([A-Z]\d+) —/gmu)].map((match) => match[1]);
    // IDs passed to add(node, 'ID', ...) or written as id: 'ID' in a finding.
    const emitted = new Set(
      [...source.matchAll(/\badd\(\s*[\w.]+,\s*'([A-Z]\d)'|\bid: '([A-Z]\d)'/gu)].map(
        (match) => match[1] ?? match[2],
      ),
    );
    const optional = ids.filter((id) => id.startsWith('N'));
    expect(NOT_DETECTED).toEqual(ids.filter((id) => !emitted.has(id) && !optional.includes(id)));
    const report = await scan(await project({ 'customer.ts': 'const x = 1;' }));
    expect(report.limitations.join('\n')).toContain(NOT_DETECTED.join(', '));
  });

  it('exits 2 with a clear message instead of loading an ancestor compiler', async () => {
    const bare = join(decoyRoot, 'bare-skill');
    await copySkill(bare);
    const path = await project({ 'customer.ts': 'const x = 1;' });
    const result = spawnSync(process.execPath, [join(bare, 'scripts/scan.mjs'), path], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Scanner prerequisite unavailable: typescript');
    expect(result.stderr).toContain("outside the skill's own node_modules");
    await expect(readFile(join(decoyRoot, 'DECOY_LOADED'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('exits 2 when the installed prerequisite differs from its pin', async () => {
    const skewed = join(decoyRoot, 'skewed-skill');
    await copySkill(skewed);
    await plantDecoys(skewed);
    const manifest = join(skewed, 'node_modules/typescript/package.json');
    await writeFile(
      manifest,
      JSON.stringify({ name: 'typescript', version: '5.9.3', main: 'index.js' }),
    );
    const path = await project({ 'customer.ts': 'const x = 1;' });
    const result = spawnSync(process.execPath, [join(skewed, 'scripts/scan.mjs'), path], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('typescript 5.9.3 is installed, but the skill pins 6.0.3');
    await expect(readFile(join(skewed, 'DECOY_LOADED'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects invalid CLI limits with the usage and status 2', () => {
    const result = spawnSync(process.execPath, [script, '--deadline-ms', 'soon', '.'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('--deadline-ms');
  });
});
