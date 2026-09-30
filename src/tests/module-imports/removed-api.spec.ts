import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const replacements = [
  ['listUsers', 'users', 'list'],
  ['listRoles', 'roles', 'list'],
  ['listConditionSets', 'conditionSets', 'list'],
  ['listConditionSetsRules', 'conditionSetRules', 'list'],
  ['getUser', 'users', 'get'],
  ['getTenant', 'tenants', 'get'],
  ['listTenants', 'tenants', 'list'],
  ['getRole', 'roles', 'get'],
  ['getAssignedRoles', 'users', 'getAssignedRoles'],
  ['createResource', 'resources', 'create'],
  ['updateResource', 'resources', 'update'],
  ['deleteResource', 'resources', 'delete'],
  ['createUser', 'users', 'create'],
  ['syncUser', 'users', 'sync'],
  ['updateUser', 'users', 'update'],
  ['deleteUser', 'users', 'delete'],
  ['createTenant', 'tenants', 'create'],
  ['updateTenant', 'tenants', 'update'],
  ['deleteTenant', 'tenants', 'delete'],
  ['createRole', 'roles', 'create'],
  ['updateRole', 'roles', 'update'],
  ['deleteRole', 'roles', 'delete'],
  ['assignRole', 'users', 'assignRole'],
  ['unassignRole', 'users', 'unassignRole'],
  ['createConditionSet', 'conditionSets', 'create'],
  ['updateConditionSet', 'conditionSets', 'update'],
  ['deleteConditionSet', 'conditionSets', 'delete'],
  ['assignConditionSetRule', 'conditionSetRules', 'create'],
  ['unassignConditionSetRule', 'conditionSetRules', 'delete'],
] as const;
const removedMethods = [...replacements.map(([name]) => name), 'getMethods'];

test('published entries expose grouped APIs without the removed flat facade', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from 'permitio';
const cjs = createRequire(import.meta.url)('permitio');
for (const sdk of [cjs, esm]) {
  const permit = new sdk.Permit({ token: 'fixture', log: { level: 'silent' } });
  for (const name of ${JSON.stringify(removedMethods)}) {
    assert.equal(name in permit.api, false, name);
  }
  for (const [, group, method] of ${JSON.stringify(replacements)}) {
    assert.equal(typeof permit.api[group][method], 'function', group + '.' + method);
  }
  assert.equal('DeprecatedApiClient' in sdk, false);
  assert.equal('level' in permit.config.apiContext, false);
  assert.equal(permit.config.apiContext.permittedAccessLevel, sdk.ApiKeyLevel.WAIT_FOR_INIT);
  assert.ok(permit.api instanceof sdk.ApiClient);
}
console.log('GROUPED_API_ONLY_OK');
`,
    ],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  expect(stdout.trim()).toBe('GROUPED_API_ONLY_OK');
  expect(stderr).toBe('');
});

const consumer = `
declare const permit: sdk.Permit;
declare const user: sdk.UserCreate;
declare const userUpdate: sdk.UserUpdate;
declare const resource: sdk.ResourceCreate;
declare const resourceUpdate: sdk.ResourceUpdate;
declare const tenant: sdk.TenantCreate;
declare const tenantUpdate: sdk.TenantUpdate;
declare const role: sdk.RoleCreate;
declare const roleUpdate: sdk.RoleUpdate;
declare const assignment: sdk.RoleAssignmentCreate;
declare const unassignment: sdk.RoleAssignmentRemove;
declare const set: sdk.ConditionSetCreate;
declare const setUpdate: sdk.ConditionSetUpdate;
declare const rule: sdk.ConditionSetRuleCreate;
declare const removedRule: sdk.ConditionSetRuleRemove;
type Legacy = ${removedMethods.map((name) => JSON.stringify(name)).join(' | ')};
const groupedInterface: Extract<keyof sdk.IPermitApi, Legacy> extends never ? true : false = true;
const groupedClass: Extract<keyof sdk.ApiClient, Legacy> extends never ? true : false = true;
// @ts-expect-error Removed runtime facade export.
type RemovedClient = typeof sdk.DeprecatedApiClient;
// @ts-expect-error Removed flat interface export.
type RemovedApi = sdk.IDeprecatedPermitApi;
// @ts-expect-error Removed flat read interface export.
type RemovedRead = sdk.IDeprecatedReadApis;
// @ts-expect-error Removed flat write interface export.
type RemovedWrite = sdk.IDeprecatedWriteApis;
// @ts-expect-error Removed unused transform type; no runtime registration API existed.
type RemovedTransform = sdk.ContextTransform;
// @ts-expect-error Removed access-level alias.
permit.config.apiContext.level;
const access: sdk.ApiKeyLevel = permit.config.apiContext.permittedAccessLevel;
const api = permit.api;
const listedUsers: Promise<sdk.UserRead[]> = api.users.list().then(page => page.data);
const syncedUser: Promise<sdk.UserRead> = api.users.sync(user).then(result => result.user);
const createdRule: Promise<sdk.ConditionSetRuleRead> = api.conditionSetRules.create(rule);
const deleted: Promise<void>[] = [
  api.users.delete('alice'), api.tenants.delete('east'), api.roles.delete('reader'),
  api.resources.delete('document'), api.conditionSets.delete('team'),
  api.users.unassignRole(unassignment), api.conditionSetRules.delete(removedRule),
];
const conditionSets: Promise<sdk.ConditionSetRead[]> = api.conditionSets.list({
  type: sdk.ConditionSetType.Userset, page: 2, perPage: 10,
});
const filter: sdk.IListConditionSets = { type: sdk.ConditionSetType.Resourceset };
const ruleFilter: sdk.IListConditionSetRules = { page: 2, perPage: 10 };
const rules: Promise<sdk.ConditionSetRuleRead[]>[] = [
  api.conditionSetRules.list(), api.conditionSetRules.list(ruleFilter),
  api.conditionSetRules.list({ userSetKey: 'team' }),
];
const assigned: Promise<sdk.RoleAssignmentRead[]> = api.users.getAssignedRoles({
  user: 'alice', tenant: 'east',
});
void [
  groupedInterface, groupedClass, access, listedUsers, syncedUser, createdRule,
  deleted, conditionSets,
  filter, rules, assigned, api.roles.list(), api.users.get('alice'), api.tenants.get('east'),
  api.roles.get('reader'), api.tenants.list({ page: 2 }), api.users.create(user),
  api.users.update('alice', userUpdate), api.resources.create(resource),
  api.resources.update('document', resourceUpdate), api.tenants.create(tenant),
  api.tenants.update('east', tenantUpdate), api.roles.create(role),
  api.roles.update('reader', roleUpdate), api.users.assignRole(assignment),
  api.conditionSets.create(set), api.conditionSets.update('team', setUpdate),
];
`;

test('strict CJS/ESM consumers accept replacements and reject removed APIs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-grouped-api-types-'));
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
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
        noEmit: true,
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
      throw new Error(
        `Grouped API consumer compilation failed:\n${error.stdout}\n${error.stderr}`,
        {
          cause: error,
        },
      );
    }
    throw error;
  });
  expect(stdout).toBe('');
  expect(stderr).toBe('');
});
