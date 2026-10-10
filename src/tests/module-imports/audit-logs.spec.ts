import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('both public entries expose the dedicated audit log facade', async () => {
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
  assert.ok(permit.api.auditLogs instanceof sdk.AuditLogsApi);
  for (const method of ['list', 'get']) {
    assert.equal(typeof permit.api.auditLogs[method], 'function');
  }
}
console.log('AUDIT_LOG_EXPORTS_OK');
`,
    ],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  expect(stdout.trim()).toBe('AUDIT_LOG_EXPORTS_OK');
});

const consumer = `

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
declare const permit: sdk.Permit;
declare const client: sdk.IPermitClient;
declare const concrete: sdk.AuditLogsApi;
const api:sdk.IAuditLogsApi=permit.api.auditLogs;
const clientApi:sdk.IAuditLogsApi=client.api.auditLogs;
const filters:sdk.IListAuditLogs={page:1,perPage:100,pdpId:'uuid',users:['alice'] as const,
  decision:false,resources:['document'] as const,tenant:'east',action:'read',timestampFrom:0,
  timestampTo:1,sortBy:sdk.AuditLogSortKey.None,query:sdk.AuditLogQueryType.None};
const listed=api.list(filters),defaults=concrete.list(),got=api.get('log-uuid');
type Results=[Assert<Equal<Awaited<typeof listed>,sdk.LimitedPaginatedResultAuditLogModel>>,
  Assert<Equal<Awaited<typeof defaults>,sdk.LimitedPaginatedResultAuditLogModel>>,
  Assert<Equal<Awaited<typeof got>,sdk.DetailedAuditLogModel>>];
declare const page:sdk.LimitedPaginatedResultAuditLogModel;
const rows:sdk.AuditLogModel[]=page.data;
const counts:number[]=[page.total_count,page.pagination_count];
const pages:number|null|undefined=page.page_count;
declare const detail:sdk.DetailedAuditLogModel;
const raw:sdk.RawData1=detail.raw_data;
const listRaw:sdk.RawData|null|undefined=rows[0]?.raw_data;
const objects:sdk.AuditLogObjectsModel|null|undefined=detail.objects;
const opa:sdk.OPAEngineDecisionLog={decision_id:'id',labels:{id:'opa',version:'1'},
  timestamp:'date',path:'permit/allow',metrics:{}};
const avp:sdk.AVPEngineDecisionLog={timestamp:'date',tenant:'east',input:{},result:{}};
const generic:sdk.GenericEngineDecisionLog={timestamp:'date',decision:false};
const dummy:sdk.DummyEngineModel={};
const branches:sdk.RawData[]=[opa,avp,generic,dummy];
if ('metrics' in raw) { const metrics=raw.metrics; void metrics; }
// @ts-expect-error The engine tag is optional and dummy branches overlap it.
if (raw.engine==='OPA') { const metrics=raw.metrics; void metrics; }
// @ts-expect-error Optional rows cannot be indexed without checking presence.
const first:sdk.AuditLogModel=page.data[0];
// @ts-expect-error Optional detail objects are not guaranteed.
const guaranteed:sdk.AuditLogObjectsModel=detail.objects;
// @ts-expect-error List returns a full envelope, not a bare array.
const array:Promise<sdk.AuditLogModel[]>=api.list();
// @ts-expect-error Detail requires received raw_data.
const incomplete:sdk.DetailedAuditLogModel={id:'id',timestamp:'date',org_id:'org',
  project_id:'project',env_id:'environment'};
// @ts-expect-error User filters are repeated arrays, not CSV strings.
api.list({users:'alice,bob'});
// @ts-expect-error Resource filters are arrays.
api.list({resources:'document'});
// @ts-expect-error Decision is boolean, not number.
api.list({decision:0});
// @ts-expect-error Timestamp filters use published numbers, not Date instances.
api.list({timestampFrom:new Date()});
// @ts-expect-error Sort None is capitalized in the published enum.
api.list({sortBy:'none'});
// @ts-expect-error Query none is lower-case in the published enum.
api.list({query:'None'});
// @ts-expect-error Exact optional filter values cannot explicitly be undefined.
api.list({decision:undefined});
// @ts-expect-error Context comes from the selected client scope.
api.list({projId:'other'});
// @ts-expect-error The published finite query has no includeTotalCount.
api.list({includeTotalCount:true});
// @ts-expect-error There is no sort direction filter.
api.list({sortDirection:'desc'});
// @ts-expect-error Text query and cursors are not published filters.
api.list({text:'alice',cursor:'next'});
// @ts-expect-error Authorization audit reads have no replay helper.
api.replay('id');
// @ts-expect-error Audit records have no SDK delete helper.
api.delete('id');
// @ts-expect-error Control-plane reads have no synchronization helper.
api.waitForSync(5);
// @ts-expect-error This surface has no Elements endpoint.
api.elements.list();

const nullRow: sdk.AuditLogModel = {id:'id',timestamp:'date',org_id:'org',
  project_id:'project',env_id:'environment',raw_data:null,created_at:null,query:null,
  user_key:null,user_email:null,user_name:null,resource_type:null,tenant:null,action:null,
  decision:null,reason:null,pdp_config_id:null};
const nullObjects: sdk.AuditLogObjectsModel = {id:null,organization_object:null,
  project_object:null,environment_object:null,pdp_config_object:null,user_object:null,
  action_object:null,resource_type_object:null,tenant_object:null,created_at:null};
const nestedObjects: sdk.AuditLogObjectsModel = {
  organization_object:{id:'id',key:'key',name:null},
  project_object:{id:'id',key:'key',name:null},
  environment_object:{id:'id',key:'key',name:null},
  user_object:{id:'id',key:'key',created_at:'date',updated_at:'date',email:null,
    first_name:null,last_name:null,attributes:null,roles:null,assigned_roles:null},
  action_object:{id:'id',key:'key',name:null,created_at:'date',updated_at:'date'},
  resource_type_object:{id:'id',key:'key',name:null,attributes:null,
    created_at:'date',updated_at:'date'},
  tenant_object:{id:'id',key:'key',name:null,attributes:null,created_at:'date',updated_at:'date'},
};
const nullDetail: sdk.DetailedAuditLogModel = {...nullRow,raw_data:{engine:null},objects:null};
const nestedNullDetail: sdk.DetailedAuditLogModel = {...nullDetail,objects:nestedObjects,
  raw_data:{...opa,engine:null,metrics:{timer_rego_input_parse_ns:null,
    timer_rego_query_parse_ns:null,timer_rego_query_compile_ns:null,timer_rego_query_eval_ns:null,
    timer_rego_module_parse_ns:null,timer_rego_module_compile_ns:null,timer_server_handler_ns:null}}};
const nullAvp: sdk.AVPEngineDecisionLog = {...avp,engine:null,process_time_ms:null};
const nullGeneric: sdk.GenericEngineDecisionLog = {...generic,engine:null,decision_id:null,
  process_time_ms:null,query:null,user_key:null,user_email:null,user_name:null,action:null,
  resource_type:null,tenant:null};
const nullDummy: sdk.DummyEngineModel = {engine:null,timestamp:null};
const nullPage: sdk.LimitedPaginatedResultAuditLogModel = {
  data:[nullRow],total_count:0,pagination_count:0,page_count:null};
// @ts-expect-error Required detail raw_data remains non-nullable.
const nullRaw: sdk.DetailedAuditLogModel = {...nullDetail,raw_data:null};
// @ts-expect-error Required audit identifiers remain non-nullable.
const nullId: sdk.AuditLogModel = {...nullRow,id:null};
// @ts-expect-error Required audit timestamp remains non-nullable.
const nullTimestamp: sdk.AuditLogModel = {...nullRow,timestamp:null};
// @ts-expect-error Required total count remains non-nullable.
const nullCount: sdk.LimitedPaginatedResultAuditLogModel = {...nullPage,total_count:null};
// @ts-expect-error The page rows remain required, non-null objects.
const nullData: sdk.LimitedPaginatedResultAuditLogModel = {...nullPage,data:[null]};
// @ts-expect-error Required OPA metrics object remains non-nullable.
const nullMetrics: sdk.OPAEngineDecisionLog = {...opa,metrics:null};
// @ts-expect-error Required OPA decision identifier remains non-nullable.
const nullDecisionId: sdk.OPAEngineDecisionLog = {...opa,decision_id:null};
// @ts-expect-error Required AVP input remains non-nullable.
const nullAvpInput: sdk.AVPEngineDecisionLog = {...avp,input:null};
// @ts-expect-error Required AVP tenant remains non-nullable.
const nullAvpTenant: sdk.AVPEngineDecisionLog = {...avp,tenant:null};
// @ts-expect-error Required generic decision remains non-nullable.
const nullGenericDecision: sdk.GenericEngineDecisionLog = {...generic,decision:null};
const nullUser: NonNullable<sdk.AuditLogObjectsModel['user_object']> = {
  // @ts-expect-error Nested required user identity remains non-nullable.
  id:null,key:'key',created_at:'date',updated_at:'date'};
// @ts-expect-error Request decisions remain non-nullable.
api.list({decision:null});
// @ts-expect-error Request arrays remain non-nullable.
api.list({users:null});
// @ts-expect-error Request array items remain non-nullable.
api.list({resources:[null]});
// @ts-expect-error Request timestamp bounds remain non-nullable.
api.list({timestampFrom:null});
// @ts-expect-error Request sort remains non-nullable.
api.list({sortBy:null});
// @ts-expect-error Optional list raw data requires a null guard.
const guaranteedListRaw: sdk.RawData = nullRow.raw_data;
// @ts-expect-error Optional metric values require a null guard.
const guaranteedMetric: number = opa.metrics.timer_rego_query_eval_ns;
void [nullRow,nullObjects,nestedObjects,nullDetail,nestedNullDetail,nullAvp,nullGeneric,nullDummy,
  nullPage,nullRaw,nullId,nullTimestamp,nullCount,nullData,nullMetrics,nullDecisionId,
  nullAvpInput,nullAvpTenant,nullGenericDecision,nullUser,guaranteedListRaw,guaranteedMetric];

void [clientApi,rows,counts,pages,raw,listRaw,objects,branches,first,guaranteed,array,incomplete];
declare const results:Results;
void results;

`;

test('strict TS6 and TS7 root consumers preserve audit-log schema contracts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-audit-log-types-'));
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
          `Audit-log consumer compilation failed:\n${error.stdout}\n${error.stderr}`,
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
