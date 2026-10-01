import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import ts from '@permitio/compiler-tools';
import { inspectReleaseArchive, validatePackageSurface } from '#scripts/release-artifact.mjs';
import { evaluateTestReport } from '#scripts/test-report.mjs';

function checked(command, args, { cwd, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error(
      `${command} consumer check failed: ${result.error?.message ?? result.stderr + result.stdout}`,
    );
  }
  return result.stdout;
}

/** Installs and checks supplied bytes in an external directory using local customer fixtures. */
export function checkPackedConsumers({ root = process.cwd(), artifact, sha256 }) {
  artifact = resolve(artifact);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const inspected = validatePackageSurface(inspectReleaseArchive(artifact), manifest);
  if (sha256 !== undefined && inspected.sha256 !== sha256)
    throw new Error('Packed consumer input hash differs from the validated candidate.');
  const directory = mkdtempSync(join(tmpdir(), 'permit-packed-consumer-'));
  try {
    const consumer = join(directory, 'consumer');
    mkdirSync(consumer);
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({
        private: true,
        dependencies: { permitio: `file:${artifact}` },
        packageManager: manifest.packageManager,
      }),
    );
    writeFileSync(
      join(consumer, 'pnpm-workspace.yaml'),
      'packages: []\nignoreScripts: true\nminimumReleaseAge: 1440\nautoInstallPeers: false\n',
    );
    checked('pnpm', ['install', '--offline', '--ignore-scripts'], { cwd: consumer });
    const packageRoot = realpathSync(join(consumer, 'node_modules/permitio'));
    if (packageRoot.startsWith(realpathSync(root) + sep))
      throw new Error('Consumer resolved the working tree instead of the supplied archive.');
    for (const file of ['consumer.mts', 'consumer.cts'])
      cpSync(join(root, 'scripts/fixtures/migration/after', file), join(consumer, file));
    for (const file of ['types.mts', 'types.cts'])
      cpSync(join(root, 'scripts/fixtures/migration', file), join(consumer, file));
    cpSync(join(root, 'scripts/fixtures/packed-consumer.mts'), join(consumer, 'mixed.mts'));
    const guide = /```ts\n([\s\S]*?)\n```/u.exec(readFileSync(join(root, 'MIGRATION.md'), 'utf8'));
    if (!guide) throw new Error('Migration guide has no complete TypeScript example.');
    writeFileSync(join(consumer, 'guide.mts'), guide[1]);
    const compiler = join(root, 'node_modules/typescript/bin/tsc');
    const modes = [];
    for (const [module, moduleResolution] of [
      ['Node16', 'Node16'],
      ['NodeNext', 'NodeNext'],
      ['ESNext', 'Bundler'],
    ]) {
      const files = [
        'consumer.mts',
        'types.mts',
        'guide.mts',
        ...(module === 'ESNext' ? [] : ['consumer.cts', 'types.cts', 'mixed.mts']),
      ];
      const options = {
        target: 'ES2023',
        module,
        moduleResolution,
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noImplicitOverride: true,
        noPropertyAccessFromIndexSignature: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        skipLibCheck: false,
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
        noEmit: true,
      };
      const config = join(consumer, 'tsconfig.json');
      writeFileSync(config, JSON.stringify({ compilerOptions: options, files }));
      checked(process.execPath, [compiler, '-p', config], { cwd: consumer });
      const program = ts.createProgram(
        files.map((file) => join(consumer, file)),
        ts.convertCompilerOptionsFromJson(options, consumer).options,
      );
      const diagnostics = ts.getPreEmitDiagnostics(program);
      if (diagnostics.length)
        throw new Error(
          ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCurrentDirectory: () => consumer,
            getCanonicalFileName: (path) => path,
            getNewLine: () => '\n',
          }),
        );
      for (const [entry, format, extension] of [
        ['consumer.mts', ts.ModuleKind.ESNext, '.d.mts'],
        ['consumer.cts', ts.ModuleKind.CommonJS, '.d.ts'],
      ]) {
        const resolved = ts.resolveModuleName(
          'permitio',
          join(consumer, entry),
          program.getCompilerOptions(),
          ts.sys,
          undefined,
          undefined,
          format,
        ).resolvedModule;
        const expected = join(packageRoot, `build/index${extension}`);
        const source = resolved && program.getSourceFile(resolved.resolvedFileName);
        if (
          !resolved ||
          realpathSync(resolved.resolvedFileName) !== expected ||
          source?.impliedNodeFormat !== format
        )
          throw new Error(`${moduleResolution} resolved the wrong ${entry} declaration format.`);
      }
      modes.push(moduleResolution);
    }
    const probe = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esm from 'permitio';
const require = createRequire(import.meta.url);
const cjs = require('permitio');
assert.equal(fileURLToPath(import.meta.resolve('permitio')), ${JSON.stringify(
      join(packageRoot, 'build/index.mjs'),
    )});
assert.equal(require.resolve('permitio'), ${JSON.stringify(join(packageRoot, 'build/index.js'))});
for (const [from, to] of [[esm, cjs], [cjs, esm]]) {
  assert.equal(typeof to.PermitApiError, 'function');
  assert.equal(typeof to.PermitConnectionError, 'function');
  const context = new from.ApiContext();
  context._saveApiKeyAccessibleScope('org', 'project');
  context.setEnvironmentLevelContext('org', 'project', 'env');
  const permit = new to.Permit({ token: 'fixture', apiContext: context, log: { level: 'silent' } });
  assert.equal(permit.config.apiContext.environment, 'env');
  assert.equal(typeof permit.check, 'function');
}
console.log('PACKED_LOADERS_PASS');
`;
    checked(process.execPath, ['--input-type=module', '-e', probe], { cwd: consumer });
    const native = join(directory, 'migration.json');
    checked(
      process.execPath,
      [
        join(root, 'node_modules/vitest/vitest.mjs'),
        'run',
        '--project',
        'codegen',
        'scripts/migration-package.test.mjs',
        '--reporter=json',
        `--outputFile=${native}`,
      ],
      { cwd: root, env: { ...process.env, PERMIT_PACKED_ARTIFACT: artifact } },
    );
    const migration = evaluateTestReport(JSON.parse(readFileSync(native, 'utf8')), {
      root,
      expectedFiles: ['scripts/migration-package.test.mjs'],
      env: process.env,
    });
    if (migration.status !== 'PASS' || migration.executed < 7)
      throw new Error('Packed migration fixture did not execute every required behavior test.');
    return {
      status: 'PASS',
      node: process.versions.node,
      artifactSha256: inspected.sha256,
      version: inspected.manifest.version,
      modes,
      loaders: ['import', 'require'],
      migration,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Runs the clean customer gate and saves only its bounded, credential-free summary. */
export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      artifact: { type: 'string' },
      output: { type: 'string' },
      sha256: { type: 'string' },
    },
  });
  if (!values.artifact || !values.output) throw new Error('Use --artifact TGZ --output JSON.');
  let report;
  try {
    report = checkPackedConsumers({ artifact: values.artifact, sha256: values.sha256 });
  } catch (error) {
    console.error(`Packed consumers did not pass: ${error.message}`);
    report = { status: 'INVALID', node: process.versions.node };
  }
  mkdirSync(dirname(resolve(values.output)), { recursive: true });
  writeFileSync(values.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Packed consumers: ${report.status}.`);
  return report.status === 'PASS' ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = main();
