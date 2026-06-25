import test from 'ava';

import {
  ResourceRoleCreate,
  ResourceRoleRead,
  ResourceRoleUpdate,
  RoleCreate,
  RoleRead,
  RoleUpdate,
} from '../../openapi/types';

// Compile-time guard for the `extends` role-inheritance field on the six generated role types.
// Removing `extends?: Array<string>` from any of them makes this file fail to compile under
// `yarn build` (build:types -> tsc): TS2322 on the create/update object literals (excess property)
// and TS2339 on the read member access. The runtime assertions below exist only so the test:unit
// ava glob exercises the file; the substantive check is that it type-checks.
const roleCreate: RoleCreate = { key: 'editor', name: 'Editor', extends: ['viewer'] };
const roleUpdate: RoleUpdate = { extends: ['viewer'] };
const roleReadExtends: Array<string> | undefined = ({} as RoleRead).extends;

const resourceRoleCreate: ResourceRoleCreate = {
  key: 'editor',
  name: 'Editor',
  extends: ['viewer'],
};
const resourceRoleUpdate: ResourceRoleUpdate = { extends: ['viewer'] };
const resourceRoleReadExtends: Array<string> | undefined = ({} as ResourceRoleRead).extends;

test('Role and ResourceRole types expose the `extends` inheritance field', (t) => {
  t.deepEqual(roleCreate.extends, ['viewer']);
  t.deepEqual(roleUpdate.extends, ['viewer']);
  t.is(roleReadExtends, undefined);
  t.deepEqual(resourceRoleCreate.extends, ['viewer']);
  t.deepEqual(resourceRoleUpdate.extends, ['viewer']);
  t.is(resourceRoleReadExtends, undefined);
});
