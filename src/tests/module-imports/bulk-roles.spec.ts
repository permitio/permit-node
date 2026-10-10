import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
test('both built entries expose the typed bulk role method', async () => {
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
for (const sdk of [esm, cjs]) {
 const permit = new sdk.Permit({token:'fixture',log:{level:'silent'}});
 assert.ok(permit.api.roles instanceof sdk.RolesApi);
 assert.equal(typeof permit.api.roles.bulkCreateOrReplace,'function');
 assert.equal('waitForSync' in permit.api.roles,false);
}
console.log('BULK_ROLES_EXPORTS_OK');
`,
    ],
    { cwd: root, timeout: 30_000, encoding: 'utf8' },
  );
  expect(stdout.trim()).toBe('BULK_ROLES_EXPORTS_OK');
  expect(stderr).toBe('');
});

const consumer = `
type Equal<A,B> = (<T>()=>T extends A ? 1 : 2) extends
 (<T>()=>T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
declare const permit: sdk.IPermitClient;
declare const concrete: sdk.RolesApi;
const api: sdk.IRolesApi = permit.api.roles;
const tenantRole: sdk.RoleCreateBulk = {
 key:'reader',name:'Reader',permissions:['document:read'],attributes:{enabled:false,count:0},
};
const resourceRole: sdk.RoleCreateBulk = {
 key:'editor',name:'Editor',resource:'document',permissions:['read','write'],extends:['reader'],
 description:'',granted_to:{users_with_role:[{
  role:'owner',on_resource:'folder',linked_by_relation:'parent',
  when:{no_direct_roles_on_object:false},
 }]},
};
const result = api.bulkCreateOrReplace([tenantRole,resourceRole]);
const classResult = concrete.bulkCreateOrReplace([]);
type ReturnTypes = [
 Assert<Equal<Awaited<typeof result>,sdk.RoleCreateBulkOperationResult>>,
 Assert<Equal<Awaited<typeof classResult>,sdk.RoleCreateBulkOperationResult>>,
 Assert<Equal<Parameters<sdk.IRolesApi['bulkCreateOrReplace']>,[roles:sdk.RoleCreateBulk[]]>>,
];
declare const report: sdk.RoleCreateBulkOperationResult;
const created: string[] = report.created;
const updated: string[] = report.updated;
const first: string | undefined = report.created[0];
const empty: sdk.RoleCreateBulkOperationResult = {created:[],updated:[]};
// @ts-expect-error Both published arrays are required.
const incomplete: sdk.RoleCreateBulkOperationResult = {created:[]};
// @ts-expect-error Result arrays contain strings, not counts or rows.
const wrongResult: sdk.RoleCreateBulkOperationResult = {created:[1],updated:[]};
// @ts-expect-error No backend count fields are invented.
void report.created_count;
// @ts-expect-error Key and name are both required.
void api.bulkCreateOrReplace([{key:'reader'}]);
// @ts-expect-error A request wrapper is not the public method's array input.
void api.bulkCreateOrReplace({operations:[tenantRole]});
// @ts-expect-error Resource keys remain strings, not nullable selectors.
void api.bulkCreateOrReplace([{...resourceRole,resource:null}]);
// @ts-expect-error Exact optional resource rejects explicit undefined.
void api.bulkCreateOrReplace([{...resourceRole,resource:undefined}]);
// @ts-expect-error Permissions remain string arrays.
void api.bulkCreateOrReplace([{...tenantRole,permissions:[1]}]);
// @ts-expect-error Inheritance remains a string array.
void api.bulkCreateOrReplace([{...tenantRole,extends:'reader'}]);
// @ts-expect-error Descriptions remain non-null strings.
void api.bulkCreateOrReplace([{...tenantRole,description:null}]);
// @ts-expect-error Arbitrary metadata must be an object.
void api.bulkCreateOrReplace([{...tenantRole,attributes:'text'}]);
// @ts-expect-error Derived rules retain the required linking relation.
void api.bulkCreateOrReplace([{...resourceRole,granted_to:{users_with_role:[{
 role:'owner',on_resource:'folder',
}]}}]);
// @ts-expect-error Bulk schema roles have no facts synchronization method.
void api.waitForSync(5);
// @ts-expect-error There is no arbitrary resource argument.
void api.bulkCreateOrReplace('document',[resourceRole]);
// @ts-expect-error The bulk operation does not introduce caller attribute generics.
void api.bulkCreateOrReplace<{enabled:boolean}>([tenantRole]);
void [result,classResult,created,updated,first,empty,incomplete,wrongResult];
declare const verified: ReturnTypes;
void verified;
`;

test('strict root consumers preserve existing bulk role input and result contracts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-bulk-role-types-'));
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
      { cwd: root, encoding: 'utf8', timeout: 30_000 },
    );
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  }
}, 65_000);
