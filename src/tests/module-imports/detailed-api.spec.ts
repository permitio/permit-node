import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('both published entries expose the five approved operations', async () => {
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
  assert.equal(typeof permit.api.tenants.addUser, 'function');
  for (const name of ['relationshipTuples', 'resourceInstances', 'roleAssignments']) {
    assert.equal(typeof permit.api[name].listDetailed, 'function');
  }
  assert.ok(permit.api.pdps instanceof sdk.PdpsApi);
  assert.deepEqual(Object.getOwnPropertyNames(sdk.PdpsApi.prototype).sort(), ['constructor', 'refresh']);
  assert.equal(permit.api.pdps.refreshPdp, undefined);
}
console.log('DETAILED_API_EXPORTS_OK');
`,
    ],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  expect(stdout.trim()).toBe('DETAILED_API_EXPORTS_OK');
});

const consumer = `

declare const permit: sdk.Permit;
const tenantUser: Promise<sdk.UserRead> = permit.api.tenants.addUser('east', { key: 'alice' });
const tupleDefault: Promise<sdk.PaginatedResultRelationshipTupleDetailedRead> =
  permit.api.relationshipTuples.listDetailed();
const tupleFiltered: Promise<sdk.PaginatedResultRelationshipTupleDetailedRead> =
  permit.api.relationshipTuples.listDetailed({
    tenant: 'east',
    subject: 'user:alice',
    relation: 'owner',
    object: 'doc:report',
    subjectType: 'user',
    objectType: 'doc',
    page: 1,
    perPage: 10,
  });
const instanceDefault: Promise<sdk.PaginatedResultResourceInstanceDetailedRead> =
  permit.api.resourceInstances.listDetailed();
const instanceFiltered: Promise<sdk.PaginatedResultResourceInstanceDetailedRead> =
  permit.api.resourceInstances.listDetailed({
    tenant: 'east',
    resource: 'doc',
    search: ['report', 'budget'],
    page: 1,
    perPage: 10,
  });
const roleDefault: Promise<sdk.PaginatedResultRoleAssignmentDetailedRead> =
  permit.api.roleAssignments.listDetailed();
const roleFiltered: Promise<sdk.PaginatedResultRoleAssignmentDetailedRead> =
  permit.api.roleAssignments.listDetailed({
    tenant: 'east',
    resource: 'doc',
    resourceInstance: 'doc:report',
    user: 'alice',
    role: 'reader',
  });
const request: sdk.IEnvironmentPdpDataRefreshRequest = { reason: 'fixture' };
const refreshed: Promise<sdk.PDPDataRefreshResponse> = permit.api.pdps.refresh(request);
const refreshDefault: Promise<sdk.PDPDataRefreshResponse> = permit.api.pdps.refresh();
// @ts-expect-error Tenant membership requires new UserCreate data, not an existing user key.
permit.api.tenants.addUser('east', 'alice');
// @ts-expect-error UserCreate requires a key but no role.
permit.api.tenants.addUser('east', { email: 'alice@example.invalid' });
// @ts-expect-error Dedicated tuple detail listing returns its full envelope.
const tupleArray: Promise<sdk.RelationshipTupleDetailedRead[]> =
  permit.api.relationshipTuples.listDetailed();
// @ts-expect-error Dedicated instance detail listing returns its full envelope.
const instanceArray: Promise<sdk.ResourceInstanceDetailedRead[]> =
  permit.api.resourceInstances.listDetailed();
// @ts-expect-error Dedicated role detail listing returns its full envelope.
const roleArray: Promise<sdk.RoleAssignmentDetailedRead[]> =
  permit.api.roleAssignments.listDetailed();
// @ts-expect-error Dedicated detailed listing has no count switch.
permit.api.roleAssignments.listDetailed({ includeTotalCount: false });
// @ts-expect-error Dedicated detailed listing has no deprecated flag.
permit.api.roleAssignments.listDetailed({ detailed: false });
// @ts-expect-error Resource search is an array of terms.
permit.api.resourceInstances.listDetailed({ search: 'report' });
// @ts-expect-error Pagination is numeric.
permit.api.relationshipTuples.listDetailed({ page: '2' });
// @ts-expect-error Exact optional properties reject explicit undefined filters.
permit.api.resourceInstances.listDetailed({ tenant: undefined });
// @ts-expect-error An environment-wide refresh cannot select a PDP shard.
permit.api.pdps.refresh({ shard_id: 2 });
// @ts-expect-error Individual-PDP refresh is deferred to P2.
permit.api.pdps.refreshPdp('pdp-id');
// @ts-expect-error Acknowledgement is neither a boolean completion nor a void response.
const completed: Promise<void> = permit.api.pdps.refresh();

declare const dynamic: boolean;
declare const dynamicCount: boolean;
const roles = permit.api.roleAssignments;
const defaults: Promise<sdk.RoleAssignmentRead[]> = roles.list({});
const bothFalse: Promise<sdk.RoleAssignmentRead[]> = roles.list({
  detailed: false,
  includeTotalCount: false,
});
const details: Promise<sdk.RoleAssignmentDetailedRead[]> = roles.list({ detailed: true });
const counted: Promise<sdk.PaginatedResultRoleAssignmentRead> = roles.list({
  includeTotalCount: true,
});
const bothTrue: Promise<sdk.PaginatedResultRoleAssignmentDetailedRead> = roles.list({
  detailed: true,
  includeTotalCount: true,
});
const falseCount: Promise<sdk.RoleAssignmentDetailedRead[]> = roles.list({
  detailed: true,
  includeTotalCount: false,
});
const falseDetail: Promise<sdk.PaginatedResultRoleAssignmentRead> = roles.list({
  detailed: false,
  includeTotalCount: true,
});
const dynamicDetail: Promise<sdk.RoleAssignmentRead[] | sdk.RoleAssignmentDetailedRead[]> =
  roles.list({ detailed: dynamic });
const dynamicCounts: Promise<sdk.RoleAssignmentRead[] | sdk.PaginatedResultRoleAssignmentRead> =
  roles.list({ includeTotalCount: dynamicCount });
const dynamicDetailCounted: Promise<
  sdk.PaginatedResultRoleAssignmentRead | sdk.PaginatedResultRoleAssignmentDetailedRead
> = roles.list({ detailed: dynamic, includeTotalCount: true });
const dynamicCountDetailed: Promise<
  sdk.RoleAssignmentDetailedRead[] | sdk.PaginatedResultRoleAssignmentDetailedRead
> = roles.list({ detailed: true, includeTotalCount: dynamicCount });
const dynamicBoth: Promise<
  | sdk.RoleAssignmentRead[]
  | sdk.RoleAssignmentDetailedRead[]
  | sdk.PaginatedResultRoleAssignmentRead
  | sdk.PaginatedResultRoleAssignmentDetailedRead
> = roles.list({ detailed: dynamic, includeTotalCount: dynamicCount });
declare const conditionalOptions: { detailed: true } | { includeTotalCount: true };
const conditionalResults: Promise<
  sdk.RoleAssignmentDetailedRead[] | sdk.PaginatedResultRoleAssignmentRead
> = roles.list(conditionalOptions);
// @ts-expect-error A union of parameter objects cannot collapse to the no-flag array result.
const narrowedConditional: Promise<sdk.RoleAssignmentRead[]> = roles.list(conditionalOptions);
declare const optionalFlags: { detailed?: true; includeTotalCount?: true };
const optionalBoth: Promise<
  | sdk.RoleAssignmentRead[]
  | sdk.RoleAssignmentDetailedRead[]
  | sdk.PaginatedResultRoleAssignmentRead
  | sdk.PaginatedResultRoleAssignmentDetailedRead
> = roles.list(optionalFlags);
declare const widened: sdk.IListRoleAssignments;
const widenedBoth: Promise<
  | sdk.RoleAssignmentRead[]
  | sdk.RoleAssignmentDetailedRead[]
  | sdk.PaginatedResultRoleAssignmentRead
  | sdk.PaginatedResultRoleAssignmentDetailedRead
> = roles.list(widened);
// @ts-expect-error Optional true flags can be omitted and cannot promise a detailed envelope.
const narrowedOptional: Promise<sdk.PaginatedResultRoleAssignmentDetailedRead> =
  roles.list(optionalFlags);
// @ts-expect-error Fully widened public parameters cannot promise base arrays.
const narrowedWidened: Promise<sdk.RoleAssignmentRead[]> = roles.list(widened);
// @ts-expect-error Dynamic detail flags cannot be narrowed to base arrays.
const narrowedDetail: Promise<sdk.RoleAssignmentRead[]> = roles.list({ detailed: dynamic });
// @ts-expect-error Dynamic count flags cannot be narrowed to arrays.
const narrowedCounts: Promise<sdk.RoleAssignmentRead[]> = roles.list({
  includeTotalCount: dynamicCount,
});
// @ts-expect-error Dynamic detail/count flags cannot promise an envelope.
const narrowedBoth: Promise<sdk.PaginatedResultRoleAssignmentDetailedRead> = roles.list({
  detailed: dynamic,
  includeTotalCount: dynamicCount,
});
void [
  tenantUser,
  tupleDefault,
  tupleFiltered,
  instanceDefault,
  instanceFiltered,
  roleDefault,
  roleFiltered,
  refreshed,
  refreshDefault,
  defaults,
  bothFalse,
  details,
  counted,
  bothTrue,
  falseCount,
  falseDetail,
  dynamicDetail,
  dynamicCounts,
  dynamicDetailCounted,
  dynamicCountDetailed,
  dynamicBoth,
  optionalBoth,
  widenedBoth,
  conditionalResults,
];
`;

test('strict ESM and CJS consumers retain precise membership, detailed-list, refresh and pagination contracts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-detailed-api-types-'));
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
      throw new Error(
        `Detailed API consumer compilation failed:\n${error.stdout}\n${error.stderr}`,
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
