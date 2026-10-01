import * as SDK from 'permitio';

declare const api: SDK.IPermitApi;
declare const permit: SDK.Permit;
declare const relationClient: SDK.ResourceRelationsApi;
declare const roleClient: SDK.ResourceRolesApi;
const relations: SDK.IResourceRelationsApi = relationClient;
const roles: SDK.IResourceRolesApi = roleClient;
const relationQuery: SDK.IListRelations = { resourceKey: 'document', page: 1 };
const roleQuery: SDK.IListResourceRoles = { resourceKey: 'document' };
const relationInput: SDK.RelationCreate = {
  key: 'parent',
  name: 'Parent',
  subject_resource: 'folder',
};
const roleInput: SDK.ResourceRoleCreate = { key: 'reader', name: 'Reader', permissions: ['read'] };
const roleUpdate: SDK.ResourceRoleUpdate = { permissions: ['read'] };
const conditions: SDK.PermitBackendSchemasSchemaDerivedRoleRuleDerivationSettings = {
  no_direct_roles_on_object: true,
};
const derivation: SDK.DerivedRoleRuleCreate = {
  role: 'reader',
  on_resource: 'folder',
  linked_by_relation: 'parent',
  when: conditions,
};
const remove: SDK.DerivedRoleRuleDelete = derivation;
const groupUpdate: SDK.ResourceActionGroupUpdate = { actions: ['read'] };
const check: SDK.ICheckQuery = { user: 'alice', action: 'read', resource: 'document' };
const checkConfig: SDK.CheckConfig = { timeout: 0, throwOnError: false };
const pagination: SDK.IPaginationExtended = { includeTotalCount: true };
const userRoles: SDK.IGetUserRoles = { user: 'alice', tenant: 'default', includeTotalCount: true };
const syncPolicy: SDK.FactsSyncTimeoutPolicy = 'fail';
declare const error: SDK.PermitApiError;
const formatted: SDK.FormattedAxiosError = error.formattedAxiosError;

async function contracts() {
  const relation: SDK.RelationRead = await relations.create('document', relationInput);
  const role: SDK.ResourceRoleRead = await roles.update('document', 'reader', roleUpdate);
  const derived: SDK.DerivedRoleRuleRead = await roles.createRoleDerivation(
    'document',
    'reader',
    derivation,
  );
  const permissions: SDK.IUserPermissions = await permit.getUserPermissions('alice');
  const page: SDK.ReturnPaginationType<
    { includeTotalCount: true },
    SDK.PaginatedResultResourceRead,
    SDK.ResourceRead[]
  > = await api.resources.list({ includeTotalCount: true });
  const assigned: SDK.ReturnListRoleAssignments<{ includeTotalCount: true }> =
    await api.roleAssignments.list({ includeTotalCount: true });
  const userAssigned: SDK.ReturnIGetUserRolesType<{ user: string; includeTotalCount: true }> =
    await api.users.getAssignedRoles({ user: 'alice', includeTotalCount: true });
  await roles.deleteRoleDerivation('document', 'reader', remove);
  await api.ensureContext(SDK.ApiContextLevel.ENVIRONMENT);
  try {
    new SDK.ApiContext().setEnvironmentLevelContext('org', 'project', 'env');
  } catch (failure) {
    if (!(failure instanceof SDK.PermitContextChangeError)) throw failure;
    const status: number | undefined = failure.status;
    void status;
  }
  return { relation, role, derived, permissions, page, assigned, userAssigned };
}

// @ts-expect-error Relation creation retains its required subject resource.
const invalidRelation: SDK.RelationCreate = { key: 'parent', name: 'Parent' };
// @ts-expect-error Permission entries retain string arrays.
const invalidRole: SDK.ResourceRoleUpdate = { permissions: [123] };
const invalidConditions: SDK.PermitBackendSchemasSchemaDerivedRoleRuleDerivationSettings = {
  // @ts-expect-error Derived-role conditions retain boolean fields.
  no_direct_roles_on_object: 'true',
};
// @ts-expect-error Check policy fields are booleans.
const invalidCheck: SDK.CheckConfig = { throwOnError: 'false' };
// @ts-expect-error Context levels remain the actual enum rather than arbitrary strings.
const invalidContext: SDK.ApiContextLevel = 'ENVIRONMENT';
// @ts-expect-error Sanitized REST diagnostics remain unknown until narrowed.
void formatted.error.secret;
void [
  relations,
  roles,
  relationQuery,
  roleQuery,
  roleInput,
  groupUpdate,
  check,
  checkConfig,
  pagination,
  userRoles,
  syncPolicy,
  formatted,
  contracts,
  invalidRelation,
  invalidRole,
  invalidConditions,
  invalidCheck,
  invalidContext,
];
