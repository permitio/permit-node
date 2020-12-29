import _ from 'lodash';

import { mapApp } from './appMapper/appMapper';
import { resource as saveResource } from './commands';

export class AppManager {
  resources: Record<string, any> = {};

  manage(name: string, app: any): void {
    // TODO support mixed HTTP/HTTPS server (via name merging resources mutual to http and https )
    const resources = mapApp(app);
    this.resources[name] = resources;
    _.forEach(resources, (resource) => saveResource(resource));
  }
}

export const appManager = new AppManager();
