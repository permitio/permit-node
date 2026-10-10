import SDK = require('permitio');

const resource: SDK.ResourceInstanceCreate = {
  key: 'one',
  resource: 'document',
  tenant: 'tenant',
};
const assignment: SDK.RoleAssignmentRemove = {
  user: 'customer',
  role: 'reader',
  tenant: 'tenant',
};
const strategy: 'fail' = SDK.EnvironmentCopyConflictStrategy.Fail;
void [resource, assignment, strategy];

// @ts-expect-error T1 requires actual tenant data for resource creation.
const missingResourceTenant: SDK.ResourceInstanceCreate = { key: 'one', resource: 'document' };
// @ts-expect-error T1 requires the unassignment tenant.
const missingAssignmentTenant: SDK.RoleAssignmentRemove = { user: 'customer', role: 'reader' };
// @ts-expect-error T3 removed the response body generic.
type OldError = SDK.PermitApiError<{ private: string }>;
declare const bulk: Awaited<ReturnType<SDK.IUsersApi['bulkUserCreate']>>;
// @ts-expect-error T2 does not promise processing operation arrays.
void bulk.operations;
void [missingResourceTenant, missingAssignmentTenant];
export type { OldError };
