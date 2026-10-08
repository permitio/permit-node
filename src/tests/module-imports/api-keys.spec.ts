import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('both public entries expose the API-key management facade', async () => {
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
  assert.ok(permit.api.apiKeys instanceof sdk.ApiKeysApi);
  for (const method of ['list', 'get', 'create', 'delete', 'rotate', 'getScope']) {
    assert.equal(typeof permit.api.apiKeys[method], 'function');
  }
}
console.log('API_KEYS_EXPORTS_OK');
`,
    ],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  expect(stdout.trim()).toBe('API_KEYS_EXPORTS_OK');
});

const consumer = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
declare const permit: sdk.Permit;
declare const concrete: sdk.ApiKeysApi;
declare const client: sdk.IPermitClient;
const api: sdk.IApiKeysApi = permit.api.apiKeys;
const clientApi: sdk.IApiKeysApi = client.api.apiKeys;
const minimal: sdk.APIKeyCreate = { organization_id: 'organization-uuid' };
const scoped: sdk.APIKeyCreate = {
  organization_id: 'organization-uuid', project_id: 'project-uuid',
  environment_id: 'environment-uuid', object_type: sdk.MemberAccessObj.Env,
  access_level: sdk.MemberAccessLevel.Read, owner_type: sdk.APIKeyOwnerType.Member,
  name: 'Disposable integration key',
};
const options: sdk.IListApiKeys = {
  objectType: sdk.MemberAccessObj.Project, projId: 'project-key-or-uuid', page: 2, perPage: 3,
};
const listed = api.list(options);
const defaults = concrete.list();
const created = api.create(minimal);
const scopedCreated = concrete.create(scoped);
const got = api.get('api-key-id');
const rotated = concrete.rotate('api-key-uuid');
const deleted = api.delete('api-key-id');
const scope = api.getScope();
type Results = [
  Assert<Equal<Awaited<typeof listed>, sdk.PaginatedResultAPIKeyRead>>,
  Assert<Equal<Awaited<typeof defaults>, sdk.PaginatedResultAPIKeyRead>>,
  Assert<Equal<Awaited<typeof created>, sdk.APIKeyRead>>,
  Assert<Equal<Awaited<typeof scopedCreated>, sdk.APIKeyRead>>,
  Assert<Equal<Awaited<typeof got>, sdk.APIKeyRead>>,
  Assert<Equal<Awaited<typeof rotated>, sdk.APIKeyRead>>,
  Assert<Equal<Awaited<typeof deleted>, void>>,
  Assert<Equal<Awaited<typeof scope>, sdk.APIKeyScopeRead>>,
];
declare const row: sdk.APIKeyRead;
const metadata: [string, string, sdk.APIKeyOwnerType, string] = [
  row.id, row.organization_id, row.owner_type, row.created_at,
];
const secret: string | null | undefined = row.secret;
const project: sdk.ProjectRead | null | undefined = row.project;
const environment: sdk.EnvironmentRead | null | undefined = row.env;
const member: sdk.OrgMemberRead | null | undefined = row.created_by_member;
declare const page: sdk.PaginatedResultAPIKeyRead;
const counts: [number, number | null | undefined] = [page.total_count, page.page_count];
declare const discovered: sdk.APIKeyScopeRead;
const scopeIds: [string, string | null | undefined, string | null | undefined] = [
  discovered.organization_id, discovered.project_id, discovered.environment_id,
];
const organizationScope: sdk.APIKeyScopeRead = {
  organization_id: 'org', project_id: null, environment_id: null,
};
const projectScope: sdk.APIKeyScopeRead = {
  organization_id: 'org', project_id: 'project', environment_id: null,
};
const omittedScope: sdk.APIKeyScopeRead = { organization_id: 'org' };
if (discovered.project_id !== undefined) {
  // @ts-expect-error An undefined guard does not exclude a null project ID.
  discovered.project_id.toUpperCase();
}
if (discovered.environment_id !== undefined) {
  // @ts-expect-error An undefined guard does not exclude a null environment ID.
  discovered.environment_id.toUpperCase();
}
if (discovered.project_id != null) discovered.project_id.toUpperCase();
if (discovered.environment_id != null) discovered.environment_id.toUpperCase();
// @ts-expect-error The organization ID remains required and nonnullable.
const nullOrganization: sdk.APIKeyScopeRead = { organization_id: null };
// @ts-expect-error Optional scope fields do not accept explicit undefined.
const undefinedScope: sdk.APIKeyScopeRead = { organization_id: 'org', project_id: undefined };
// @ts-expect-error Creation input is not widened by read-scope nullability.
api.create({ organization_id: 'org', project_id: null });
const nullRecord: sdk.APIKeyRead = {
  organization_id: 'org', owner_type: sdk.APIKeyOwnerType.Member, id: 'id', created_at: 'created',
  project_id: null, environment_id: null, object_type: null, access_level: null,
  name: null, secret: null, created_by_member: null, last_used_at: null, env: null, project: null,
};
const nullPage: sdk.PaginatedResultAPIKeyRead = { data: [nullRecord], total_count: 1, page_count: null };
// @ts-expect-error Required owner_type stays nonnullable.
const nullOwner: sdk.APIKeyRead = { ...nullRecord, owner_type: null };
// @ts-expect-error Required organization_id stays nonnullable.
const nullOrg: sdk.APIKeyRead = { ...nullRecord, organization_id: null };
// @ts-expect-error Required id stays nonnullable.
const nullId: sdk.APIKeyRead = { ...nullRecord, id: null };
// @ts-expect-error Required created_at stays nonnullable.
const nullCreated: sdk.APIKeyRead = { ...nullRecord, created_at: null };
// @ts-expect-error Required total_count stays nonnullable.
const nullTotal: sdk.PaginatedResultAPIKeyRead = { data: [], total_count: null };
// @ts-expect-error Required data stays nonnullable.
const nullData: sdk.PaginatedResultAPIKeyRead = { data: null, total_count: 0 };
void [nullPage, nullOwner, nullOrg, nullId, nullCreated, nullTotal, nullData];
void [organizationScope, projectScope, omittedScope, nullOrganization, undefinedScope, nullRecord];
if (row.project_id !== undefined) {
  // @ts-expect-error An undefined-only guard still permits a null project_id.
  row.project_id.toUpperCase();
}
if (row.project_id != null) row.project_id.toUpperCase();
if (row.environment_id !== undefined) {
  // @ts-expect-error An undefined-only guard still permits a null environment_id.
  row.environment_id.toUpperCase();
}
if (row.environment_id != null) row.environment_id.toUpperCase();
if (row.object_type !== undefined) {
  // @ts-expect-error An undefined-only guard still permits a null object_type.
  row.object_type.toUpperCase();
}
if (row.object_type != null) row.object_type.toUpperCase();
if (row.access_level !== undefined) {
  // @ts-expect-error An undefined-only guard still permits a null access_level.
  row.access_level.toUpperCase();
}
if (row.access_level != null) row.access_level.toUpperCase();
if (row.name !== undefined) {
  // @ts-expect-error An undefined-only guard still permits a null name.
  row.name.toUpperCase();
}
if (row.name != null) row.name.toUpperCase();
if (row.secret !== undefined) {
  // @ts-expect-error An undefined-only guard still permits a null secret.
  row.secret.toUpperCase();
}
if (row.secret != null) row.secret.toUpperCase();
if (row.last_used_at !== undefined) {
  // @ts-expect-error An undefined-only guard still permits a null last_used_at.
  row.last_used_at.toUpperCase();
}
if (row.last_used_at != null) row.last_used_at.toUpperCase();
if (row.created_by_member !== undefined) {
  // @ts-expect-error An undefined-only guard still permits a null created_by_member.
  void row.created_by_member.id;
}
if (row.created_by_member != null) void row.created_by_member.id;
if (row.env !== undefined) {
  // @ts-expect-error An undefined-only guard still permits a null env.
  void row.env.id;
}
if (row.env != null) void row.env.id;
if (row.project !== undefined) {
  // @ts-expect-error An undefined-only guard still permits a null project.
  void row.project.id;
}
if (row.project != null) void row.project.id;
if (page.page_count !== undefined) {
  // @ts-expect-error An undefined-only guard still permits a null page count.
  page.page_count.toFixed();
}
if (page.page_count != null) page.page_count.toFixed();
// @ts-expect-error A nullable response credential must be narrowed before configuring a client.
new sdk.Permit({ token: row.secret });
// @ts-expect-error Creation requires the public organization ID.
api.create({ name: 'missing-org' });
// @ts-expect-error Explicit optional scope must not be undefined.
api.create({ organization_id: 'org', project_id: undefined });
// @ts-expect-error Scope is the published enum, not an invented resource type.
api.create({ ...minimal, object_type: 'resource' });
// @ts-expect-error Access levels are the committed enum.
api.create({ ...minimal, access_level: 'owner' });
// @ts-expect-error Creation does not accept a caller-supplied secret.
api.create({ ...minimal, secret: 'invented' });
// @ts-expect-error Create does not accept a separate context override.
api.create(minimal, { environmentId: 'env' });
// @ts-expect-error The filter spelling is projId.
api.list({ projectId: 'project' });
// @ts-expect-error There is no environment filter.
api.list({ environmentId: 'environment' });
// @ts-expect-error Counts are always part of the published page, not a toggle.
api.list({ includeTotalCount: true });
// @ts-expect-error Get requires an ID string.
api.get({ id: 'key-id' });
// @ts-expect-error Rotation sends no request body.
api.rotate('key-id', minimal);
// @ts-expect-error Scope discovery takes no selected-context argument.
api.getScope({ projectId: 'project' });
// @ts-expect-error A secret is optional on reads and cannot be promised.
const alwaysSecret: string = row.secret;
// @ts-expect-error Scope discovery is not an API-key record.
const scopeAsRecord: sdk.APIKeyRead = discovered;
// @ts-expect-error API-key lists preserve an envelope rather than a row array.
const projected: Promise<sdk.APIKeyRead[]> = api.list();
// @ts-expect-error Total count is required on the published page.
const emptyPage: sdk.PaginatedResultAPIKeyRead = { data: [] };
// @ts-expect-error There is no unsupported key update operation.
api.update('key-id', {});
// @ts-expect-error API management does not synchronize facts through the PDP.
api.waitForSync(3);
void [clientApi, metadata, secret, project, environment, member, counts, scopeIds];
declare const results: Results;
void results;
`;

test('strict TS6 and TS7 root consumers preserve API-key management contracts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-api-key-types-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'node_modules'));
  await symlink(root, join(directory, 'node_modules/permitio'), 'dir');
  const esm = join(directory, 'consumer.mts');
  const cjs = join(directory, 'consumer.cts');
  await writeFile(esm, `import * as sdk from 'permitio';\n${consumer}`);
  await writeFile(cjs, `import sdk = require('permitio');\n${consumer}`);
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
        skipLibCheck: false,
        noEmit: true,
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
      },
      files: [esm, cjs],
    }),
  );
  for (const compiler of [
    join(root, 'node_modules/typescript/bin/tsc'),
    join(root, 'tools/compiler/node_modules/typescript/bin/tsc'),
  ]) {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [compiler, '-p', config],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30_000,
      },
    ).catch((error: unknown) => {
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        throw new Error(`API-key consumer compilation failed:\n${error.stdout}\n${error.stderr}`, {
          cause: error,
        });
      }
      throw error;
    });
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  }
}, 65_000);
