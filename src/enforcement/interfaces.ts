import { Dict } from '../utils/dict';

// user interfaces ------------------------------------------------------------
export interface IUser {
  key: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  attributes?: Dict;
}

// action interfaces ----------------------------------------------------------
export type IAction = string;

// resource interfaces --------------------------------------------------------
export interface IResource {
  // the type of the resource respresents a namespace of resources
  // i.e: all "task" resources are objects under the "task" namespace
  type: string;
  // if no id is used (i.e: undefined), the question asked is:
  // can the user perform the action on *all* the resources of
  // this type? (i.e: all resources in this resource namespace)
  id?: string;
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
