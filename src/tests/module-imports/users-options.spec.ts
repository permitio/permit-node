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
declare const dynamic: boolean;
const params: sdk.IUsersListParams = {
  search: 'bob', searchOperator: 'endswith', role: '',
  includeResourceInstanceRoles: dynamic, page: 2, perPage: 5,
};
const queries = [
  permit.api.users.list(),
  permit.api.users.list({}),
  permit.api.users.list(params),
  permit.api.users.list({ searchOperator: 'startswith', includeResourceInstanceRoles: true }),
  permit.api.users.list({ searchOperator: 'contains', includeResourceInstanceRoles: false }),
];
const exact: Promise<sdk.PaginatedResultUserRead>[] = queries;
declare const page: Awaited<ReturnType<typeof permit.api.users.list>>;
const nested: {resource: string; resource_instance: string; role: string}[] | undefined =
  page.data[0]?.associated_tenants?.[0]?.resource_instance_roles;
const count: number = page.total_count;
const rows: sdk.UserRead[] = page.data;
// @ts-expect-error Only schema-supported search operators are accepted.
permit.api.users.list({ searchOperator: 'prefix' });
// @ts-expect-error The inclusion flag is a boolean.
permit.api.users.list({ includeResourceInstanceRoles: 'true' });
// @ts-expect-error Exact optional options reject explicit undefined.
permit.api.users.list({ includeResourceInstanceRoles: undefined });
// @ts-expect-error Null is not an inclusion flag.
permit.api.users.list({ includeResourceInstanceRoles: null });
// @ts-expect-error Public option names use camel case.
permit.api.users.list({ search_operator: 'contains' });
// @ts-expect-error The historical ticket title is not a public option.
permit.api.users.list({ include_resource_roles: true });
// @ts-expect-error User lists retain their paginated envelope.
const array: Promise<sdk.UserRead[]> = permit.api.users.list(params);
// @ts-expect-error Resource roles belong to associated tenant details.
page.data[0]?.resource_roles;
void [exact, nested, count, rows, array];
`;

test('strict ESM and CJS consumers preserve user-list options and results', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-users-options-types-'));
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
      throw new Error(`User-list consumer compilation failed:\n${error.stdout}\n${error.stderr}`, {
        cause: error,
      });
    }
    throw error;
  });
  expect(stdout).toBe('');
  expect(stderr).toBe('');
});
