import { mapApp } from './appMapper/appMapper';

class AppManager {
  resources: Record<string, any> = {};

  manage(name: string, app: any): void {
    this.resources[name] = mapApp(app);
  }
}

const appManager = new AppManager();
