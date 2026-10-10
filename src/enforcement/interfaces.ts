import { type Context } from '#src/utils/context';
import { type Dict } from '#src/utils/dict';

export interface ICheckInput {
  user: IUser;
  action: IAction;
  resource: IResource;
  context?: Context;
}

/** The published container PDP URL authorization request. */
export interface ICheckUrlInput {
  user: IUser;
  http_method: string;
  url: string;
  tenant: string;
  context: Context;
}

export interface ICheckOpaInput {
  input: ICheckInput;
}

export interface ICheckQuery {
  user: IUser | string;
  action: IAction | string;
  resource: IResource | string;
  context?: Context;
}

export interface IGetUserPermissionsInput {
  user: IUser | string;
  tenants?: string[];
  resource?: string[];
  resource_type?: string[];
}

/**
 * Respresents a user that is attempting to do an action on a protected resource.
 * Passed as part of the input to the permit.check() function.
 */
export interface IUser {
  /**
   * The user key, which is the customer-side ID of the user.
   */
  key: string;
  /**
   * The first name of the user (optional).
   */
  firstName?: string;
  /**
   * The last name of the user (optional).
   */
  lastName?: string;
  /**
   * The email address of the user (optional).
   */
  email?: string;
  /**
   * Custom attributes associated with the user, which can be used in ABAC (Attribute-Based Access Control).
   */
  attributes?: Dict;
}

/**
 * Respresents an action the user is attempting to do on a protected resource.
 * Passed as part of the input to the permit.check() function.
 */
export type IAction = string;

/**
 * Respresents a protected resource passed to the permit.check() function.
 * The permit.check() function will check if the user is authorized to access
 * the resource described by this interface, according to the specified check parameters.
 */
export interface IResource {
  /**
   * The resource type, represents a namespace of resources.
   * For example, all `task` resources are objects under the `task` namespace.
   */
  type: string;
  /**
   * The key of the resource instance, which is the customer-side ID of the resource.
   * Can be used by relationship-based access control policies or by attribute-based
   * access control policies. If no key is provided (i.e: undefined), the authorization
   * query is: Can the user perform the action on *any* resource of this type?
   * (i.e., all resources in this resource namespace)
   */
  key?: string;
  /**
   * The tenant under which the resource is defined.
   * The permissions service is multi-tenant by default, so a resource must be associated with a tenant.
   */
  tenant?: string;
  /**
   * Extra attributes associated with the resource.
   * This is particularly relevant if the policy is ABAC (Attribute-Based Access Control).
   */
  attributes?: Dict;
}

/** An object to filter, with request context that overrides the shared call context. */
export interface IFilterObject extends IResource {
  context?: Context;
}

/** Filters one page of role assignments cached by a compatible container PDP. */
export interface ILocalRoleAssignmentsQuery {
  /** User key; omission leaves users unfiltered. */
  user?: string;
  /** Role key; omission leaves roles unfiltered. */
  role?: string;
  /** Tenant key; omission does not select the configured default tenant. */
  tenant?: string;
  /** Resource type key. */
  resource?: string;
  /** Resource type:key identifier, forwarded unchanged. */
  resourceInstance?: string;
  /** Positive safe integer; defaults to 1. */
  page?: number;
  /** Page size from 1 through 100; defaults to 30. */
  perPage?: number;
}

/** A local PDP assignment with keys, distinct from a control-plane assignment with IDs. */
export interface ILocalRoleAssignment {
  user: string;
  role: string;
  tenant: string;
  /** Resource type:key identifier; absence and explicit null are preserved. */
  resource_instance?: string | null;
  [id: string]: unknown;
}

/** A role assignment explaining a user's access to a resource. */
export interface IAuthorizedUserAssignment {
  user: string;
  tenant: string;
  resource: string;
  role: string;
  [id: string]: unknown;
}

/** The complete authorized-user result, including arbitrary user-key dictionary entries. */
export interface IAuthorizedUsersResult {
  resource: string;
  tenant: string;
  users: Record<string, IAuthorizedUserAssignment[]>;
  [id: string]: unknown;
}

/**
 * Represents the bulk decision made by a policy.
 */
export interface BulkPolicyDecision {
  /**
   * Specifies whether the actions are allowed or not.
   */
  allow: Array<PolicyDecision>;
}

/**
 * Represents the decision made by a policy.
 */
export interface PolicyDecision {
  /**
   * Specifies whether the action is allowed or not.
   */
  allow: boolean;
}

/**
 * Represents the result of a policy decision made by OPA (Open Policy Agent).
 */
export interface BulkOpaDecisionResult {
  /**
   * The policy decision result.
   */
  result: BulkPolicyDecision;
}

/**
 * Represents the result of a policy decision made by OPA (Open Policy Agent).
 */
export interface OpaDecisionResult {
  /**
   * The policy decision result.
   */
  result: PolicyDecision;
}

export interface TenantDetails {
  key: string;
  attributes: {
    [id: string]: any;
  };
}

export interface AllTenantsCheckResponse {
  allow: true;
  tenant: TenantDetails;
}

export interface AllTenantsResponse {
  allowed_tenants: AllTenantsCheckResponse[];
}

interface TenantPermissions {
  permissions: string[];
  roles?: string[];
  tenant?: {
    key: string;
    attributes: {
      [id: string]: any;
    };
  };
}

interface ResourcePermissions {
  permissions: string[];
  roles?: string[];
  resource?: {
    type: string;
    key: string;
    attributes: {
      [id: string]: any;
    };
  };
}

export interface IUserPermissions {
  [id: string]: ResourcePermissions | TenantPermissions;
}
export interface GetUserPermissionsResult {
  permissions: IUserPermissions;
}

export interface OpaGetUserPermissionsResult {
  result: GetUserPermissionsResult;
}
