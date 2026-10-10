import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

const consumer = `
interface UserAttributes {
  readonly access: 'reader' | 'owner';
  note: string | null;
  score?: number;
}
interface TenantAttributes { region: 'east' | 'west'; }
interface InstanceAttributes { public: boolean; tags: readonly string[]; }
type Choice = { kind: 'staff'; department: string } | { kind: 'guest'; expires: number | null };
declare const permit: sdk.Permit;
declare const users: sdk.IUsersApi;
declare const tenants: sdk.ITenantsApi;
declare const instances: sdk.IResourceInstancesApi;
declare const userClass: sdk.UsersApi;
declare const tenantClass: sdk.TenantsApi;
declare const instanceClass: sdk.ResourceInstancesApi;
declare const user: sdk.UserRead<UserAttributes>;
declare const tenant: sdk.TenantRead<TenantAttributes>;
declare const instance: sdk.ResourceInstanceRead<InstanceAttributes>;
declare const detailed: sdk.ResourceInstanceDetailedRead<InstanceAttributes>;
declare const dynamic: boolean;

// All 22 direct result paths retain the selected shape and their original envelope.
const userReads: Promise<sdk.UserRead<UserAttributes>>[] = [
  users.get<UserAttributes>('alice'),
  users.getByKey<UserAttributes>('alice'),
  users.getById<UserAttributes>('user-id'),
  users.create<UserAttributes>({ key: 'alice' }),
  users.update<UserAttributes>('alice', { attributes: { note: null } }),
];
const userPage: Promise<sdk.PaginatedResultUserRead<UserAttributes>> =
  users.list<UserAttributes>({ searchOperator: 'startswith', includeResourceInstanceRoles: true });
const synchronized: Promise<sdk.ICreateOrUpdateUserResult<UserAttributes>> =
  users.sync<UserAttributes>({ key: 'alice' });
const tenantReads: Promise<sdk.TenantRead<TenantAttributes>>[] = [
  tenants.get<TenantAttributes>('east'),
  tenants.getByKey<TenantAttributes>('east'),
  tenants.getById<TenantAttributes>('tenant-id'),
  tenants.create<TenantAttributes>({ key: 'east', name: 'East' }),
  tenants.update<TenantAttributes>('east', { attributes: { region: 'east' } }),
];
const tenantList: Promise<sdk.TenantRead<TenantAttributes>[]> = tenants.list<TenantAttributes>();
const member: Promise<sdk.UserRead<UserAttributes>> =
  tenants.addUser<UserAttributes>('east', { key: 'alice' });
const members: Promise<sdk.PaginatedResultUserRead<UserAttributes>> =
  tenants.listTenantUsers<UserAttributes>({ tenantKey: 'east' });
const instanceReads: Promise<sdk.ResourceInstanceRead<InstanceAttributes>>[] = [
  instances.get<InstanceAttributes>('document:report'),
  instances.getByKey<InstanceAttributes>('document:report'),
  instances.getById<InstanceAttributes>('instance-id'),
  instances.create<InstanceAttributes>({ key: 'report', resource: 'document', tenant: 'east' }),
  instances.update<InstanceAttributes>('document:report', { attributes: { public: false } }),
];
const instanceList: Promise<sdk.ResourceInstanceRead<InstanceAttributes>[]> =
  instances.list<InstanceAttributes>({ tenant: 'east' });
const detailedPage: Promise<sdk.PaginatedResultResourceInstanceDetailedRead<InstanceAttributes>> =
  instances.listDetailed<InstanceAttributes>({ tenant: 'east' });

// The public client, concrete classes and synchronization clones expose the same methods.
const publicReads: Promise<sdk.UserRead<UserAttributes>>[] = [
  permit.api.users.get<UserAttributes>('alice'),
  userClass.get<UserAttributes>('alice'),
  users.waitForSync(5).get<UserAttributes>('alice'),
];
const concreteTenant: Promise<sdk.TenantRead<TenantAttributes>> =
  tenantClass.get<TenantAttributes>('east');
const clonedTenant: Promise<sdk.UserRead<UserAttributes>> =
  tenants.waitForSync(5).addUser<UserAttributes>('east', { key: 'alice' });
const concreteInstance: Promise<sdk.ResourceInstanceRead<InstanceAttributes>> =
  instanceClass.get<InstanceAttributes>('document:report');
const clonedDetailed: Promise<sdk.PaginatedResultResourceInstanceDetailedRead<InstanceAttributes>> =
  instances.waitForSync(5).listDetailed<InstanceAttributes>();

const defaultUser: Promise<sdk.UserRead> = users.get('alice');
const defaultPage: Promise<sdk.PaginatedResultUserRead> = users.list();
const defaultSync: Promise<sdk.ICreateOrUpdateUserResult> = users.sync({ key: 'alice' });
const defaultTenant: Promise<sdk.TenantRead[]> = tenants.list();
const defaultInstance: Promise<sdk.ResourceInstanceRead[]> = instances.list();
const defaultDetailed: Promise<sdk.PaginatedResultResourceInstanceDetailedRead> =
  instances.listDetailed();
declare const defaultRead: sdk.UserRead;
const defaultAttributes: object | undefined = defaultRead.attributes;
const access: 'reader' | 'owner' | undefined = user.attributes?.access;
const note: string | null | undefined = user.attributes?.note;
const score: number | undefined = user.attributes?.score;
const region: 'east' | 'west' | undefined = tenant.attributes?.region;
const tags: readonly string[] | undefined = instance.attributes?.tags;
const requiredRelationships = detailed.relationships;
const optionalRelationships = instance.relationships;
declare const synced: sdk.ICreateOrUpdateUserResult<UserAttributes>;
const created: boolean = synced.created;
const syncedAttributes: UserAttributes | undefined = synced.user.attributes;
declare const page: sdk.PaginatedResultUserRead<UserAttributes>;
const total: number = page.total_count;
const pageCount: number | undefined = page.page_count;
const nestedUser: UserAttributes | undefined = page.data[0]?.attributes;
declare const memberPage: Awaited<typeof members>;
const nestedMember: UserAttributes | undefined = memberPage.data[0]?.attributes;
declare const detailedResult: Awaited<typeof detailedPage>;
const nestedInstance: InstanceAttributes | undefined = detailedResult.data[0]?.attributes;
declare const withoutUserAttributes: Omit<sdk.UserRead<UserAttributes>, 'attributes'>;
const optionalUser: sdk.UserRead<UserAttributes> = withoutUserAttributes;
declare const withoutTenantAttributes: Omit<sdk.TenantRead<TenantAttributes>, 'attributes'>;
const optionalTenant: sdk.TenantRead<TenantAttributes> = withoutTenantAttributes;
declare const withoutInstanceAttributes:
  Omit<sdk.ResourceInstanceDetailedRead<InstanceAttributes>, 'attributes'>;
const optionalInstance: sdk.ResourceInstanceDetailedRead<InstanceAttributes> =
  withoutInstanceAttributes;
const union: Promise<sdk.UserRead<Choice>> = users.get<Choice>('alice');

// Existing role-list flags remain independent from attribute selection.
const roles: Promise<sdk.PaginatedResultRoleAssignmentDetailedRead> =
  users.getAssignedRoles({ user: 'alice', detailed: true, includeTotalCount: true });
const roleUnion: Promise<sdk.RoleAssignmentRead[] | sdk.RoleAssignmentDetailedRead[]> =
  permit.api.roleAssignments.list({ detailed: dynamic });
// @ts-expect-error Primitive attribute shapes are not server objects.
users.get<string>('alice');
// @ts-expect-error Null cannot be the entire attribute object.
users.get<null>('alice');
// @ts-expect-error Undefined cannot be the entire attribute object.
users.get<undefined>('alice');
// @ts-expect-error Optional attributes cannot be explicitly undefined in exact optional mode.
const undefinedAttributes: sdk.UserRead<UserAttributes> = { ...user, attributes: undefined };
// @ts-expect-error Attributes remain non-null at the top level.
const nullAttributes: sdk.UserRead<UserAttributes> = { ...user, attributes: null };
const badLiteral: sdk.UserRead<UserAttributes> = {
  ...user,
  // @ts-expect-error Selected shapes preserve literal fields.
  attributes: { access: 'admin', note: null },
};
// @ts-expect-error Selected shapes preserve required fields inside attributes.
const missingMember: sdk.UserRead<UserAttributes> = { ...user, attributes: { access: 'owner' } };
// @ts-expect-error Generic read selection does not add an optional write-model parameter.
const genericWrite: sdk.UserCreate<UserAttributes> = { key: 'alice' };
// @ts-expect-error Resource schema definitions are not resource-instance data.
const schemaRead: sdk.ResourceRead<InstanceAttributes> = {};
// @ts-expect-error Read attributes preserve caller readonly members.
user.attributes!.access = 'owner';
// @ts-expect-error Attribute names are not added to unrelated role assignment models.
roles.then(result => result.data[0]!.user.attributes!.access);
// @ts-expect-error Detailed resource-instance relationships remain required.
const noRelationships: sdk.ResourceInstanceDetailedRead<InstanceAttributes> =
  { ...instance, attributes: { public: true, tags: [] } };
void [userReads, userPage, synchronized, tenantReads, tenantList, member, members,
  instanceReads, instanceList, detailedPage, publicReads, concreteTenant, clonedTenant,
  concreteInstance, clonedDetailed, defaultUser, defaultPage, defaultSync, defaultTenant,
  defaultInstance, defaultDetailed, defaultAttributes, access, note, score, region, tags,
  requiredRelationships, optionalRelationships, created, syncedAttributes, total,
  pageCount, nestedUser, nestedMember, nestedInstance, optionalUser, optionalTenant,
  optionalInstance, union, roles, roleUnion, undefinedAttributes,
  nullAttributes, badLiteral, missingMember, genericWrite, schemaRead, noRelationships];
`;
test('strict consumers preserve attribute shapes on all 22 result paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-attribute-generics-types-'));
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
      throw new Error(`Attribute consumer compilation failed:\n${error.stdout}\n${error.stderr}`, {
        cause: error,
      });
    }
    throw error;
  });
  expect(stdout).toBe('');
  expect(stderr).toBe('');
});
