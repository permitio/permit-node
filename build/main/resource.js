"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_1 = require("./registry");
class Resource {
    constructor(name, path, definition, context = {}) {
        this.name = name;
        this.path = path;
        this.definition = definition;
        this.context = context;
        this.definitionPath = (definition === null || definition === void 0 ? void 0 : definition.path) || undefined;
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
        const match = registry_1.resourceRegistry.getResourceByPath(path);
        if (!match) {
            return undefined;
        }
        return new Resource(match.resourceName, path, match.resourceDef, match.context);
    }
}
exports.default = Resource;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb3VyY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcmVzb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSx5Q0FBa0U7QUFFbEUsTUFBcUIsUUFBUTtJQUczQixZQUNTLElBQVksRUFDWixJQUFZLEVBQ1osVUFBK0IsRUFDL0IsVUFBK0IsRUFBRTtRQUhqQyxTQUFJLEdBQUosSUFBSSxDQUFRO1FBQ1osU0FBSSxHQUFKLElBQUksQ0FBUTtRQUNaLGVBQVUsR0FBVixVQUFVLENBQXFCO1FBQy9CLFlBQU8sR0FBUCxPQUFPLENBQTBCO1FBRXhDLElBQUksQ0FBQyxjQUFjLEdBQUcsQ0FBQSxVQUFVLGFBQVYsVUFBVSx1QkFBVixVQUFVLENBQUUsSUFBSSxLQUFJLFNBQVMsQ0FBQztJQUN0RCxDQUFDO0lBRU0sSUFBSTtRQUNULE9BQU87WUFDTCxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLGNBQWM7WUFDekIsUUFBUSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ25CLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztTQUN0QixDQUFBO0lBQ0gsQ0FBQztJQUVNLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBWTtRQUNqQyxNQUFNLEtBQUssR0FBRywyQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQ1YsT0FBTyxTQUFTLENBQUM7U0FDbEI7UUFFRCxPQUFPLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2xGLENBQUM7Q0FDRjtBQTdCRCwyQkE2QkMifQ==