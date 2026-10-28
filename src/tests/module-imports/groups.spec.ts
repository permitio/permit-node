import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('both published package entry points register exactly the eight core Groups methods', async () => {
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
  assert.ok(permit.api.groups instanceof sdk.GroupsApi);
  assert.deepEqual(Object.getOwnPropertyNames(sdk.GroupsApi.prototype).sort(), [
    'assignRole', 'assignUser', 'constructor', 'create', 'delete', 'get', 'list',
    'removeRole', 'removeUser',
  ]);
}
console.log('GROUPS_EXPORTS_OK');
`,
    ],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  expect(stdout.trim()).toBe('GROUPS_EXPORTS_OK');
});

const consumer = `
declare const permit: sdk.Permit;
const groups: sdk.IGroupsApi = permit.api.groups;
const create: sdk.GroupCreate = {
  group_instance_key: 'support', group_tenant: 'east', group_resource_type_key: 'team',
};
const member: sdk.GroupAssignUser = { tenant: 'east' };
const role: sdk.GroupAddRole = {
  role: 'reader', resource: 'document', resource_instance: 'report', tenant: 'east',
};
const filters: sdk.IListGroups = {
  tenant: 'east', resource: 'team', search: 'support', page: 2, perPage: 10,
};
const created: Promise<sdk.GroupRead> = groups.create(create);
const got: Promise<sdk.GroupReadSchema> = groups.get('team:support');
const listed: Promise<sdk.PaginatedResultGroupReadSchema> = groups.list(filters);
const defaultList: Promise<sdk.PaginatedResultGroupReadSchema> = groups.list();
const assigned: Promise<sdk.GroupRead> = groups.assignUser('team:support', 'alice', member);
const granted: Promise<sdk.GroupRead> = groups.assignRole('team:support', role);
const removed: Promise<void> = groups.removeUser('team:support', 'alice', member);
const revoked: Promise<void> = groups.removeRole('team:support', role);
const deleted: Promise<void> = groups.delete('team:support');
// @ts-expect-error Create responses do not promise the internal ID returned by direct reads.
const createdWithId: Promise<sdk.GroupReadSchema> = groups.create(create);
// @ts-expect-error Direct pagination returns the full envelope rather than an array.
const array: Promise<sdk.GroupReadSchema[]> = groups.list();
// @ts-expect-error Group tenant is required for creation.
groups.create({ group_instance_key: 'team:support' });
// @ts-expect-error Membership assignment requires its tenant JSON body.
groups.assignUser('team:support', 'alice');
// @ts-expect-error DELETE membership also requires its tenant JSON body.
groups.removeUser('team:support', 'alice', {});
// @ts-expect-error Role grants require all four identifiers.
groups.assignRole('team:support', { role: 'reader', tenant: 'east' });
// @ts-expect-error Role revocation requires a complete assignment body.
groups.removeRole('team:support', { resource: 'document', resource_instance: 'report' });
// @ts-expect-error Group identifiers must be strings.
groups.get(42);
// @ts-expect-error Pagination is numeric.
groups.list({ page: '2' });
// @ts-expect-error Direct listing always includes counts; it has no includeTotalCount switch.
groups.list({ includeTotalCount: true });
// @ts-expect-error Exact optional properties reject explicitly undefined filters.
groups.list({ tenant: undefined });
// @ts-expect-error Group-to-group membership remains deferred.
groups.assignGroup('team:support', 'team:sales');
// @ts-expect-error EAP user listing remains deferred.
groups.listUsers('team:support');
// @ts-expect-error EAP role listing remains deferred.
groups.listRoles('team:support');
// @ts-expect-error EAP parent listing remains deferred.
groups.listParents('team:support');
// @ts-expect-error EAP child listing remains deferred.
groups.listChildren('team:support');
void [created, got, listed, defaultList, assigned, granted, removed, revoked, deleted];
`;

test('strict ESM and CJS consumers retain precise Groups requests and results', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-groups-types-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'node_modules'));
  await symlink(root, join(directory, 'node_modules/permitio'), 'dir');
  const esmFile = join(directory, 'consumer.mts');
  const cjsFile = join(directory, 'consumer.cts');
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
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
        noEmit: true,
      },
      files: [esmFile, cjsFile],
    }),
  );
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(root, 'node_modules/typescript/lib/tsc.js'), '-p', config],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  ).catch((error: unknown) => {
    if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
      throw new Error(`Groups consumer compilation failed:\n${error.stdout}\n${error.stderr}`, {
        cause: error,
      });
    }
    throw error;
  });
  expect(stdout).toBe('');
  expect(stderr).toBe('');
});
