import { Permit } from 'permitio';

const permit = new Permit({ token: 'opaque-example' });
const api = permit.api;
api.listUsers();
api.listRoles();
api.listConditionSets('userset', 1, 20);
api.listConditionSetsRules(1, 20);
api.getUser('user');
api.getTenant('tenant');
api.listTenants(1);
api.getRole('role');
api.getAssignedRoles('user', 'tenant');
api.createResource({ key: 'document', name: 'Document', actions: { read: {} } });
api.updateResource('document', { name: 'Document' });
api.deleteResource('document');
api.createUser({ key: 'user' });
api.syncUser({ key: 'user' });
api.updateUser('user', { first_name: 'Updated' });
api.deleteUser('user');
api.createTenant({ key: 'tenant', name: 'Tenant' });
api.updateTenant('tenant', { name: 'Tenant' });
api.deleteTenant('tenant');
api.createRole({ key: 'reader', name: 'Reader', permissions: ['document:read'] });
api.updateRole('reader', { name: 'Reader' });
api.deleteRole('reader');
api.assignRole({ user: 'user', role: 'reader', tenant: 'tenant' });
api.unassignRole({ user: 'user', role: 'reader', tenant: 'tenant' });
api.createConditionSet({ key: 'userset', name: 'Userset', type: 'userset', conditions: {} });
api.updateConditionSet('userset', { name: 'Userset' });
api.deleteConditionSet('userset');
api.assignConditionSetRule({
  user_set: 'userset',
  resource_set: 'resource-set',
  permission: 'document:read',
});
api.unassignConditionSetRule({
  user_set: 'userset',
  resource_set: 'resource-set',
  permission: 'document:read',
});
