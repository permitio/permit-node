import { mapApp } from './appMapper/appMapper';

export class AppManager {
  resources: Record<string, any> = {};

  manage(name: string, app: any): void {
    // TODO support mixed HTTP/HTTPS server (via name merging resources mutual to http and https )
    this.resources[name] = mapApp(app);
  }
}

export const appManager = new AppManager();
