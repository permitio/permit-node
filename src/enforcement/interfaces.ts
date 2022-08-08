import { Dict } from '../utils/dict';

// user interfaces ------------------------------------------------------------
export interface IUser {
  // the customer-side id of the user (the user *key*)
  key: string;
  // the user's first name (optional)
  firstName?: string;
  // the user's first name (optional)
  lastName?: string;
  // the user's email (optional)
  email?: string;
  // custom attributes on the user, can be used in ABAC
  attributes?: Dict;
}

// action interfaces ----------------------------------------------------------
export type IAction = string;

// resource interfaces --------------------------------------------------------
export interface IResource {
  // the type of the resource respresents a namespace of resources
  // i.e: all "task" resources are objects under the "task" namespace
  type: string;
  // the customer-side id of the resource (the resource *key*)
  // if no key is used (i.e: undefined), the question asked is:
  // can the user perform the action on *all* the resources of
  // this type? (i.e: all resources in this resource namespace)
  key?: string;
  // the permissions service is multi-tenant by default,
  // so a resource must be defined under a tenant.
  tenant?: string;
  // In general, can be used to pass extra attributes on the resource,
  // this is especially relevant if the policy is ABAC (attribute-based
  // access control).
  // if using resource urls, attributes from url will be auto-populated.
  attributes?: Dict;
}

export interface PolicyDecision {
  allow: boolean;
}

export interface OpaDecisionResult {
  result: PolicyDecision;
}
