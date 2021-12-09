import { Dict } from '../utils/dict';

// user interfaces ------------------------------------------------------------
// in case we are provided a JWT token as the user:
// (1) the user key is inferred from the `sub` claim
// (2) we know how to infer certain common attributes like first name, last name and email
// (3) unknown claims will be used as attributes
// (*) TODO: we need to add JWT validation
export type JWT = string;

interface IUserKey {
  key: string;
}

interface IAssignedRole {
  role: string; // role key
  tenant: string; // tenant key
}

interface IUserProperties {
  firstName: string;
  lastName: string;
  email: string;
  roles: IAssignedRole[];
  attributes: Dict;
}

export interface IUser extends IUserKey, Partial<IUserProperties> {}

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
  // context: temporary until we refactor the resource registry
  context?: Dict;
}

export interface OpaResult {
  allow: boolean;
}
