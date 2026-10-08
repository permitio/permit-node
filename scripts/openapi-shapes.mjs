import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// These individual properties are intentionally unconstrained in the pinned API spec.
// No entire model is exempt from the checks below.
const FREE_FORM = new Set([
  'audit-log-model.ts:input',
  'audit-log-model.ts:result',
  'audit-log-model.ts:context',
  'detailed-audit-log-model.ts:input',
  'detailed-audit-log-model.ts:result',
  'detailed-audit-log-model.ts:context',
  'error-details.ts:additional_info',
  'generic-engine-decision-log.ts:input',
  'generic-engine-decision-log.ts:result',
  'generic-engine-decision-log.ts:context',
  'jsonpatch-action.ts:value',
  'opaengine-decision-log.ts:input',
  'opaengine-decision-log.ts:result',
  'opalhttp-fetcher-config.ts:data',
  'raw-data.ts:input',
  'raw-data.ts:result',
  'raw-data.ts:context',
  'raw-data1.ts:input',
  'raw-data1.ts:result',
  'raw-data1.ts:context',
]);
const EXPECTED = {
  'apikey-read.ts:organization_id': 'string',
  'apikey-read.ts:owner_type': 'APIKeyOwnerType',
  'apikey-read.ts:id': 'string',
  'apikey-read.ts:created_at': 'string',
  'apikey-read.ts:project_id': 'string|null',
  'apikey-read.ts:environment_id': 'string|null',
  'apikey-read.ts:object_type': 'MemberAccessObj|null',
  'apikey-read.ts:access_level': 'MemberAccessLevel|null',
  'apikey-read.ts:name': 'string|null',
  'apikey-read.ts:secret': 'string|null',
  'apikey-read.ts:created_by_member': 'OrgMemberRead|null',
  'apikey-read.ts:last_used_at': 'string|null',
  'apikey-read.ts:env': 'EnvironmentRead|null',
  'apikey-read.ts:project': 'ProjectRead|null',
  'paginated-result-apikey-read.ts:data': 'Array<APIKeyRead>',
  'paginated-result-apikey-read.ts:total_count': 'number',
  'paginated-result-apikey-read.ts:page_count': 'number|null',

  'apikey-scope-read.ts:organization_id': 'string',
  'apikey-scope-read.ts:project_id': 'string|null',
  'apikey-scope-read.ts:environment_id': 'string|null',
  'monthly-usage.ts:monthly_tenants': 'Array<string>',
  'role-create.ts:key': 'string',
  'role-create.ts:extends': 'Array<string>',
  'resource-role-create.ts:extends': 'Array<string>',
  'group-assign-user.ts:tenant': 'string',
  'tenant-obj.ts:id': 'string',
  'user-obj.ts:id': 'string',
  'action-obj.ts:id': 'string',
  'codegen-probe.ts:nullable_string': 'string|null',
  'codegen-probe.ts:nullable_any_of': 'string|null',
  'codegen-probe.ts:nullable_ref': 'CodegenProbeInner|null',
  'codegen-probe.ts:nullable_array': 'Array<number>|null',
};

const OPTIONAL = {
  'apikey-read.ts:organization_id': false,
  'apikey-read.ts:owner_type': false,
  'apikey-read.ts:id': false,
  'apikey-read.ts:created_at': false,
  'apikey-read.ts:project_id': true,
  'apikey-read.ts:environment_id': true,
  'apikey-read.ts:object_type': true,
  'apikey-read.ts:access_level': true,
  'apikey-read.ts:name': true,
  'apikey-read.ts:secret': true,
  'apikey-read.ts:created_by_member': true,
  'apikey-read.ts:last_used_at': true,
  'apikey-read.ts:env': true,
  'apikey-read.ts:project': true,
  'paginated-result-apikey-read.ts:data': false,
  'paginated-result-apikey-read.ts:total_count': false,
  'paginated-result-apikey-read.ts:page_count': true,

  'apikey-scope-read.ts:organization_id': false,
  'apikey-scope-read.ts:project_id': true,
  'apikey-scope-read.ts:environment_id': true,
};

const UNIONS = {
  'response-list-condition-sets-v2-schema-proj-id-env-id-condition-sets-get.ts':
    'Array<ConditionSetRead>|PaginatedResultConditionSetRead',
  'response-list-tenants-v2-facts-proj-id-env-id-tenants-get.ts':
    'Array<TenantRead>|PaginatedResultTenantRead',
  'response-list-relationship-tuples-v2-facts-proj-id-env-id-relationship-tuples-get.ts':
    'Array<RelationshipTupleRead>|PaginatedResultRelationshipTupleRead',
  'response-list-roles-v2-schema-proj-id-env-id-roles-get.ts':
    'Array<RoleRead>|PaginatedResultRoleRead',
  'response-list-resource-instances-v2-facts-proj-id-env-id-resource-instances-get.ts':
    'Array<ResourceInstanceRead>|PaginatedResultResourceInstanceRead',
  'response-list-resources-v2-schema-proj-id-env-id-resources-get.ts':
    'Array<ResourceRead>|PaginatedResultResourceRead',
  'response-list-elements-configs-v2-elements-proj-id-env-id-config-get.ts':
    'Array<ElementsConfigRead>|PaginatedResultElementsConfigRead',
  'response-list-role-assignments-v2-facts-proj-id-env-id-role-assignments-get.ts':
    'Array<RoleAssignmentDetailedRead>|Array<RoleAssignmentRead>|PaginatedResultRoleAssignmentDetailedRead|PaginatedResultRoleAssignmentRead',
  'secret.ts': 'string|{[key:string]:string}',
  'callbacks-inner.ts': 'string|[string,OPALHttpFetcherConfig]',
};

export async function assertModelShapes(typesDir, files, { fixture = false } = {}) {
  let ts;
  try {
    ({ default: ts } = await import('@permitio/compiler-tools'));
  } catch (cause) {
    throw new Error('Compiler API dependency unavailable; run pnpm install first.', { cause });
  }
  function containsAny(node) {
    if (!node) return false;
    if (node.kind === ts.SyntaxKind.AnyKeyword) return true;
    // A nested dictionary is legitimate free-form data, not a collapsed model.
    if (ts.isIndexSignatureDeclaration(node)) return false;
    return Boolean(ts.forEachChild(node, containsAny));
  }

  const properties = new Map();
  const optionalProperties = new Map();
  const aliases = new Map();
  const problems = [];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(join(typesDir, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    if (source.parseDiagnostics.length) {
      throw new Error(`Invalid generated TypeScript in ${file}; inspect the generator output.`);
    }
    for (const declaration of source.statements) {
      if (ts.isTypeAliasDeclaration(declaration))
        aliases.set(file, declaration.type.getText(source).replace(/\s+/g, '').replace(/^\|/, ''));
      // DataSourceEntryWithPollingInterval.data explicitly includes unconstrained array items.
      // Permit only its exact reviewed union, never a whole-model any exemption.
      if (
        ts.isTypeAliasDeclaration(declaration) &&
        containsAny(declaration.type) &&
        !(file === 'data.ts' && aliases.get(file) === 'Array<JSONPatchAction>|Array<any>|object')
      ) {
        problems.push(`${file}: unexpected any in type alias ${declaration.name.text}`);
      }
      if (!ts.isInterfaceDeclaration(declaration)) continue;
      if (declaration.members.length === 0 && !declaration.heritageClauses?.length)
        problems.push(`${file}: empty interface loses its schema`);
      for (const member of declaration.members) {
        if (ts.isIndexSignatureDeclaration(member) && containsAny(member.type)) {
          problems.push(`${file}: unexpected top-level any index signature`);
        }
        if (!ts.isPropertySignature(member)) continue;
        const key = `${file}:${member.name.text}`;
        properties.set(key, member.type?.getText(source).replace(/\s+/g, ''));
        optionalProperties.set(key, Boolean(member.questionToken));
        if ((!member.type || containsAny(member.type)) && !FREE_FORM.has(key)) {
          problems.push(`${key}: unexpected any (named type lost)`);
        }
      }
    }
  }
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (key.startsWith('codegen-probe.ts:') && !fixture) continue;
    if (properties.get(key) !== expected) {
      problems.push(`${key}: expected ${expected}, got ${properties.get(key) ?? 'missing'}`);
    }
  }
  for (const [key, optional] of Object.entries(OPTIONAL)) {
    if (optionalProperties.get(key) !== optional) {
      problems.push(`${key}: expected ${optional ? 'optional' : 'required'} field`);
    }
  }
  if (!fixture) {
    for (const [file, expected] of Object.entries(UNIONS)) {
      const actual = aliases.get(file);
      if (actual !== expected)
        problems.push(`${file}: expected union ${expected}, got ${actual ?? 'missing'}`);
    }
  }
  if (problems.length) {
    throw new Error(
      `${problems.length} type-shape regression(s):\n  ${problems.slice(0, 12).join('\n  ')}\n` +
        'Inspect the fixture and models before changing the generator pin or expectations.',
    );
  }
}
