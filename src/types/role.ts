export interface Role extends RoleCreate {
  name: string;
  description?: string;
  permissions?: Array<string>;
  _extends?: Array<string>;
  key: string;
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleCreate extends RoleUpdate {
  key: string;
  name: string;
}

export interface RoleUpdate {
  name?: string;
  description?: string;
  permissions?: Array<string>;
  _extends?: Array<string>;
}
