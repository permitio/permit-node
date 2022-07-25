export enum AttributeType {
  Bool = 'bool',
  Number = 'number',
  String = 'string',
  Time = 'time',
  Json = 'json',
}

export interface ResourceAttribute {
  type: AttributeType;
  description?: string;
  key: string;
  id: string;
  resourceId: string;
  resourceKey: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  createdAt: Date;
  updatedAt: Date;
}
