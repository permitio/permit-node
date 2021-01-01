export interface MappedEndpoint {
  path: string;
  methods: string[];
  middleware: any | undefined[];
  namedMethods: Record<string, string>;
  methodToCallable: Record<string, any>;
  regEx: RegExp;
  keys: string[];
}

export enum RoutesStyle {
  // True Rest
  REST = 1,
  // "Rest" where the actions are sub-paths
  RESTHOLE,
}

export type EndpointGroup = (MappedEndpoint | EndpointTree)[];

export type EndpointTree = Record<string, EndpointGroup>;
