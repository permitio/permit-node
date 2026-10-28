import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('both public entries expose the dedicated proxy configuration facade', async () => {
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
  assert.ok(permit.api.proxyConfigs instanceof sdk.ProxyConfigsApi);
  for (const method of ['list', 'get', 'create', 'update', 'delete']) {
    assert.equal(typeof permit.api.proxyConfigs[method], 'function');
  }
}
console.log('PROXY_CONFIGS_EXPORTS_OK');
`,
    ],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  expect(stdout.trim()).toBe('PROXY_CONFIGS_EXPORTS_OK');
});

const consumer = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
declare const permit: sdk.Permit;
declare const concrete: sdk.ProxyConfigsApi;
declare const client: sdk.IPermitClient;
const api: sdk.IProxyConfigsApi = permit.api.proxyConfigs;
const clientApi: sdk.IProxyConfigsApi = client.api.proxyConfigs;
const rule: sdk.MappingRule = {
  url:'^https://service.example.test/items/[0-9]+$',url_type:sdk.MappingRuleUrlTypeEnum.Regex,
  http_method:sdk.Methods.Get,resource:'document',action:'read',priority:0,headers:{'X-Tenant':'east'},
};
const removal: sdk.MappingRuleUpdate = {...rule,should_delete:false,
  url_type:sdk.MappingRuleUpdateUrlTypeEnum.Regex};
const create: sdk.ProxyConfigCreate = {key:'payments',name:'Payments',secret:'dummy',
  auth_mechanism:sdk.AuthMechanism.Bearer,mapping_rules:[rule]};
const headerSecret: sdk.Secret = {'X-Authorization':'dummy-header'};
const patch: sdk.ProxyConfigUpdate = {secret:headerSecret,auth_mechanism:sdk.AuthMechanism.Headers,
  mapping_rules:[removal]};
const options: sdk.IPagination = {page:2,perPage:3};
const listed=api.list(options),defaults=api.list(),created=api.create(create),got=api.get('key-or-id');
const updated=api.update('key-or-id',patch),deleted=api.delete('key-or-id');
const concreteList=concrete.list(),emptyPatch=concrete.update('key-or-id',{});
type Results=[
  Assert<Equal<Awaited<typeof listed>,sdk.ProxyConfigRead[]>>,
  Assert<Equal<Awaited<typeof defaults>,sdk.ProxyConfigRead[]>>,
  Assert<Equal<Awaited<typeof created>,sdk.ProxyConfigRead>>,
  Assert<Equal<Awaited<typeof got>,sdk.ProxyConfigRead>>,
  Assert<Equal<Awaited<typeof updated>,sdk.ProxyConfigRead>>,
  Assert<Equal<Awaited<typeof deleted>,void>>,
  Assert<Equal<Awaited<typeof concreteList>,sdk.ProxyConfigRead[]>>,
  Assert<Equal<Awaited<typeof emptyPatch>,sdk.ProxyConfigRead>>,
];
declare const row:sdk.ProxyConfigRead;
const metadata:string[]=[row.id,row.key,row.name,row.organization_id,row.project_id,
  row.environment_id,row.created_at,row.updated_at];
const received:sdk.Secret=row.secret;
// @ts-expect-error Creation requires a key.
api.create({name:'Payments',secret:'dummy'});
// @ts-expect-error Creation requires a name.
api.create({key:'payments',secret:'dummy'});
// @ts-expect-error Creation requires its secret union.
api.create({key:'payments',name:'Payments'});
// @ts-expect-error Secret header values are strings.
api.create({...create,secret:{'X-Secret':7}});
// @ts-expect-error The published secret has no null alternative.
api.create({...create,secret:null});
// @ts-expect-error Authentication uses the complete published enum.
api.create({...create,auth_mechanism:'Other'});
// @ts-expect-error PATCH cannot change the configuration key.
api.update('payments',{key:'renamed'});
// @ts-expect-error Exact optional values cannot explicitly be undefined.
api.update('payments',{secret:undefined});
// @ts-expect-error HTTP methods use the published lowercase enum.
const wrongMethod:sdk.MappingRule={...rule,http_method:'GET'};
// @ts-expect-error Plain URL matching omits url_type rather than inventing none.
const wrongType:sdk.MappingRule={...rule,url_type:'none'};
// @ts-expect-error Mapping headers require string values.
const wrongHeader:sdk.MappingRule={...rule,headers:{'X-Tenant':0}};
// @ts-expect-error Rule deletion is a boolean.
const wrongDelete:sdk.MappingRuleUpdate={...rule,should_delete:'true'};
// @ts-expect-error Stored results retain the complete context/identity metadata.
const incomplete:sdk.ProxyConfigRead=create;
// @ts-expect-error Listing does not have total-count query parameters.
api.list({includeTotalCount:true});
// @ts-expect-error Listing returns a bare array without a page envelope.
const page:Promise<{data:sdk.ProxyConfigRead[];total_count:number}>=api.list();
// @ts-expect-error Proxy configurations have no PDP synchronization helper.
api.waitForSync(5);
void [clientApi,metadata,received,wrongMethod,wrongType,wrongHeader,wrongDelete,incomplete,page];
declare const results:Results;
void results;

`;

test('strict TS6 and TS7 root consumers preserve proxy configuration schema contracts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-proxy-config-types-'));
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
        throw new Error(
          `Proxy configuration consumer compilation failed:\n${error.stdout}\n${error.stderr}`,
          {
            cause: error,
          },
        );
      }
      throw error;
    });
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  }
}, 65_000);
