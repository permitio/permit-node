import { IResource, IAction } from "../enforcement/interfaces";

export interface IUrlContext {
  resource: IResource;
  action: IAction;
}
