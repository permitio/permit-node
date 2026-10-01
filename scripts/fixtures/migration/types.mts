import {
  EnvironmentCopyConflictStrategy,
  type ResourceInstanceCreate,
  type RoleAssignmentRemove,
  type PermitApiError,
  type IUsersApi,
} from 'permitio';

const resource: ResourceInstanceCreate = { key: 'one', resource: 'document', tenant: 'tenant' };
const assignment: RoleAssignmentRemove = { user: 'customer', role: 'reader', tenant: 'tenant' };
const strategy: 'fail' = EnvironmentCopyConflictStrategy.Fail;
void [resource, assignment, strategy];

// @ts-expect-error T1 requires actual tenant data for resource creation.
const missingResourceTenant: ResourceInstanceCreate = { key: 'one', resource: 'document' };
// @ts-expect-error T1 requires the unassignment tenant.
const missingAssignmentTenant: RoleAssignmentRemove = { user: 'customer', role: 'reader' };
// @ts-expect-error T3 removed the response body generic.
type OldError = PermitApiError<{ private: string }>;
declare const bulk: Awaited<ReturnType<IUsersApi['bulkUserCreate']>>;
// @ts-expect-error T2 does not promise processing operation arrays.
void bulk.operations;
void [missingResourceTenant, missingAssignmentTenant];
export type { OldError };
