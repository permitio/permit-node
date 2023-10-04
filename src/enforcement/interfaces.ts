import { Context } from '../utils/context';
import { Dict } from '../utils/dict';

export interface ICheckInput {
  user: IUser;
  action: IAction;
  resource: IResource;
  context?: Context;
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

/**
 * Represents the bulk decision made by a policy.
 */
export interface BulkPolicyDecision {
  /**
   * Specifies whether the action is allowed or not.
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
