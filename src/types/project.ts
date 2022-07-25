export interface Project {
  id: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  key: string;
  name: string;
  description?: string;
  settings?: any;
}
