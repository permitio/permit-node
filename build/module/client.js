import axios from 'axios'; // eslint-disable-line
import { sidecarUrl } from './constants';
import { resourceRegistry, ActionDefinition } from './registry';
export class ResourceStub {
    constructor(resourceName) {
        this.resourceName = resourceName;
    }
    action(name, title, description, path, attributes = {}) {
        const action = new ActionDefinition(name, title, description, path, attributes);
        authorizationClient.addActionToResource(this.resourceName, action);
    }
}
export class AuthorizationClient {
    constructor() {
        this.initialized = false;
        this.config = { token: "" };
        this.client = axios.create();
        this.registry = resourceRegistry;
    }
    initialize(config) {
        this.config = config;
        this.client = axios.create({
            baseURL: `${sidecarUrl}/`,
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
export const authorizationClient = new AuthorizationClient();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2NsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQXdCLE1BQU0sT0FBTyxDQUFDLENBQUMsc0JBQXNCO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDekMsT0FBTyxFQUFFLGdCQUFnQixFQUFzQixnQkFBZ0IsRUFBb0IsTUFBTSxZQUFZLENBQUM7QUFjdEcsTUFBTSxPQUFPLFlBQVk7SUFDdkIsWUFBNEIsWUFBb0I7UUFBcEIsaUJBQVksR0FBWixZQUFZLENBQVE7SUFBSSxDQUFDO0lBRTlDLE1BQU0sQ0FDWCxJQUFZLEVBQ1osS0FBYyxFQUNkLFdBQW9CLEVBQ3BCLElBQWEsRUFDYixhQUFrQyxFQUFFO1FBRXBDLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLENBQ2pDLElBQUksRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxVQUFVLENBQzNDLENBQUM7UUFDRixtQkFBbUIsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3JFLENBQUM7Q0FDRjtBQUVELE1BQU0sT0FBTyxtQkFBbUI7SUFNOUI7UUFMUSxnQkFBVyxHQUFZLEtBQUssQ0FBQztRQUU3QixXQUFNLEdBQXFCLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQ3pDLFdBQU0sR0FBa0IsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBRzdDLElBQUksQ0FBQyxRQUFRLEdBQUcsZ0JBQWdCLENBQUM7SUFDbkMsQ0FBQztJQUVNLFVBQVUsQ0FBQyxNQUF3QjtRQUN4QyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7WUFDekIsT0FBTyxFQUFFLEdBQUcsVUFBVSxHQUFHO1lBQ3pCLE9B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