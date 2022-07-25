import { UserRole } from './user-role';

export interface User extends UserCreate {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
  roles: Array<UserRole>;
}

export interface UserCreate extends UserUpdate {
  key: string;
}

export interface UserUpdate {
  email?: string;
  firstName?: string;
  lastName?: string;
  attributes?: any;
}
