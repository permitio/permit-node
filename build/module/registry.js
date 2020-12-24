const PLACEHOLDER = "(\w+)";
function escapeRegex(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}
// Equivalent to python dict(zip(['AB', 'CD', 'EF', 'GH'],[1, 2, 3, 4])) in javascript
function dictZip(keys, values) {
    if (keys.length === values.length) {
        return keys.reduce((acc, curr, index) => {
            acc[curr] = values[index];
            return acc;
        }, {});
    }
    else {
        return undefined;
    }
}
export function extractPatternAndContext(path) {
    if (path.endsWith("/")) {
        path = path.slice(0, -1); // remove last "/"
    }
    const parts = path.split("/");
    const contextVars = [];
    parts.forEach((part, i) => {
        const regex = /\{(\w+)\}/;
        let match;
        let partContainsVariable = false;
        while ((match = regex.exec(part)) !== null) {
            contextVars.push(match[1]);
            partContainsVariable = true;
        }
        ;
        if (partContainsVariable) {
            parts[i] = PLACEHOLDER;
        }
        else {
            parts[i] = escapeRegex(parts[i]);
        }
    });
    const pattern = new RegExp("^" + parts.join("/") + "[/]?$");
    return {
        pattern: pattern,
        contextVars: contextVars
    };
}
export class ActionDefinition {
    constructor(name, title, description, path, attributes = {}, resourceId) {
        this.name = name;
        this.title = title;
        this.description = description;
        this.path = path;
        this.attributes = attributes;
        this._resourceId = undefined;
        this._resourceName = "";
        this.resourceId = resourceId;
    }
    get resourceId() {
        return this._resourceId;
    }
    set resourceId(id) {
        this._resourceId = id;
    }
    get resourceName() {
        return this._resourceName;
    }
    set resourceName(name) {
        this._resourceName = name;
    }
    dict() {
        return {
            name: this.name,
            title: this.title,
            description: this.description,
            path: this.path,
            attributes: this.attributes,
            resourceId: this.resourceId,
        };
    }
}
export class ResourceDefinition {
    constructor(name, type, path, description, actions = [], attributes = {}) {
        this.name = name;
        this.type = type;
        this.path = path;
        this.description = description;
        this.actions = actions;
        this.attributes = attributes;
        this._remoteId = undefined;
        this.attributes = attributes;
    }
    get remoteId() {
        return this._remoteId;
    }
    set remoteId(id) {
        this._remoteId = id;
    }
    dict() {
        return {
            name: this.name,
            type: this.type,
            path: this.path,
            description: this.description,
            actions: this.actions.map(a => a.dict()),
            attributes: this.attributes,
        };
    }
}
export class ResourceRegistry {
    constructor() {
        this.resources = {};
        this.alreadySynced = new Set();
        this.processedPaths = new Set();
        this.pathRegexes = [];
    }
    get resourceList() {
        return Object.keys(this.resources).map(k => this.resources[k]);
    }
    addResource(resource) {
        if (!(resource.name in this.resources)) {
            this.resources[resource.name] = resource;
            this.processPath(resource.path, resource.name);
        }
        resource.actions.forEach(action => {
            action.resourceName = resource.name;
            if (action.path) {
                this.processPath(action.path, resource.name);
            }
        });
    }
    addActionToResource(resourceName, action) {
        if (!(resourceName in this.resources)) {
            return undefined;
        }
        const resource = this.resources[resourceName];
        action.resourceId = resource.remoteId;
        action.resourceName = resource.name;
        const existingActions = resource.actions.map(a => a.name);
        if (!(action.name in existingActions)) {
            resource.actions.push(action);
        }
        if (action.path) {
            this.processPath(action.path, resource.name);
        }
        return action;
    }
    static actionKey(action) {
        return `${action.resourceName}:${action.name}`;
    }
    processPath(path, resourceName) {
        if (path in this.processedPaths) {
            return;
        }
        const { pattern, contextVars: context } = extractPatternAndContext(path);
        this.pathRegexes.push({
            pattern: pattern,
            contextVars: context,
            resourceName: resourceName
        });
        this.processedPaths.add(path);
    }
    isSynced(obj) {
        if (obj instanceof ResourceDefinition) {
            return obj.name in this.alreadySynced;
        }
        if (obj instanceof ActionDefinition) {
            return ResourceRegistry.actionKey(obj) in this.alreadySynced;
        }
        return false;
    }
    markAsSynced(obj, remoteId) {
        if (obj instanceof ResourceDefinition) {
            this.alreadySynced.add(obj.name);
            this.resources[obj.name].remoteId = remoteId;
            obj.actions.forEach(action => {
                this.alreadySynced.add(ResourceRegistry.actionKey(action));
            });
        }
        if (obj instanceof ActionDefinition) {
            this.alreadySynced.add(ResourceRegistry.actionKey(obj));
        }
    }
    getResourceByPath(path) {
        for (let potential of this.pathRegexes) {
            const match = path.match(potential.pattern);
            if (match) {
                const resourceDef = this.resources[potential.resourceName] || undefined;
                let context = {};
                if (potential.contextVars.length == match.length) {
                    context = dictZip(potential.contextVars, match) || {};
                }
                return {
                    resourceName: potential.resourceName,
                    resourceDef: resourceDef,
                    context: context
                };
            }
        }
        return undefined;
    }
}
export const resourceRegistry = new ResourceRegistry();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcmVnaXN0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBZUEsTUFBTSxXQUFXLEdBQVcsT0FBTyxDQUFDO0FBRXBDLFNBQVMsV0FBVyxDQUFDLENBQVM7SUFDNUIsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLHdCQUF3QixFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQ3JELENBQUM7QUFFRCxzRkFBc0Y7QUFDdEYsU0FBUyxPQUFPLENBQUMsSUFBYyxFQUFFLE1BQWdCO0lBQy9DLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxNQUFNLENBQUMsTUFBTSxFQUFFO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQTJCLEVBQUUsSUFBWSxFQUFFLEtBQWEsRUFBRSxFQUFFO1lBQzlFLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUIsT0FBTyxHQUFHLENBQUM7UUFDYixDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7S0FDUjtTQUFNO1FBQ0wsT0FBTyxTQUFTLENBQUM7S0FDbEI7QUFDSCxDQUFDO0FBRUQsTUFBTSxVQUFVLHdCQUF3QixDQUFDLElBQVk7SUFDbkQsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ3RCLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsa0JBQWtCO0tBQzdDO0lBRUQsTUFBTSxLQUFLLEdBQWEsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN4QyxNQUFNLFdBQVcsR0FBYSxFQUFFLENBQUM7SUFFakMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQVksRUFBRSxDQUFTLEVBQUUsRUFBRTtRQUN4QyxNQUFNLEtBQUssR0FBVyxXQUFXLENBQUM7UUFDbEMs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