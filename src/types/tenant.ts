export interface Tenant {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  createdAt: Date;
  updatedAt: Date;
  lastActionAt: Date;
}

export interface TenantCreate extends TenantUpdate {
  key: string;
  name: string;
}

export interface TenantUpdate {
  name?: string;
  description?: string;
  attributes?: any;
}
