"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforcer = exports.Enforcer = void 0;
const axios_1 = __importDefault(require("axios")); // eslint-disable-line
const constants_1 = require("./constants");
const resource_1 = __importDefault(require("./resource"));
function isDict(val) {
    return val !== undefined;
}
class Enforcer {
    constructor() {
        this.transforms = [];
        this.client = axios_1.default.create({
            baseURL: `${constants_1.sidecarUrl}/`,
        });
    }
    addTransform(transform) {
        this.transforms.push(transform);
    }
    transformContext(initialContext) {
        let context = Object.assign({}, initialContext);
        for (let transform of this.transforms) {
            context = transform(context);
        }
        return context;
    }
    translateResource(resource) {
        var _a;
        let resourceDict = {};
        if (typeof resource === 'string') {
            // we are provided a path
            resourceDict = ((_a = resource_1.default.fromPath(resource)) === null || _a === void 0 ? void 0 : _a.dict()) || {};
        }
        else if (resource instanceof resource_1.default) {
            resourceDict = resource.dict() || {};
        }
        else if (isDict(resource)) {
            resourceDict = resource;
        }
        else {
            throw new Error(`Unsupported resource type: ${typeof (resource)}`);
        }
        resourceDict['context'] = this.transformContext(resourceDict['context'] || {});
        return resourceDict;
    }
    /**
     * Usage:
     *
     * authorizon.is_allowed(user, 'get', '/tasks/23')
     * authorizon.is_allowed(user, 'get', '/tasks')
     * authorizon.is_allowed(user, 'post', '/lists/3/todos/37', context={org_id=2})
     * authorizon.is_allowed(user, 'view', task)
     *
     * @param user
     * @param action
     * @param resource
     *
     * @returns whether or not action is allowed for given user
     */
    async isAllowed(user, action, resource) {
        const resourceDict = this.translateResource(resource);
        const input = {
            user: user,
            action: action,
            resource: resourceDict,
        };
        return await this.client.post('allowed', input)
            .then((response) => {
            return response.data.result || false;
        })
            .catch((error) => {
            console.log(`Error in authorizon.isAllowed(): ${error}`);
            return false;
        });
    }
}
exports.Enforcer = Enforcer;
exports.enforcer = new Enforcer();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5mb3JjZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZW5mb3JjZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsa0RBQTZDLENBQUMsc0JBQXNCO0FBQ3BFLDJDQUF5QztBQUN6QywwREFBa0M7QUFZbEMsU0FBUyxNQUFNLENBQUMsR0FBUTtJQUN0QixPQUFRLEdBQVksS0FBSyxTQUFTLENBQUM7QUFDckMsQ0FBQztBQVVELE1BQWEsUUFBUTtJQUluQjtRQUhRLGVBQVUsR0FBdUIsRUFBRSxDQUFDO1FBSTFDLElBQUksQ0FBQyxNQUFNLEdBQUcsZUFBSyxDQUFDLE1BQU0sQ0FBQztZQUN6QixPQUFPLEVBQUUsR0FBRyxzQkFBVSxHQUFHO1NBQzFCLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTSxZQUFZLENBQUMsU0FBMkI7UUFDN0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVPLGdCQUFnQixDQUFDLGNBQXVCO1FBQzlDLElBQUksT0FBTyxxQkFBUSxjQUFjLENBQUUsQ0FBQztRQUNwQyxLQUFLLElBQUksU0FBUyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUU7WUFDckMsT0FBTyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztTQUM5QjtRQUNELE9BQU8sT0FBTyxDQUFDO0lBQ2pCLENBQUM7SUFFTyxpQkFBaUIsQ0FBQyxRQUFzQjs7UUFDOUMsSUFBSSxZQUFZLEdBQVMsRUFBRSxDQUFDO1FBRTVCLElBQUksT0FBTyxRQUFRLEtBQUssUUFBUSxFQUFFO1lBQ2hDLHlCQUF5QjtZQUN6QixZQUFZLEdBQUcsT0FBQSxrQkFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsMENBQUUsSUFBSSxPQUFNLEVBQUUsQ0FBQztTQUMxRDthQUFNLElBQUksUUFBUSxZQUFZLGtCQUFRLEVBQUU7WUFDdkMsWUFBWSxHQUFHLFFBQVEsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUM7U0FDdEM7YUFBTSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUMzQixZQUFZLEdBQUcsUUFBUSxDQUFDO1NBQ3pCO2FBQU07WUFDTCxNQUFNLElBQUksS0FBSyxDQUFDLDhCQUE4QixPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1NBQ3BFO1FBRUQsWUFBWSxDQUFDLFNBQVMsQ0FBQyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDL0UsT0FBTyxZQUFZLENBQUM7SUFDdEIsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7O09BYUc7SUFDSSxLQUFLLENBQUMsU0FBUyxDQUFDLElBQWMsRUFBRSxNQUFrQixFQUFFLFFBQXNCO1FBQy9FLE1BQU0sWUFBWSxHQUFTLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1RCxNQUFNLEtBQUssR0FBRztZQUNaLElBQUksRUFBRSxJQUFJO1lBQ1YsTUFBTSxFQUFFLE1BQU07WUFDZCxRQUFRLEVBQUUsWUFBWTtTQUN2QixDQUFDO1FBRUYsT0FBTyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFZLFNBQVMsRUFBRSxLQUFLLENBQUM7YUFDdkQsSUFBSSxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUU7WUFDakIsT0FBTyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUM7UUFDdkMsQ0FBQyxDQUFDO2FBQ0QsS0FBSyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDZixPQUFPLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO1lBQ3pELE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0Y7QUF2RUQsNEJBdUVDO0FBRVksUUFBQSxRQUFRLEdBQWEsSUFBSSxRQUFRLEVBQUUsQ0FBQyJ9