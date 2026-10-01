import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('both public entries expose the six invite methods and status values', async () => {
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
  assert.ok(permit.api.userInvites instanceof sdk.UserInvitesApi);
  assert.deepEqual(Object.getOwnPropertyNames(sdk.UserInvitesApi.prototype).sort(), [
    'approve', 'constructor', 'create', 'delete', 'get', 'list', 'update',
  ]);
  assert.deepEqual(sdk.UserInviteStatus, { Pending: 'pending', Approved: 'approved' });
}
console.log('INVITE_EXPORTS_OK');
`,
    ],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  expect(stdout.trim()).toBe('INVITE_EXPORTS_OK');
});

const consumer = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
interface Attributes { readonly access: 'reader'; note: string | null; }
type ApprovalAttributes = sdk.UserInviteApprovalRead<Attributes>['attributes'];
declare const permit: sdk.Permit;
declare const concrete: sdk.UserInvitesApi;
const api: sdk.IUserInvitesApi = permit.api.userInvites;
const invite: sdk.ElementsUserInviteCreate = {
  key: null, first_name: null, last_name: null, resource_instance_id: null,
  status: sdk.UserInviteStatus.Pending, email: 'fixture@example.com',
  role_id: 'role-id', tenant_id: 'tenant-id',
};
const update: sdk.ElementsUserInviteUpdate = { ...invite, status: 'approved' };
const approval: sdk.ElementsUserInviteApprove = {
  email: 'fixture@example.com', key: 'approved-user', attributes: null,
};
const filters: sdk.IListUserInvites = {
  role: 'reader', tenant: 'east', search: 'fixture', page: 2, perPage: 3,
};
const listed = api.list(filters);
const defaultList = api.list();
const created = api.create(invite);
const got = api.get('invite-id');
const updated = api.update('invite-id', update);
const deleted = api.delete('invite-id');
const approved = api.approve('invite-id', approval);
const typed = api.approve<Attributes>('invite-id', approval);
const concreteTyped = concrete.approve<Attributes>('invite-id', approval);
type Results = [
  Assert<Equal<Awaited<typeof listed>, sdk.PaginatedResultElementsUserInviteRead>>,
  Assert<Equal<Awaited<typeof defaultList>, sdk.PaginatedResultElementsUserInviteRead>>,
  Assert<Equal<Awaited<typeof created>, sdk.ElementsUserInviteRead>>,
  Assert<Equal<Awaited<typeof got>, sdk.ElementsUserInviteRead>>,
  Assert<Equal<Awaited<typeof updated>, sdk.ElementsUserInviteRead>>,
  Assert<Equal<Awaited<typeof deleted>, void>>,
  Assert<Equal<Awaited<typeof approved>, sdk.UserInviteApprovalRead>>,
  Assert<Equal<Awaited<typeof typed>, sdk.UserInviteApprovalRead<Attributes>>>,
  Assert<Equal<Awaited<typeof concreteTyped>, sdk.UserInviteApprovalRead<Attributes>>>,
  Assert<Equal<ApprovalAttributes, Attributes | null | undefined>>,
  Assert<Equal<sdk.UserInviteApprovalRead['first_name'], string | null | undefined>>,
  Assert<Equal<sdk.ElementsUserInviteRead['resource_instance_id'], string | null>>,
];
declare const read: sdk.ElementsUserInviteRead;
const page: sdk.PaginatedResultElementsUserInviteRead = { data: [read], total_count: 1 };
const status: sdk.UserInviteStatus = 'approved';
// @ts-expect-error Nullability does not make these creation fields optional.
api.create({ status: 'pending', email: 'fixture@example.com', role_id: 'r', tenant_id: 't' });
// @ts-expect-error PATCH still requires the complete editable body.
api.update('invite-id', { key: 'user' });
// @ts-expect-error Approval attributes are required even when null.
api.approve('invite-id', { email: 'fixture@example.com', key: 'user' });
// @ts-expect-error Approval attributes are nullable, not undefined.
api.approve('invite-id', { ...approval, attributes: undefined });
// @ts-expect-error Approval email is required and non-null.
api.approve('invite-id', { ...approval, email: null });
// @ts-expect-error The final approval key is non-null.
api.approve('invite-id', { ...approval, key: null });
// @ts-expect-error Invite statuses are the actual backend enum.
api.create({ ...invite, status: 'rejected' });
// @ts-expect-error Required nullable properties reject undefined.
api.create({ ...invite, resource_instance_id: undefined });
// @ts-expect-error Role IDs are non-null strings.
api.create({ ...invite, role_id: null });
// @ts-expect-error Exact optional filters reject explicit undefined.
api.list({ search: undefined });
// @ts-expect-error The list always returns a complete page.
const array: Promise<sdk.ElementsUserInviteRead[]> = api.list();
// @ts-expect-error A stored invite retains its required identity/context/timestamp metadata.
const missingMetadata: sdk.ElementsUserInviteRead = invite;
// @ts-expect-error The full page retains its required total_count.
const missingCount: sdk.PaginatedResultElementsUserInviteRead = { data: [] };
// @ts-expect-error There is no synchronization promise on this direct control-plane group.
api.waitForSync(5);
// @ts-expect-error No key-lookup alias is exposed.
api.getByKey('user');
// @ts-expect-error Caller-declared attributes must be objects.
api.approve<string>('invite-id', approval);
// @ts-expect-error Existing UserRead's captured non-null contract is unchanged.
const existingAttributes: sdk.UserRead['attributes'] = null;
void [page, status];
declare const results: Results;
void results;
`;

// Allow both sequential 30-second compiler limits plus fixture setup and cleanup.
test('strict TS6 and TS7 consumers preserve required-nullable invite contracts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-invite-types-'));
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
        throw new Error(`Invite consumer compilation failed:\n${error.stdout}\n${error.stderr}`, {
          cause: error,
        });
      }
      throw error;
    });
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  }
}, 65_000);
