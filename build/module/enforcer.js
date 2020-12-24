import axios from 'axios'; // eslint-disable-line
import { sidecarUrl } from './constants';
import Resource from './resource';
function isDict(val) {
    return val !== undefined;
}
export class Enforcer {
    constructor() {
        this.transforms = [];
        this.client = axios.create({
            baseURL: `${sidecarUrl}/`,
        });
    }
    addTransform(transform) {
        this.transforms.push(transform);
    }
    transformContext(initialContext) {
        let context = { ...initialContext };
        for (let transform of this.transforms) {
            context = transform(context);
        }
        return context;
    }
    translateResource(resource) {
        let resourceDict = {};
        if (typeof resource === 'string') {
            // we are provided a path
            resourceDict = Resource.fromPath(resource)?.dict() || {};
        }
        else if (resource instanceof Resource) {
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
export const enforcer = new Enforcer();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5mb3JjZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZW5mb3JjZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUF3QixNQUFNLE9BQU8sQ0FBQyxDQUFDLHNCQUFzQjtBQUNwRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQ3pDLE9BQU8sUUFBUSxNQUFNLFlBQVksQ0FBQztBQVlsQyxTQUFTLE1BQU0sQ0FBQyxHQUFRO0lBQ3RCLE9BQVEsR0FBWSxLQUFLLFNBQVMsQ0FBQztBQUNyQyxDQUFDO0FBVUQsTUFBTSxPQUFPLFFBQVE7SUFJbkI7UUFIUSxlQUFVLEdBQXVCLEVBQUUsQ0FBQztRQUkxQyxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7WUFDekIsT0FBTyxFQUFFLEdBQUcsVUFBVSxHQUFHO1NBQzFCLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTSxZQUFZLENBQUMsU0FBMkI7UUFDN0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVPLGdCQUFnQixDQUFDLGNBQXVCO1FBQzlDLElBQUksT0FBTyxHQUFHLEVBQUUsR0FBRyxjQUFjLEVBQUUsQ0FBQztRQUNwQyxLQUFLLElBQUksU0FBUyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUU7WUFDckMsT0FBTyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztTQUM5QjtRQUNELE9BQU8sT0FBTyxDQUFDO0lBQ2pCLENBQUM7SUFFTyxpQkFBaUIsQ0FBQyxRQUFzQjtRQUM5QyxJQUFJLFlBQVksR0FBUyxFQUFFLENBQUM7UUFFNUIsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLEVBQUU7WUFDaEMseUJBQXlCO1lBQ3pCLFlBQVksR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQztTQUMxRDthQUFNLElBQUksUUFBUSxZQUFZLFFBQVEsRUFBRTtZQUN2QyxZQUFZLEdBQUcsUUFBUSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQztTQUN0QzthQUFNLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQzNCLFlBQVksR0FBRyxRQUFRLENBQUM7U0FDekI7YUFBTTtZQUNMLE1BQU0sSUFBSSxLQUFLLENBQUMsOEJBQThCLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDcEU7UUFFRCxZQUFZLENBQUMsU0FBUyxDQUFDLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUMvRSxPQUFPLFlBQVksQ0FBQztJQUN0QixDQUFDO0lBRUQ7Ozs7Ozs7Ozs7Ozs7T0FhRztJQUNJLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBYyxFQUFFLE1BQWtCLEVBQUUsUUFBc0I7UUFDL0UsTUFBTSxZQUFZLEdBQVMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVELE1BQU0sS0FBSyxHQUFHO1lBQ1osSUFBSSxFQUFFLElBQUk7WUFDVixNQUFNLEVBQUUsTUFBTTtZQUNkLFFBQVEsRUFBRSxZQUFZO1NBQ3ZCLENBQUM7UUFFRixPQUFPLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQVksU0FBUyxFQUFFLEtBQUssQ0FBQzthQUN2RCxJQUFJLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRTtZQUNqQixPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQztRQUN2QyxDQUFDLENBQUM7YUFDRCxLQUFLLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUNmLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDekQsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FDRjtBQUVELE1BQU0sQ0FBQyxNQUFNLFFBQVEsR0FBYSxJQUFJLFFBQVEsRUFBRSxDQUFDIn0=