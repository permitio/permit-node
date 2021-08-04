import _ from 'lodash';

import { mapApp } from './appMapper/appMapper';
import { MappedEndpoint } from './appMapper/types';
import {
  ResourceConfig
  // , resource as saveResource
} from '../resources/interfaces';
import { prettyConsoleLog } from '../logger';
import { IAuthorizonConfig } from '../config';
import { ResourceReporter } from '../resources/reporter';

export class AppManager {
  resources: Record<string, any> = {};

  constructor(private config: IAuthorizonConfig, private resourceReporter: ResourceReporter) {
  }

  report(
    name: string,
    resources: ResourceConfig[],
    endpoints: MappedEndpoint[]
  ) {
    const SEPARATOR_LINE = '*************************************************';
    console.log(`<Authorizon Documenting App - ${name}>`);
    console.log(SEPARATOR_LINE);
    prettyConsoleLog('endpoints', endpoints);
    console.log(SEPARATOR_LINE);
    prettyConsoleLog('resources', resources);
    console.log(SEPARATOR_LINE);
  }

  manage(name: string, app: any): void {
    // TODO support mixed HTTP/HTTPS server (via name merging resources mutual to http and https )
    // If we have auto-mapping - map the app given to us and save its resources
    if (this.config.autoMapping.enable) {
      const { resources, endpoints } = mapApp(app, this.config.autoMapping.ignoredUrlPrefixes);
      if (this.config.autoMapping.reviewMode) {
        this.report(name, resources, endpoints);
      } else {
        this.resources[name] = resources;
        _.forEach(resources, (resource) => this.resourceReporter.resource(resource));
      }
    }
  }
}