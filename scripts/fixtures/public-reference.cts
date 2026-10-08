import SDK = require('permitio');

async function urlAuthorization(client: SDK.IPermitClient): Promise<void> {
  const config: SDK.CheckUrlConfig = {
    tenant: 'east',
    context: { enabled: false, count: 0 },
    timeout: 0,
    throwOnError: true,
  };
  const decision: boolean = await client.checkUrl(
    { key: 'alice', attributes: { eligible: true } },
    'CUSTOM',
    'https://example.test/document',
    config,
  );
  const defaultTenant: boolean = await client.checkUrl('alice', 'get', 'urn:example:document');
  // @ts-expect-error User objects require a key.
  void client.checkUrl({ attributes: {} }, 'GET', 'https://example.test/document');
  // @ts-expect-error URL authorization requires a URL string.
  void client.checkUrl('alice', 'GET', new URL('https://example.test/document'));
  // @ts-expect-error The HTTP method must be a string.
  void client.checkUrl('alice', 7, 'https://example.test/document');
  // @ts-expect-error Tenant and context use the fourth options argument.
  void client.checkUrl('alice', 'GET', 'https://example.test/document', 'east');
  // @ts-expect-error URL decisions are boolean, never a PDP response envelope.
  const envelope: { allow: boolean } = await client.checkUrl(
    'alice',
    'GET',
    'https://example.test/document',
  );
  // @ts-expect-error Exact optional tenant values cannot explicitly be undefined.
  const invalidConfig: SDK.CheckUrlConfig = { tenant: undefined };
  void [decision, defaultTenant, envelope, invalidConfig];
}
void urlAuthorization;

async function userAttributeSchema(client: SDK.IPermitApi): Promise<void> {
  const definitions: SDK.IUserAttributesApi = client.userAttributes;
  const listMethod: SDK.UserAttributesApi['list'] = definitions.list;
  const body: SDK.ResourceAttributeCreate = { key: 'department', type: SDK.AttributeType.String };
  const patch: SDK.ResourceAttributeUpdate = { description: 'Department schema' };
  const created: SDK.ResourceAttributeRead = await definitions.create(body);
  const stored: SDK.ResourceAttributeRead = await definitions.get(created.id);
  const changed: SDK.ResourceAttributeRead = await definitions.update(created.key, patch);
  const rows: SDK.ResourceAttributeRead[] = await definitions.list({ page: 1, perPage: 7 });
  const deleted: void = await definitions.delete(created.id);
  const metadata: string[] = [
    created.id,
    created.resource_id,
    created.resource_key,
    created.organization_id,
    created.project_id,
    created.environment_id,
    created.created_at,
    created.updated_at,
  ];
  const builtIn: boolean = created.built_in;
  // @ts-expect-error The schema body requires both key and type.
  void definitions.create({ key: 'department' });
  // @ts-expect-error Individual user values do not belong in a schema definition.
  void definitions.create({ ...body, attributes: { department: 'engineering' } });
  // @ts-expect-error The dedicated list has no resource selector.
  void definitions.list({ resourceId: 'document' });
  // @ts-expect-error Definitions return rows, not a total-count envelope.
  const page: { data: SDK.ResourceAttributeRead[] } = await definitions.list();
  // @ts-expect-error The public update contract does not allow a key change.
  void definitions.update(created.id, { key: 'changed' });
  // @ts-expect-error Schema description is not nullable.
  void definitions.update(created.id, { description: null });
  // @ts-expect-error Schema has no facts synchronization operation.
  void definitions.waitForSync(5);
  void [listMethod, stored, changed, rows, deleted, metadata, builtIn, page];
}
void userAttributeSchema;

async function bulkRoleDefinitions(client: SDK.IPermitApi): Promise<void> {
  const definitions: SDK.RoleCreateBulk[] = [
    { key: 'reader', name: 'Reader', permissions: ['document:read'] },
    { key: 'editor', name: 'Editor', resource: 'document', permissions: ['read', 'write'] },
  ];
  const method: SDK.RolesApi['bulkCreateOrReplace'] = client.roles.bulkCreateOrReplace;
  const result: SDK.RoleCreateBulkOperationResult =
    await client.roles.bulkCreateOrReplace(definitions);
  const created: string[] = result.created;
  const updated: string[] = result.updated;
  // @ts-expect-error The facade receives an array, not the HTTP body wrapper.
  void client.roles.bulkCreateOrReplace({ operations: definitions });
  // @ts-expect-error The existing result requires both arrays even when empty.
  const incomplete: SDK.RoleCreateBulkOperationResult = { created: [] };
  // @ts-expect-error The existing result does not contain bulk count fields.
  void result.created_count;
  void [method, created, updated, incomplete];
}
void bulkRoleDefinitions;

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
