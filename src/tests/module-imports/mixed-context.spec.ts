import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

const runtimeProbe = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from 'permitio';
const cjs = createRequire(import.meta.url)('permitio');
for (const [source, target] of [[cjs, esm], [esm, cjs]]) {
  const context = new source.ApiContext();
  context._saveApiKeyAccessibleScope('org', 'project');
  context.setEnvironmentLevelContext('org', 'project', 'environment');
  const options = { token: 'fixture', apiContext: context, log: { level: 'silent' } };
  const first = new target.Permit(options);
  const second = new target.Permit(options);
  assert.notEqual(first.config.apiContext, context);
  assert.notEqual(first.config.apiContext, second.config.apiContext);
  assert.equal(first.config.apiContext.permittedAccessLevel, source.ApiKeyLevel.PROJECT_LEVEL_API_KEY);
  assert.deepEqual(first.config.apiContext.environmentContext, {
    projId: 'project', envId: 'environment',
  });
  assert.throws(() => first.config.apiContext.setProjectLevelContext('org', 'forbidden-project'));
  context.setEnvironmentLevelContext('org', 'project', 'caller-environment');
  first.config.apiContext.setEnvironmentLevelContext('org', 'project', 'first-environment');
  assert.equal(context.environment, 'caller-environment');
  assert.equal(first.config.apiContext.environment, 'first-environment');
  assert.equal(second.config.apiContext.environment, 'environment');
  const restricted = new source.ApiContext();
  restricted._saveApiKeyAccessibleScope('org', 'project', 'only-environment');
  restricted.setEnvironmentLevelContext('org', 'project', 'only-environment');
  const restrictedClient = new target.Permit({ ...options, apiContext: restricted });
  assert.throws(() => restrictedClient.config.apiContext.setProjectLevelContext('org', 'forbidden-project'));
  assert.throws(() => restrictedClient.config.apiContext.setEnvironmentLevelContext('org', 'project', 'forbidden-environment'));
  const uninitialized = new source.ApiContext();
  const emptyClient = new target.Permit({ ...options, apiContext: uninitialized });
  assert.equal(emptyClient.config.apiContext.contextLevel, 0);
  assert.equal(emptyClient.config.apiContext.permittedAccessLevel, source.ApiKeyLevel.WAIT_FOR_INIT);
}
console.log('MIXED_CONTEXT_OK');
`;

test('package-name CJS and ESM contexts preserve permissions and independent mutable selections', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', runtimeProbe],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  expect(stdout.trim()).toBe('MIXED_CONTEXT_OK');
});

test('strict consumers can pass complete contexts in both module directions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-mixed-context-types-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'node_modules'));
  await symlink(root, join(directory, 'node_modules/permitio'), 'dir');
  const consumer = join(directory, 'consumer.mts');
  await writeFile(
    consumer,
    `
import { ApiContext, Permit } from 'permitio';
import commonjs = require('permitio');
const fromCommonjs: ApiContext = new commonjs.ApiContext();
new Permit({ token: 'typecheck-only', apiContext: fromCommonjs });
const fromEsm: commonjs.ApiContext = new ApiContext();
new commonjs.Permit({ token: 'typecheck-only', apiContext: fromEsm });
// @ts-expect-error Both directions require the complete ApiContext type.
new Permit({ token: 'typecheck-only', apiContext: { setEnvironmentLevelContext() {} } });
// @ts-expect-error A CJS consumer also rejects an incomplete context.
new commonjs.Permit({ token: 'typecheck-only', apiContext: {} });
`,
  );
  const config = join(directory, 'tsconfig.json');
  await writeFile(
    config,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2023',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noImplicitOverride: true,
        noPropertyAccessFromIndexSignature: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
        noEmit: true,
      },
      files: [consumer],
    }),
  );
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(root, 'node_modules/typescript/lib/tsc.js'), '-p', config],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  expect(stdout).toBe('');
  expect(stderr).toBe('');
});
