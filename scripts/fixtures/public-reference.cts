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

async function localRolePages(client: SDK.IPermitClient): Promise<void> {
  const query: SDK.ILocalRoleAssignmentsQuery = {
    user: 'alice',
    role: 'reader',
    tenant: 'east',
    resource: 'document',
    resourceInstance: 'document:report',
    page: 1,
    perPage: 30,
  };
  const rows: SDK.ILocalRoleAssignment[] = await client.getLocalRoleAssignments(query, {
    timeout: 0,
  });
  const instance: string | null | undefined = rows[0]?.resource_instance;
  // @ts-expect-error Local reads have no total-count option.
  void client.getLocalRoleAssignments({ includeTotalCount: true });
  // @ts-expect-error The query uses camelCase names, mapped internally to the wire.
  void client.getLocalRoleAssignments({ resource_instance: 'document:report' });
  // @ts-expect-error Local rows do not require control-plane IDs or timestamps.
  const control: SDK.RoleAssignmentRead[] = rows;
  void [instance, control];
}
void localRolePages;

async function proxyConfigurations(client: SDK.IPermitApi): Promise<void> {
  const api: SDK.IProxyConfigsApi = client.proxyConfigs;
  const rule: SDK.MappingRule = {
    url: '^https://service.example.test/items/[0-9]+$',
    url_type: SDK.MappingRuleUrlTypeEnum.Regex,
    http_method: SDK.Methods.Get,
    resource: 'document',
    action: 'read',
    headers: { 'X-Tenant': 'east' },
    priority: 0,
  };
  const input: SDK.ProxyConfigCreate = {
    key: 'payments',
    name: 'Payments',
    secret: 'dummy',
    auth_mechanism: SDK.AuthMechanism.Basic,
    mapping_rules: [rule],
  };
  const patch: SDK.ProxyConfigUpdate = {
    secret: { 'X-Authorization': 'dummy-header' },
    auth_mechanism: SDK.AuthMechanism.Headers,
    mapping_rules: [{ ...rule, should_delete: false }],
  };
  const created: SDK.ProxyConfigRead = await api.create(input);
  const got: SDK.ProxyConfigRead = await api.get(created.id);
  const changed: SDK.ProxyConfigRead = await api.update(created.key, patch);
  const listed: SDK.ProxyConfigRead[] = await api.list({ page: 1, perPage: 7 });
  const deleted: void = await api.delete(created.id);
  const secret: SDK.Secret = got.secret;
  // @ts-expect-error Proxy creation requires key, name and secret.
  void api.create({ key: 'payments', name: 'Payments' });
  // @ts-expect-error Secret dictionaries contain strings.
  void api.update(created.id, { secret: { 'X-Authorization': 7 } });
  // @ts-expect-error PATCH cannot rename a key.
  void api.update(created.id, { key: 'other' });
  // @ts-expect-error Plain URL matching omits url_type; none is not an enum member.
  const invalidRule: SDK.MappingRule = { ...rule, url_type: 'none' };
  // @ts-expect-error Lists return a plain array without invented counts.
  const page: { data: SDK.ProxyConfigRead[] } = await api.list();
  // @ts-expect-error This configuration API has no facts synchronization helper.
  void api.waitForSync(5);
  void [changed, listed, deleted, secret, invalidRule, page];
}
void proxyConfigurations;

async function apiKeyManagement(client: SDK.IPermitApi): Promise<void> {
  const api: SDK.IApiKeysApi = client.apiKeys;
  const input: SDK.APIKeyCreate = {
    organization_id: 'organization-id',
    project_id: 'project-id',
    environment_id: 'environment-id',
    object_type: SDK.MemberAccessObj.Env,
    access_level: SDK.MemberAccessLevel.Read,
    owner_type: SDK.APIKeyOwnerType.Member,
    name: 'Disposable key',
  };
  const query: SDK.IListApiKeys = {
    objectType: SDK.MemberAccessObj.Project,
    projId: 'project-key-or-id',
    page: 1,
    perPage: 3,
  };
  const page: SDK.PaginatedResultAPIKeyRead = await api.list(query);
  const created: SDK.APIKeyRead = await api.create(input);
  const got: SDK.APIKeyRead = await api.get(created.id);
  const rotated: SDK.APIKeyRead = await api.rotate(created.id);
  const deleted: void = await api.delete(rotated.id);
  const scope: SDK.APIKeyScopeRead = await api.getScope();
  const secret: string | null | undefined = got.secret;
  const counts: [number, number | null | undefined] = [page.total_count, page.page_count];
  const ids: [string, string | null | undefined, string | null | undefined] = [
    scope.organization_id,
    scope.project_id,
    scope.environment_id,
  ];
  const organizationScope: SDK.APIKeyScopeRead = {
    organization_id: 'org',
    project_id: null,
    environment_id: null,
  };
  const projectScope: SDK.APIKeyScopeRead = {
    organization_id: 'org',
    project_id: 'project',
    environment_id: null,
  };
  if (scope.project_id !== undefined) {
    // @ts-expect-error Excluding undefined still leaves a nullable project ID.
    scope.project_id.toUpperCase();
  }
  if (scope.environment_id !== undefined) {
    // @ts-expect-error Excluding undefined still leaves a nullable environment ID.
    scope.environment_id.toUpperCase();
  }
  if (scope.project_id != null) scope.project_id.toUpperCase();
  if (scope.environment_id != null) scope.environment_id.toUpperCase();
  // @ts-expect-error The organization ID remains required and nonnullable.
  const invalidScope: SDK.APIKeyScopeRead = { organization_id: null };
  // @ts-expect-error Creation input is not widened by scope-response nullability.
  void api.create({ organization_id: 'org', environment_id: null });
  void [organizationScope, projectScope, invalidScope];
  const nullableRecord: SDK.APIKeyRead = {
    organization_id: 'org',
    owner_type: SDK.APIKeyOwnerType.Member,
    id: 'id',
    created_at: 'created',
    project_id: null,
    environment_id: null,
    object_type: null,
    access_level: null,
    name: null,
    secret: null,
    created_by_member: null,
    last_used_at: null,
    env: null,
    project: null,
  };
  const nullablePage: SDK.PaginatedResultAPIKeyRead = {
    data: [nullableRecord],
    total_count: 1,
    page_count: null,
  };
  if (got.secret !== undefined) {
    // @ts-expect-error Excluding undefined still leaves a nullable secret.
    got.secret.toUpperCase();
  }
  if (got.project !== undefined) {
    // @ts-expect-error Excluding undefined still leaves a nullable nested project.
    void got.project.id;
  }
  if (page.page_count !== undefined) {
    // @ts-expect-error Excluding undefined still leaves a nullable page count.
    page.page_count.toFixed();
  }
  if (got.secret != null) got.secret.toUpperCase();
  if (got.project != null) void got.project.id;
  if (page.page_count != null) page.page_count.toFixed();
  // @ts-expect-error Required key record IDs stay nonnullable.
  const nullId: SDK.APIKeyRead = { ...got, id: null };
  // @ts-expect-error Required list totals stay nonnullable.
  const nullTotal: SDK.PaginatedResultAPIKeyRead = { data: [], total_count: null };
  void [nullableRecord, nullablePage, nullId, nullTotal];
  // @ts-expect-error Creation requires organization_id.
  void api.create({ name: 'Incomplete' });
  // @ts-expect-error Secrets are server responses, not creation input.
  void api.create({ ...input, secret: 'caller-supplied' });
  // @ts-expect-error The published project filter is projId.
  void api.list({ projectId: 'project' });
  // @ts-expect-error No environment filter is published.
  void api.list({ environmentId: 'environment' });
  // @ts-expect-error Lists preserve their complete envelope.
  const rows: SDK.APIKeyRead[] = await api.list();
  // @ts-expect-error A returned secret is optional.
  const requiredSecret: string = created.secret;
  // @ts-expect-error Rotation is bodyless.
  void api.rotate(created.id, input);
  // @ts-expect-error Scope discovery takes no selected-context argument.
  void api.getScope({ projectId: 'project' });
  // @ts-expect-error API-key management has no update operation.
  void api.update(created.id, {});
  // @ts-expect-error Exact optional scope does not accept explicit undefined.
  void api.create({ organization_id: 'org', environment_id: undefined });
  void [deleted, secret, counts, ids, rows, requiredSecret];
}
void apiKeyManagement;

async function auditLogs(client: SDK.IPermitApi) {
  const api: SDK.IAuditLogsApi = client.auditLogs;
  const options: SDK.IListAuditLogs = {
    users: ['alice'] as const,
    decision: false,
    timestampFrom: 0,
    query: SDK.AuditLogQueryType.None,
    sortBy: SDK.AuditLogSortKey.None,
  };
  const page: SDK.LimitedPaginatedResultAuditLogModel = await api.list(options);
  for (const row of page.data) {
    const detail: SDK.DetailedAuditLogModel = await api.get(row.id);
    const raw: SDK.RawData1 = detail.raw_data;
    if ('metrics' in raw) {
      const duration: number | null | undefined = raw.metrics.timer_rego_query_eval_ns;
      void duration;
    }
    const objects: SDK.AuditLogObjectsModel | null | undefined = detail.objects;
    const count: number | null | undefined = page.page_count;
    void [objects, count];
    // @ts-expect-error The optional engine tag does not exclude the dummy union branch.
    if (raw.engine === 'OPA') void raw.metrics;
  }
  // @ts-expect-error User filters require repeated arrays, not CSV strings.
  void api.list({ users: 'alice,bob' });
  // @ts-expect-error False is boolean, not a numeric decision.
  void api.list({ decision: 0 });
  // @ts-expect-error List preserves the complete envelope.
  const rows: SDK.AuditLogModel[] = await api.list();
  // @ts-expect-error Audit reads have no replay API.
  void api.replay('id');
  void rows;
}
void auditLogs;

async function asynchronousEnvironmentCopy(client: SDK.IPermitApi): Promise<void> {
  const api: SDK.IEnvironmentsApi = client.environments;
  const copy: SDK.EnvironmentCopy = {
    target_env: {
      new: {
        key: 'target',
        name: 'Target',
        jwks: { url: 'https://keys.example' },
        settings: { count: 0, enabled: false },
      },
      existing: 'existing-target',
    },
    conflict_strategy: SDK.EnvironmentCopyConflictStrategy.Overwrite,
    scope: {
      resources: { include: ['doc'], exclude: [] },
      roles: { exclude: ['other'] },
      user_sets: { include: [] },
      resource_sets: { exclude: [] },
      custom_policies: { include: [] },
    },
  };
  const submitted: SDK.TaskResultEnvironmentRead = await api.copyAsync(
    'project',
    'source',
    copy,
    0,
  );
  const read: SDK.TaskResultEnvironmentRead = await api.getCopyResult(
    'project',
    'source',
    submitted.task_id,
    0.5,
  );
  const status: SDK.TaskStatus = read.status;
  const nullable: SDK.TaskResultEnvironmentRead = {
    task_id: 'task',
    status: SDK.TaskStatus.Processing,
    result: null,
    error: null,
  };
  const omitted: SDK.TaskResultEnvironmentRead = {
    task_id: 'task',
    status: SDK.TaskStatus.Cancelled,
  };
  if (read.result) {
    const result: SDK.EnvironmentRead = read.result;
    const required: string[] = [
      result.key,
      result.name,
      result.id,
      result.organization_id,
      result.project_id,
      result.created_at,
      result.updated_at,
    ];
    void [
      required,
      result.description,
      result.custom_branch_name,
      result.avp_policy_store_id,
      result.jwks?.url,
      result.jwks?.ttl,
      result.jwks?.jwks,
      result.settings,
    ];
  }
  if (read.error) {
    const error: SDK.ErrorDetails = read.error;
    const required: string[] = [error.id, error.title, error.error_code];
    const details: unknown = error.additional_info;
    void [required, details, error.message, error.support_link];
  }
  // @ts-expect-error A copy body requires the published target_env.
  void api.copyAsync('project', 'source', { scope: {} });
  // @ts-expect-error Wait seconds require a number.
  void api.copyAsync('project', 'source', copy, '0');
  // @ts-expect-error Result wait seconds require a number.
  void api.getCopyResult('project', 'source', 'task', null);
  // @ts-expect-error The published task status has no failed alias.
  const badStatus: SDK.TaskStatus = 'failed';
  // @ts-expect-error Task result requires complete environment metadata.
  const badResult: SDK.TaskResultEnvironmentRead['result'] = { key: 'target' };
  // @ts-expect-error ErrorDetails requires its ID, title and error_code.
  const badError: SDK.TaskResultEnvironmentRead['error'] = { message: 'failure' };
  // @ts-expect-error Exact optional result does not accept explicit undefined.
  const undefinedResult: SDK.TaskResultEnvironmentRead = {
    task_id: 'task',
    status,
    result: undefined,
  };
  // @ts-expect-error Exact optional error does not accept explicit undefined.
  const undefinedError: SDK.TaskResultEnvironmentRead = {
    task_id: 'task',
    status,
    error: undefined,
  };
  // @ts-expect-error Task ID is required even for processing.
  const missingTask: SDK.TaskResultEnvironmentRead = { status: SDK.TaskStatus.Processing };
  // @ts-expect-error Async copy returns the task envelope, not only its environment.
  const projected: SDK.EnvironmentRead = await api.copyAsync('project', 'source', copy);
  void [
    nullable,
    omitted,
    badStatus,
    badResult,
    badError,
    undefinedResult,
    undefinedError,
    missingTask,
    projected,
  ];
}
void asynchronousEnvironmentCopy;
