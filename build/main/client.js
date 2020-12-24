"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizationClient = exports.AuthorizationClient = exports.ResourceStub = void 0;
const axios_1 = __importDefault(require("axios")); // eslint-disable-line
const constants_1 = require("./constants");
const registry_1 = require("./registry");
class ResourceStub {
    constructor(resourceName) {
        this.resourceName = resourceName;
    }
    action(name, title, description, path, attributes = {}) {
        const action = new registry_1.ActionDefinition(name, title, description, path, attributes);
        exports.authorizationClient.addActionToResource(this.resourceName, action);
    }
}
exports.ResourceStub = ResourceStub;
class AuthorizationClient {
    constructor() {
        this.initialized = false;
        this.config = { token: "" };
        this.client = axios_1.default.create();
        this.registry = registry_1.resourceRegistry;
    }
    initialize(config) {
        this.config = config;
        this.client = axios_1.default.create({
            baseURL: `${constants_1.sidecarUrl}/`,
            headers: {
                'Authorization': `Bearer ${config.token}`
            },
        });
        this.syncResources();
        this.initialized = true;
    }
    get token() {
        this.throwIfNotInitialized();
        return this.config.token;
    }
    addResource(resource) {
        this.registry.addResource(resource);
        this.maybeSyncResource(resource);
        return new ResourceStub(resource.name);
    }
    addActionToResource(resourceName, actionDef) {
        const action = this.registry.addActionToResource(resourceName, actionDef);
        if (action) {
            this.maybeSyncAction(action);
        }
    }
    maybeSyncResource(resource) {
        if (this.initialized && !this.registry.isSynced(resource)) {
            console.log(`syncing resource: ${resource}`);
            this.client.put("sdk/resource", resource.dict())
                .then(response => {
                this.registry.markAsSynced(resource, response.data.id);
            })
                .catch(error => {
                console.error(`tried to sync resource ${resource.name}, got error: ${error}`);
            });
        }
    }
    maybeSyncAction(action) {
        let resourceId;
        if (!action.resourceId) {
            return;
        }
        resourceId = action.resourceId;
        if (this.initialized && !this.registry.isSynced(action)) {
            console.log(`syncing action: ${action}`);
            this.client.put(`sdk/resource/${resourceId}/action`, action.dict())
                .then(response => {
                this.registry.markAsSynced(action, response.data.id);
            })
                .catch(error => {
                console.error(`tried to sync action ${action.name}, got error: ${error}`);
            });
        }
    }
    syncResources() {
        // will also sync actions
        for (let resource of this.registry.resourceList) {
            this.maybeSyncResource(resource);
        }
    }
    updatePolicy() {
        this.throwIfNotInitialized();
        this.client.post("update_policy").catch(error => console.error(`tried to trigger policy update, got error: ${error}`));
    }
    updatePolicyData() {
        this.throwIfNotInitialized();
        this.client.post("update_policy_data").catch(error => console.error(`tried to trigger policy update, got error: ${error}`));
    }
    throwIfNotInitialized() {
        if (!this.initialized) {
            throw new Error("You must call authorizon.init() first!");
        }
    }
    async syncUser(userId, userData) {
        this.throwIfNotInitialized();
        const data = {
            id: userId,
            data: userData
        };
        return await this.client.put("sdk/user", data)
            .then(response => {
            return response.data;
        })
            .catch((error) => {
            console.error(`tried to sync user with id: ${userId}, got error: ${error}`);
            return error;
        });
    }
    async syncOrg(orgId, orgName) {
        this.throwIfNotInitialized();
        const data = {
            external_id: orgId,
            name: orgName,
        };
        return await this.client.post("sdk/organization", data)
            .then(response => {
            return response.data;
        })
            .catch((error) => {
            console.error(`tried to sync org with id: ${orgId}, got error: ${error}`);
            return error;
        });
    }
    async deleteOrg(orgId) {
        this.throwIfNotInitialized();
        this.client.delete(`sdk/organization/${orgId}`)
            .catch((error) => {
            console.error(`tried to delete org with id: ${orgId}, got error: ${error}`);
        });
    }
    async addUserToOrg(userId, orgId) {
        this.throwIfNotInitialized();
        const data = {
            user_id: userId,
            org_id: orgId,
        };
        return await this.client.post("sdk/add_user_to_org", data)
            .then(response => {
            return response.data;
        })
            .catch((error) => {
            console.error(`tried to assign user ${userId} to org ${orgId}, got error: ${error}`);
            return error;
        });
    }
    async getOrgsForUser(userId) {
        this.throwIfNotInitialized();
        return await this.client.get(`sdk/get_orgs_for_user/${userId}`)
            .then(response => {
            return response.data;
        })
            .catch((error) => {
            console.error(`could not get user orgs for user: ${userId}, got error: ${error}`);
            return error;
        });
    }
    async assignRole(role, userId, orgId) {
        this.throwIfNotInitialized();
        const data = {
            role: role,
            user_id: userId,
            org_id: orgId,
        };
        return await this.client.post("sdk/assign_role", data)
            .then(response => {
            return response.data;
        })
            .catch((error) => {
            console.error(`could not assign role ${role} to ${userId} in org ${orgId}, got error: ${error}`);
            return error;
        });
    }
}
exports.AuthorizationClient = AuthorizationClient;
exports.authorizationClient = new AuthorizationClient();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2NsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxrREFBNkMsQ0FBQyxzQkFBc0I7QUFDcEUsMkNBQXlDO0FBQ3pDLHlDQUFzRztBQWN0RyxNQUFhLFlBQVk7SUFDdkIsWUFBNEIsWUFBb0I7UUFBcEIsaUJBQVksR0FBWixZQUFZLENBQVE7SUFBSSxDQUFDO0lBRTlDLE1BQU0sQ0FDWCxJQUFZLEVBQ1osS0FBYyxFQUNkLFdBQW9CLEVBQ3BCLElBQWEsRUFDYixhQUFrQyxFQUFFO1FBRXBDLE1BQU0sTUFBTSxHQUFHLElBQUksMkJBQWdCLENBQ2pDLElBQUksRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxVQUFVLENBQzNDLENBQUM7UUFDRiwyQkFBbUIsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3JFLENBQUM7Q0FDRjtBQWZELG9DQWVDO0FBRUQsTUFBYSxtQkFBbUI7SUFNOUI7UUFMUSxnQkFBVyxHQUFZLEtBQUssQ0FBQztRQUU3QixXQUFNLEdBQXFCLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQ3pDLFdBQU0sR0FBa0IsZUFBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBRzdDLElBQUksQ0FBQyxRQUFRLEdBQUcsMkJBQWdCLENBQUM7SUFDbkMsQ0FBQztJQUVNLFVBQVUsQ0FBQyxNQUF3QjtRQUN4QyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsTUFBTSxHQUFHLGVBQUssQ0FBQyxNQUFNLENBQUM7WUFDekIsT0FBTyxFQUFFLEdBQUcsc0JBQVUsR0FBRztZQUN6QixPQUFPLEVBQUU7Z0JBQ1AsZUFBZSxFQUFFLFVBQVUsTUFBTSxDQUFDLEtBQUssRUFBRTthQUMxQztTQUNGLENBQUMsQ0FBQztRQUNILElBQUksQ0FB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