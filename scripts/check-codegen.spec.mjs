import test from 'ava';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const cleanTypes = {
  'role-create.ts': "export interface RoleCreate { 'key': string; 'extends'?: Array<string>; }",
  'resource-role-create.ts': "export interface ResourceRoleCreate { 'extends'?: Array<string>; }",
  'group-assign-user.ts': "export interface GroupAssignUser { 'tenant': string; }",
  'tenant-obj.ts': "export interface TenantObj { 'id': string; }",
  'user-obj.ts': "export interface UserObj { 'id': string; }",
  'action-obj.ts': "export interface ActionObj { 'id': string; }",
  'codegen-probe.ts': `export interface CodegenProbe {
    'nullable_string'?: string | null;
    'nullable_any_of'?: string | null;
    'nullable_ref'?: CodegenProbeInner | null;
    'nullable_array'?: Array<number> | null;
  }`,
};

// Only the external generator is mocked; the CLI, filesystem and type checks are real.
const wrapper = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync('mock-generator.json'));
fs.writeFileSync('invocation.json', JSON.stringify({args: process.argv.slice(2),
  cwd: process.cwd(), pwd: process.env.PWD, initCwd: process.env.INIT_CWD}));
if (config.exit) process.exit(config.exit);
if (config.signal) process.kill(process.pid, config.signal);
const out = process.argv[process.argv.indexOf('-o') + 1];
const modelPackage = config.modelPackage || 'types';
const types = path.join(out, modelPackage);
fs.mkdirSync(types, {recursive: true});
for (const [name, source] of Object.entries(config.types)) {
  fs.writeFileSync(path.join(types, name), source);
}
for (let i = Object.keys(config.types).length; i < 344; i++) {
  fs.writeFileSync(path.join(types, 'filler-' + i + '.ts'), 'export interface Filler {}');
}
const meta = path.join(out, '.openapi-generator');
fs.mkdirSync(meta, {recursive: true});
if (!config.noVersion) fs.writeFileSync(path.join(meta, 'VERSION'), config.version || '7.25.0');
if (!config.noManifest) {
  const entries = fs.readdirSync(types).map(f => modelPackage + '/' + f);
  if (config.missingFile) entries.push(modelPackage + '/missing.ts');
  fs.writeFileSync(path.join(meta, 'FILES'), config.emptyManifest ? '' : entries.join('\\n'));
}
`;

function setup(t, changes = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'codegen test ')));
  t.teardown(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['scripts', 'src/tests/codegen/fixtures', 'node_modules/.bin']) {
    mkdirSync(join(dir, name), { recursive: true });
  }
  copyFileSync(join(root, 'scripts/check-codegen.mjs'), join(dir, 'scripts/check-codegen.mjs'));
  symlinkSync(join(root, 'node_modules/typescript'), join(dir, 'node_modules/typescript'), 'dir');
  const wrapperDir = join(dir, 'node_modules/@openapitools/openapi-generator-cli');
  mkdirSync(wrapperDir, { recursive: true });
  writeFileSync(join(wrapperDir, 'main.js'), wrapper, { mode: 0o755 });
  symlinkSync(join(wrapperDir, 'main.js'), join(dir, 'node_modules/.bin/openapi-generator-cli'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify(packageJson));
  writeFileSync(join(dir, 'openapitools.json'), '{"generator-cli":{"version":"7.25.0"}}');
  writeFileSync(join(dir, 'src/tests/codegen/fixtures/openapi-3.1.0.json'), '{"openapi":"3.1.0"}');
  const config = { types: { ...cleanTypes }, ...changes };
  writeFileSync(join(dir, 'mock-generator.json'), JSON.stringify(config));
  return dir;
}

function run(dir, env = {}) {
  const result = spawnSync(process.execPath, [join(dir, 'scripts/check-codegen.mjs')], {
    cwd: tmpdir(),
    env: { ...process.env, PWD: tmpdir(), INIT_CWD: tmpdir(), ...env },
    encoding: 'utf8',
  });
  return { ...result, output: result.stdout + result.stderr };
}

function fails(t, dir, pattern) {
  const result = run(dir);
  t.is(result.status, 1, result.output);
  t.regex(result.output, pattern);
  t.false(result.output.includes('codegen guard OK'));
  t.deepEqual(
    readdirSync(join(dir, 'node_modules')).filter((f) => f.startsWith('.codegen-')),
    [],
  );
}

test('uses the repository pin from another directory and relative paths with spaces', (t) => {
  const dir = setup(t);
  const result = run(dir, { TMPDIR: dir });
  t.is(result.status, 0, result.output);
  t.regex(result.output, /7\.25\.0/);
  const invocation = JSON.parse(readFileSync(join(dir, 'invocation.json'), 'utf8'));
  t.is(invocation.pwd, dir);
  t.is(invocation.initCwd, dir);
  for (const flag of ['-i', '-o']) {
    t.false(invocation.args[invocation.args.indexOf(flag) + 1].includes(' '));
  }
  t.deepEqual(
    readdirSync(join(dir, 'node_modules')).filter((f) => f.startsWith('.codegen-')),
    [],
  );
});

test('invokes the Node entry point without requiring a platform-specific bin shim', (t) => {
  const dir = setup(t);
  rmSync(join(dir, 'node_modules/.bin/openapi-generator-cli'));
  t.is(run(dir).status, 0);
});

for (const [label, file, pattern] of [
  ['fixture', 'src/tests/codegen/fixtures/openapi-3.1.0.json', /fixture.*not found/i],
  ['wrapper', 'node_modules/@openapitools/openapi-generator-cli/main.js', /yarn install/],
  ['pin', 'openapitools.json', /openapitools.json/],
]) {
  test(`reports a missing ${label} without blaming generator compatibility`, (t) => {
    const dir = setup(t);
    rmSync(join(dir, file));
    fails(t, dir, pattern);
    t.notRegex(run(dir).output, /must pin a 3.1-native/);
  });
}

for (const [label, changes, pattern] of [
  ['nonzero exit', { exit: 17 }, /exit 17/],
  ['signal termination', { signal: 'SIGTERM' }, /SIGTERM/],
  ['missing completion version', { noVersion: true }, /VERSION/],
  ['missing completion manifest', { noManifest: true }, /FILES/],
  ['empty completion manifest', { emptyManifest: true }, /manifest|FILES/i],
  ['missing generated file', { missingFile: true }, /missing\.ts/],
  ['wrong generator version', { version: '6.2.1' }, /6\.2\.1.*7\.25\.0/],
]) {
  test(`rejects ${label}`, (t) => fails(t, setup(t, changes), pattern));
}

for (const [label, source] of [
  ['bare any', "export interface ProjectObj { 'id': any; }"],
  ['nullable any', "export interface ProjectObj { 'id': any | null; }"],
  ['array of any', "export interface ProjectObj { 'id': Array<any>; }"],
  ['whole-model collapse', 'export interface ProjectObj {\n    [key: string]: any;\n}'],
]) {
  test(`rejects ${label} outside the original canaries`, (t) => {
    const types = { ...cleanTypes, 'project-obj.ts': source };
    fails(t, setup(t, { types }), /project-obj\.ts/);
  });
}

for (const file of ['role-create.ts', 'resource-role-create.ts']) {
  test(`rejects degraded inheritance in ${file}`, (t) => {
    const types = { ...cleanTypes, [file]: cleanTypes[file].replace('Array<string>', 'any') };
    fails(t, setup(t, { types }), /extends/);
  });
}

for (const [label, value] of [
  ['missing', undefined],
  ['property missing', 'export interface TenantObj {}'],
  ['degraded', "export interface TenantObj { 'id': any; }"],
  ['wrong scalar', "export interface TenantObj { 'id': number; }"],
]) {
  test(`rejects a ${label} canary`, (t) => {
    const types = { ...cleanTypes, 'tenant-obj.ts': value };
    fails(t, setup(t, { types }), /tenant-obj\.ts/);
  });
}

test('rejects lost OpenAPI 3.1 nullability', (t) => {
  const types = {
    ...cleanTypes,
    'codegen-probe.ts': cleanTypes['codegen-probe.ts'].replace('string | null', 'string'),
  };
  fails(t, setup(t, { types }), /nullable_string/);
});

test('allows nested free-form dictionaries and comments mentioning index signatures', (t) => {
  const types = {
    ...cleanTypes,
    'metadata.ts': `/** [key: string]: any; */
      export interface Metadata { 'key': string; 'metadata'?: { [key: string]: any; }; }`,
    'audit-log-model.ts': "export interface AuditLogModel { 'input': any; }",
  };
  const result = run(setup(t, { types }));
  t.is(result.status, 0, result.output);
  t.notRegex(result.output, /fully typed/);
});

test('reads additional properties and validation flags from the package script', (t) => {
  const dir = setup(t, { modelPackage: 'models' });
  const pkg = structuredClone(packageJson);
  pkg.scripts['generate-openapi-client'] = pkg.scripts['generate-openapi-client']
    .replace('modelPackage=types', 'modelPackage=models,stringEnums=true')
    .replace(' --skip-validate-spec', '');
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  const result = run(dir);
  t.is(result.status, 0, result.output);
  const { args } = JSON.parse(readFileSync(join(dir, 'invocation.json'), 'utf8'));
  t.true(args.some((arg) => arg.includes('modelPackage=models,stringEnums=true')));
  t.false(args.includes('--skip-validate-spec'));
});

for (const [label, transform, pattern] of [
  ['generator flag', (s) => s.replace('-g typescript-axios', ''), /generate-openapi-client/],
  ['additional properties', (s) => s.replace(/--additional-properties=\S+/, ''), /additional/],
  ['unknown flag', (s) => s.replace(' -g ', ' --unknown-option -g '), /unsupported|unknown/i],
]) {
  test(`rejects an unsupported package script: ${label}`, (t) => {
    const dir = setup(t);
    const pkg = structuredClone(packageJson);
    pkg.scripts['generate-openapi-client'] = transform(pkg.scripts['generate-openapi-client']);
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
    fails(t, dir, pattern);
  });
}

test('rejects a downgraded fixture header', (t) => {
  const dir = setup(t);
  writeFileSync(join(dir, 'src/tests/codegen/fixtures/openapi-3.1.0.json'), '{"openapi":"3.0.3"}');
  fails(t, dir, /3\.1\.0/);
});

for (const [label, file, content, pattern] of [
  ['invalid JSON', 'openapitools.json', '{', /Cannot read JSON.*openapitools.json/],
  ['missing version', 'openapitools.json', '{}', /explicit stable generator version/],
  [
    'non-numeric version',
    'openapitools.json',
    '{"generator-cli":{"version":"latest"}}',
    /explicit stable generator version/,
  ],
  ['missing script', 'package.json', '{}', /generate-openapi-client/],
]) {
  test(`rejects ${label} before generation`, (t) => {
    const dir = setup(t);
    writeFileSync(join(dir, file), content);
    fails(t, dir, pattern);
  });
}

for (const [label, transform, pattern] of [
  ['unsafe options', (s) => s.replace('modelPackage=types', 'modelPackage=$HOME'), /syntax/],
  ['missing model directory', (s) => s.replace(',modelPackage=types', ''), /modelPackage/],
  [
    'nested model directory',
    (s) => s.replace('modelPackage=types', 'modelPackage=..'),
    /modelPackage/,
  ],
]) {
  test(`rejects ${label}`, (t) => {
    const dir = setup(t);
    const pkg = structuredClone(packageJson);
    pkg.scripts['generate-openapi-client'] = transform(pkg.scripts['generate-openapi-client']);
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
    fails(t, dir, pattern);
  });
}

for (const [label, source, pattern] of [
  ['type alias collapse', 'export type Example = any;', /type alias Example/],
  ['untyped property', 'export interface Example { key; }', /example.ts:key/],
  ['invalid TypeScript', 'export interface Example {', /Invalid generated TypeScript/],
]) {
  test(`rejects ${label}`, (t) => {
    const types = { ...cleanTypes, 'example.ts': source };
    fails(t, setup(t, { types }), pattern);
  });
}

test('rejects model files missing from the completion manifest', (t) => {
  const dir = setup(t);
  const path = join(dir, 'node_modules/@openapitools/openapi-generator-cli/main.js');
  writeFileSync(path, wrapper + "\nfs.writeFileSync(path.join(types, 'unlisted.ts'), '');");
  fails(t, dir, /differ from the completion manifest/);
});

test('rejects a missing model directory after reported completion', (t) => {
  const dir = setup(t);
  const path = join(dir, 'node_modules/@openapitools/openapi-generator-cli/main.js');
  writeFileSync(path, wrapper + '\nfs.rmSync(types, {recursive: true});');
  fails(t, dir, /Incomplete generation/);
});

test('reports yarn install when all node dependencies are missing', (t) => {
  const dir = setup(t);
  rmSync(join(dir, 'node_modules'), { recursive: true });
  const result = run(dir);
  t.is(result.status, 1);
  t.regex(result.output, /yarn install/);
  t.notRegex(result.output, /ERR_MODULE_NOT_FOUND/);
});
