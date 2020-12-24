"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resourceRegistry = exports.ResourceRegistry = exports.ResourceDefinition = exports.ActionDefinition = exports.extractPatternAndContext = void 0;
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
function extractPatternAndContext(path) {
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
exports.extractPatternAndContext = extractPatternAndContext;
class ActionDefinition {
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
exports.ActionDefinition = ActionDefinition;
class ResourceDefinition {
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
exports.ResourceDefinition = ResourceDefinition;
class ResourceRegistry {
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
exports.ResourceRegistry = ResourceRegistry;
exports.resourceRegistry = new ResourceRegistry();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcmVnaXN0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBZUEsTUFBTSxXQUFXLEdBQVcsT0FBTyxDQUFDO0FBRXBDLFNBQVMsV0FBVyxDQUFDLENBQVM7SUFDNUIsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLHdCQUF3QixFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQ3JELENBQUM7QUFFRCxzRkFBc0Y7QUFDdEYsU0FBUyxPQUFPLENBQUMsSUFBYyxFQUFFLE1BQWdCO0lBQy9DLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxNQUFNLENBQUMsTUFBTSxFQUFFO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQTJCLEVBQUUsSUFBWSxFQUFFLEtBQWEsRUFBRSxFQUFFO1lBQzlFLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUIsT0FBTyxHQUFHLENBQUM7UUFDYixDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7S0FDUjtTQUFNO1FBQ0wsT0FBTyxTQUFTLENBQUM7S0FDbEI7QUFDSCxDQUFDO0FBRUQsU0FBZ0Isd0JBQXdCLENBQUMsSUFBWTtJQUNuRCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUU7UUFDdEIsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxrQkFBa0I7S0FDN0M7SUFFRCxNQUFNLEtBQUssR0FBYSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3hDLE1BQU0sV0FBVyxHQUFhLEVBQUUsQ0FBQztJQUVqQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBWSxFQUFFLENBQVMsRUFBRSxFQUFFO1FBQ3hDLE1BQU0sS0FBSyxHQUFXLFdBQVcsQ0FBQztRQUNsQyxJ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