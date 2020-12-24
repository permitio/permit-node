import { resourceRegistry } from './registry';
export default class Resource {
    constructor(name, path, definition, context = {}) {
        this.name = name;
        this.path = path;
        this.definition = definition;
        this.context = context;
        this.definitionPath = definition?.path || undefined;
    }
    dict() {
        return {
            type: this.name,
            path: this.definitionPath,
            instance: this.path,
            context: this.context
        };
    }
    static fromPath(path) {
        const match = resourceRegistry.getResourceByPath(path);
        if (!match) {
            return undefined;
        }
        return new Resource(match.resourceName, path, match.resourceDef, match.context);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb3VyY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcmVzb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFzQixnQkFBZ0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUVsRSxNQUFNLENBQUMsT0FBTyxPQUFPLFFBQVE7SUFHM0IsWUFDUyxJQUFZLEVBQ1osSUFBWSxFQUNaLFVBQStCLEVBQy9CLFVBQStCLEVBQUU7UUFIakMsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUNaLFNBQUksR0FBSixJQUFJLENBQVE7UUFDWixlQUFVLEdBQVYsVUFBVSxDQUFxQjtRQUMvQixZQUFPLEdBQVAsT0FBTyxDQUEwQjtRQUV4QyxJQUFJLENBQUMsY0FBYyxHQUFHLFVBQVUsRUFBRSxJQUFJLElBQUksU0FBUyxDQUFDO0lBQ3RELENBQUM7SUFFTSxJQUFJO1FBQ1QsT0FBTztZQUNMLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsY0FBYztZQUN6QixRQUFRLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDbkIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1NBQ3RCLENBQUE7SUFDSCxDQUFDO0lBRU0sTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFZO1FBQ2pDLE1BQU0sS0FBSyxHQUFHLGdCQUFnQixDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDVixPQUFPLFNBQVMsQ0FBQztTQUNsQjtRQUVELE9BQU8sSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbEYsQ0FBQztDQUNGIn0=