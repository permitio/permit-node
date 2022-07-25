export interface RoleAssignment extends RoleAssignmentCreate {
  id: string;
  user: string;
  role: string;
  tenant: string;
  userId: string;
  roleId: string;
  tenantId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  createdAt: Date;
}

export interface RoleAssignmentCreate {
  role: string;
  tenant: string;
  user: string;
}

export type RoleAssignmentRemove = RoleAssignmentCreate;
