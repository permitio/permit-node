"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformResourceContext = exports.isAllowed = exports.updatePolicyData = exports.assignRole = exports.getOrgsForUser = exports.addUserToOrg = exports.deleteOrg = exports.syncOrg = exports.syncUser = exports.action = exports.resource = exports.init = void 0;
const registry_1 = require("./registry");
const client_1 = require("./client");
const enforcer_1 = require("./enforcer");
const constants_1 = require("./constants");
const init = (config) => {
    console.log(`authorizon.init(), sidecarUrl: ${constants_1.sidecarUrl}`);
    client_1.authorizationClient.initialize(config);
};
exports.init = init;
const resource = (config) => {
    const resource = new registry_1.ResourceDefinition(config.name, config.type, config.path, config.description, config.actions || [], config.attributes || {});
    return client_1.authorizationClient.addResource(resource);
};
exports.resource = resource;
const action = (config) => {
    return new registry_1.ActionDefinition(config.name, config.title, config.description, config.path, config.attributes || {});
};
exports.action = action;
exports.syncUser = client_1.authorizationClient.syncUser;
exports.syncOrg = client_1.authorizationClient.syncOrg;
exports.deleteOrg = client_1.authorizationClient.deleteOrg;
exports.addUserToOrg = client_1.authorizationClient.addUserToOrg;
exports.getOrgsForUser = client_1.authorizationClient.getOrgsForUser;
exports.assignRole = client_1.authorizationClient.assignRole;
exports.updatePolicyData = client_1.authorizationClient.updatePolicyData;
exports.isAllowed = enforcer_1.enforcer.isAllowed;
exports.transformResourceContext = enforcer_1.enforcer.addTransform;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEseUNBQWtFO0FBQ2xFLHFDQUErRTtBQUMvRSx5Q0FBc0M7QUFDdEMsMkNBQXlDO0FBbUJsQyxNQUFNLElBQUksR0FBRyxDQUNsQixNQUF3QixFQUNsQixFQUFFO0lBQ1IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0Msc0JBQVUsRUFBRSxDQUFDLENBQUM7SUFDNUQsNEJBQW1CLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3pDLENBQUMsQ0FBQTtBQUxZLFFBQUEsSUFBSSxRQUtoQjtBQUVNLE1BQU0sUUFBUSxHQUFHLENBQUMsTUFBc0IsRUFBZ0IsRUFBRTtJQUMvRCxNQUFNLFFBQVEsR0FBRyxJQUFJLDZCQUFrQixDQUNyQyxNQUFNLENBQUMsSUFBSSxFQUNYLE1BQU0sQ0FBQyxJQUFJLEVBQ1gsTUFBTSxDQUFDLElBQUksRUFDWCxNQUFNLENBQUMsV0FBVyxFQUNsQixNQUFNLENBQUMsT0FBTyxJQUFJLEVBQUUsRUFDcEIsTUFBTSxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQ3hCLENBQUM7SUFDRixPQUFPLDRCQUFtQixDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUNuRCxDQUFDLENBQUE7QUFWWSxRQUFBLFFBQVEsWUFVcEI7QUFFTSxNQUFNLE1BQU0sR0FBRyxDQUFDLE1BQW9CLEVBQW9CLEVBQUU7SUFDL0QsT0FBTyxJQUFJLDJCQUFnQixDQUN6QixNQUFNLENBQUMsSUFBSSxFQUNYLE1BQU0sQ0FBQyxLQUFLLEVBQ1osTUFBTSxDQUFDLFdBQVcsRUFDbEIsTUFBTSxDQUFDLElBQUksRUFDWCxNQUFNLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FDeEIsQ0FBQztBQUNKLENBQUMsQ0FBQTtBQVJZLFFBQUEsTUFBTSxVQVFsQjtBQUVZLFFBQUEsUUFBUSxHQUFHLDRCQUFtQixDQUFDLFFBQVEsQ0FBQztBQUN4QyxRQUFBLE9BQU8sR0FBRyw0QkFBbUIsQ0FBQyxPQUFPLENBQUM7QUFDdEMsUUFBQSxTQUFTLEdBQUcsNEJBQW1CLENBQUMsU0FBUyxDQUFDO0FBQzFDLFFBQUEsWUFBWSxHQUFHLDRCQUFtQixDQUFDLFlBQVksQ0FBQztBQUNoRCxRQUFBLGNBQWMsR0FBRyw0QkFBbUIsQ0FBQyxjQUFjLENBQUM7QUFDcEQsUUFBQSxVQUFVLEdBQUcsNEJBQW1CLENBQUMsVUFBVSxDQUFDO0FBQzVDLFFBQUEsZ0JBQWdCLEdBQUcsNEJBQW1CLENBQUMsZ0JBQWdCLENBQUM7QUFFeEQsUUFBQSxTQUFTLEdBQUcsbUJBQVEsQ0FBQyxTQUFTLENBQUM7QUFDL0IsUUFBQSx3QkFBd0IsR0FBRyxtQkFBUSxDQUFDLFlBQVksQ0FBQyJ9