export interface ResourceAction extends ResourceActionCreate {
  id: string;
  permissionName: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceActionCreate extends ResourceActionUpdate {
  key: string;
  name: string;
}

export interface ResourceActionUpdate {
  name?: string;
  description?: string;
}
