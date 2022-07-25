export interface OrgMember {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  givenName: string;
  familyName: string;
  picture?: string;
  isSuperuser: boolean;
  isOnboarding: boolean;
  createdAt: Date;
  lastLogin?: Date;
  lastIp?: string;
  loginsCount?: number;
  identities: Array<Identity>;
  settings: any;
}

export interface Identity {
  userId: string;
  provider: string;
  sub: string;
  email: string;
  emailVerified: boolean;
  auth0Info: any;
}
