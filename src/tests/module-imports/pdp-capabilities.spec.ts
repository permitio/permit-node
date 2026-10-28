import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const consumer = `
declare const permit: sdk.Permit;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
const options: sdk.GetUserPermissionsConfig = { context: { enabled: false }, timeout: 0 };
const permissions = permit.getUserPermissions('alice', ['east'], [], [], options);
const users = permit.getAuthorizedUsers('read', {
  type: 'document', key: 'one', tenant: 'east', attributes: { enabled: false },
}, { request: true }, { timeout: 0, throwOnError: false });
const tenants = permit.getUserTenants({ key: 'alice', attributes: { eligible: true } });
type Users = Assert<Equal<Awaited<typeof users>, sdk.IAuthorizedUsersResult>>;
type Tenants = Assert<Equal<Awaited<typeof tenants>, sdk.TenantDetails[]>>;
const objects = [{
  type: 'document', key: 'one', title: 'UI title', context: { enabled: false },
}] as const;
const filtered = permit.filterObjects('alice', 'read', objects, { request: true });
type Objects = Assert<Equal<Awaited<typeof filtered>, Array<(typeof objects)[number]>>>;
const item: sdk.IFilterObject = { type: 'document', context: { request: true } };
const assignment: sdk.IAuthorizedUserAssignment = {
  user: 'alice', tenant: 'east', resource: 'document:one', role: 'reader', future: null,
};
function inspectResults(result: Awaited<typeof users>, memberships: Awaited<typeof tenants>,
  kept: Awaited<typeof filtered>) {
  const resource: string = result.resource;
  const tenant: string = result.tenant;
  const role: string | undefined = result.users['alice']?.[0]?.role;
  const title: 'UI title' | undefined = kept[0]?.title;
  void [resource, tenant, role, title, memberships[0]?.attributes];
}
void [permissions, item, assignment, inspectResults];
void (null as unknown as [Users, Tenants, Objects]);
// @ts-expect-error Permission queries accept context in the fifth options argument only.
permit.getUserPermissions('alice', [], [], [], {}, { enabled: true });
// @ts-expect-error A general check configuration cannot silently ignore query context.
permit.check('alice', 'read', 'document', {}, { context: { enabled: true } });
// @ts-expect-error The query context must be a dictionary.
permit.getUserPermissions('alice', [], [], [], { context: 'request' });
// @ts-expect-error User-tenants needs a user key or a typed user.
permit.getUserTenants({ attributes: { eligible: true } });
// @ts-expect-error Authorized users retains its full response envelope.
const ids: Promise<string[]> = permit.getAuthorizedUsers('read', 'document');
// @ts-expect-error A filtering resource must declare its type.
permit.filterObjects('alice', 'read', [{ key: 'one' }]);
// @ts-expect-error Filtering retains object types, rather than returning decisions.
const decisions: Promise<boolean[]> = permit.filterObjects('alice', 'read', objects);
// @ts-expect-error Exact optional resource/context fields cannot be explicit undefined.
permit.filterObjects('alice', 'read', [{ type: 'document', context: undefined }]);
const urlOptions: sdk.CheckUrlConfig = { tenant: 'east', context: { enabled: false }, timeout: 0 };
const urlDecision = permit.checkUrl({ key: 'alice' }, 'CUSTOM', 'https://example.test/document', urlOptions);
type UrlDecision = Assert<Equal<Awaited<typeof urlDecision>, boolean>>;
void (null as unknown as UrlDecision);
// @ts-expect-error URL checks require a method string.
permit.checkUrl('alice', 7, 'https://example.test/document');
// @ts-expect-error URL checks take per-call options in the fourth argument.
permit.checkUrl('alice', 'GET', 'https://example.test/document', 'east');
// @ts-expect-error URL check context must be a dictionary.
permit.checkUrl('alice', 'GET', 'https://example.test/document', { context: 'request' });
// @ts-expect-error URL check tenant must be a string.
permit.checkUrl('alice', 'GET', 'https://example.test/document', { tenant: 7 });
// @ts-expect-error Exact optional URL config fields cannot be explicitly undefined.
permit.checkUrl('alice', 'GET', 'https://example.test/document', { context: undefined });
// @ts-expect-error ContextStore remains an internal helper, not an activated runtime API.
new sdk.ContextStore();
void [ids, decisions];
`;

test('both published entries expose the approved PDP discovery and filter methods', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from 'permitio';
const cjs = createRequire(import.meta.url)('permitio');
for (const sdk of [esm, cjs]) {
  const permit = new sdk.Permit({ token: 'fixture', log: { level: 'silent' } });
  for (const method of ['getUserPermissions', 'getAuthorizedUsers', 'getUserTenants', 'filterObjects'])
    assert.equal(typeof permit[method], 'function');
  assert.equal(typeof permit.checkAllTenants, 'function');
  assert.equal(sdk.ContextStore, undefined);
  assert.equal(sdk.Enforcer, undefined);
  assert.equal(typeof permit.checkUrl, 'function');
}
console.log('PDP_CAPABILITIES_EXPORTS_OK');
`,
    ],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  expect(stdout.trim()).toBe('PDP_CAPABILITIES_EXPORTS_OK');
});

test('strict ESM and CJS consumers retain exact discovery results and generic readonly objects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-pdp-capabilities-types-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'node_modules'));
  await symlink(root, join(directory, 'node_modules/permitio'), 'dir');
  const esmFile = join(directory, 'consumer.mts');
  const cjsFile = join(directory, 'consumer.cts');
  const files = [esmFile, cjsFile];
  await writeFile(esmFile, `import * as sdk from 'permitio';\n${consumer}`);
  await writeFile(cjsFile, `import sdk = require('permitio');\n${consumer}`);
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
        noEmit: true,
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
      },
      files,
    }),
  );
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(root, 'node_modules/typescript/lib/tsc.js'), '-p', config],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  ).catch((error: unknown) => {
    if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
      throw new Error(`PDP consumer compilation failed:\n${error.stdout}\n${error.stderr}`, {
        cause: error,
      });
    }
    throw error;
  });
  expect(stdout).toBe('');
  expect(stderr).toBe('');
});
