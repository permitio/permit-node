import { ResourceAction } from './resource-action';
import { ResourceAttribute } from './resource-attribute';
import { RoleUpdate } from './role';

export interface Resource extends ResourceCreate {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceCreate extends ResourceUpdate {
  key: string;
  name: string;
}

export interface ResourceUpdate {
  name?: string;
  urn?: string;
  description?: string;
  actions?: ResourceAction[];
  attributes?: ResourceAttribute;
  roles?: RoleUpdate;
  relations?: any; // TODO: define this
}
