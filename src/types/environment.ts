export interface Environment {
  id: string;
  organizationId: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  key: string;
  name: string;
  description?: string;
}
