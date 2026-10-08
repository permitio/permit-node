import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const consumer = `
declare const permit: sdk.IPermitClient;
const query: sdk.ILocalRoleAssignmentsQuery = {
  user: 'alice', role: 'reader', tenant: 'east', resource: 'document',
  resourceInstance: 'document:one', page: 1, perPage: 30,
};
const config: sdk.CheckConfig = { timeout: 0, throwOnError: false, useOpa: false };
const result: Promise<sdk.ILocalRoleAssignment[]> = permit.getLocalRoleAssignments(query, config);
const unfiltered: Promise<sdk.ILocalRoleAssignment[]> = permit.getLocalRoleAssignments();
const tenant: sdk.ILocalRoleAssignment = { user: 'alice', role: 'reader', tenant: 'east' };
const resource: sdk.ILocalRoleAssignment = { ...tenant, resource_instance: 'document:one' };
const nullable: sdk.ILocalRoleAssignment = { ...tenant, resource_instance: null, future: false };
async function read() {
  const rows = await result;
  const first = rows[0];
  if (first) {
    const user: string = first.user;
    const role: string = first.role;
    const tenantKey: string = first.tenant;
    const instance: string | null | undefined = first.resource_instance;
    const extra: unknown = first['future'];
    // @ts-expect-error Local rows do not establish control-plane physical IDs.
    const id: string = first['id'];
    // @ts-expect-error Local rows are not complete control-plane records.
    const controlPlane: sdk.RoleAssignmentRead = first;
    void [user, role, tenantKey, instance, extra, id, controlPlane];
  }
  // @ts-expect-error One local page is a bare array, without a total-count envelope.
  void rows.total_count;
  // @ts-expect-error Local rows have keys and optional instances, not the authorized-user shape.
  const authorized: sdk.IAuthorizedUserAssignment[] = rows;
  void authorized;
}
// @ts-expect-error Local query filters must be strings.
permit.getLocalRoleAssignments({ user: 7 });
// @ts-expect-error Local pagination uses a numeric page size.
permit.getLocalRoleAssignments({ perPage: '30' });
// @ts-expect-error The public query maps camelCase to wire names internally.
permit.getLocalRoleAssignments({ resource_instance: 'document:one' });
// @ts-expect-error Total-count control-plane options are not local PDP filters.
permit.getLocalRoleAssignments({ includeTotalCount: true });
// @ts-expect-error Local reads have no context input.
permit.getLocalRoleAssignments({ context: { enabled: true } });
// @ts-expect-error CheckConfig cannot add query-specific tenancy or context.
permit.getLocalRoleAssignments({}, { tenant: 'east' });
// @ts-expect-error Exact optional fields cannot be explicitly undefined.
permit.getLocalRoleAssignments({ resourceInstance: undefined });
// @ts-expect-error Query null is not an omitted filter.
permit.getLocalRoleAssignments({ tenant: null });
// @ts-expect-error Required assignment fields retain string types.
const invalid: sdk.ILocalRoleAssignment = { user: 7, role: 'reader', tenant: 'east' };
// @ts-expect-error Optional response instances cannot be explicitly undefined.
const undefinedInstance: sdk.ILocalRoleAssignment = { ...tenant, resource_instance: undefined };
const controlPlane = permit.api.roleAssignments.list({ includeTotalCount: true });
void [result, unfiltered, resource, nullable, read, invalid, undefinedInstance, controlPlane];
`;

it.each([
  'node_modules/typescript/lib/tsc.js',
  'tools/compiler/node_modules/typescript/lib/tsc.js',
])(
  'strict ESM/CJS consumers distinguish local and control-plane assignments with %s',
  async (compiler) => {
    const directory = await mkdtemp(join(tmpdir(), 'permit-local-assignments-types-'));
    onTestFinished(() => rm(directory, { recursive: true, force: true }));
    await mkdir(join(directory, 'node_modules'));
    await symlink(root, join(directory, 'node_modules/permitio'), 'dir');
    await writeFile(
      join(directory, 'consumer.mts'),
      `import * as sdk from 'permitio';\n${consumer}`,
    );
    await writeFile(
      join(directory, 'consumer.cts'),
      `import sdk = require('permitio');\n${consumer}`,
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
          noEmit: true,
          skipLibCheck: false,
          types: ['node'],
          typeRoots: [join(root, 'node_modules/@types')],
        },
        files: [join(directory, 'consumer.mts'), join(directory, 'consumer.cts')],
      }),
    );
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [join(root, compiler), '-p', config],
      { cwd: root, encoding: 'utf8', timeout: 30_000 },
    ).catch((error: unknown) => {
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        throw new Error(
          `Local role-assignment consumer compilation failed:\n${error.stdout}\n${error.stderr}`,
          { cause: error },
        );
      }
      throw error;
    });
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  },
);
