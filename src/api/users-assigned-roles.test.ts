import { expectTypeOf } from 'vitest';

import {
  type PaginatedResultRoleAssignmentDetailedRead,
  type PaginatedResultRoleAssignmentRead,
  type RoleAssignmentDetailedRead,
  type RoleAssignmentRead,
} from '#src/api/role-assignments';
import { type ReturnIGetUserRolesType } from '#src/api/users';
import { createMockPermit } from '#src/tests/helpers/mock-api';

it('types getAssignedRoles from runtime and literal count/detail flags', () => {
  type Plain = ReturnIGetUserRolesType<{ user: string }>;
  type Counted = ReturnIGetUserRolesType<{ user: string; includeTotalCount: true }>;
  type Detailed = ReturnIGetUserRolesType<{ user: string; detailed: true }>;
  type Both = ReturnIGetUserRolesType<{ user: string; detailed: true; includeTotalCount: true }>;
  type RuntimeCount = ReturnIGetUserRolesType<{ user: string; includeTotalCount: boolean }>;
  type RuntimeDetail = ReturnIGetUserRolesType<{ user: string; detailed: boolean }>;
  type Optional = ReturnIGetUserRolesType<{ user: string; includeTotalCount?: boolean }>;
  expectTypeOf<Plain>().toEqualTypeOf<RoleAssignmentRead[]>();
  expectTypeOf<Counted>().toEqualTypeOf<PaginatedResultRoleAssignmentRead>();
  expectTypeOf<Detailed>().toEqualTypeOf<RoleAssignmentDetailedRead[]>();
  expectTypeOf<Both>().toEqualTypeOf<PaginatedResultRoleAssignmentDetailedRead>();
  // A runtime boolean can return either shape, so the result is the union.
  expectTypeOf<RuntimeCount>().toEqualTypeOf<
    RoleAssignmentRead[] | PaginatedResultRoleAssignmentRead
  >();
  expectTypeOf<RuntimeDetail>().toEqualTypeOf<
    RoleAssignmentRead[] | RoleAssignmentDetailedRead[]
  >();
  expectTypeOf<Optional>().toEqualTypeOf<
    RoleAssignmentRead[] | PaginatedResultRoleAssignmentRead
  >();
});

it('returns the counted page for a runtime includeTotalCount of true', async () => {
  const { permit, rest } = createMockPermit();
  const page = { data: [{ role: 'viewer' }], total_count: 1, page_count: 1 };
  rest.resolveWith(page);
  // Widened to boolean, as a flag read from configuration or a request would be.
  const includeTotalCount = true as boolean;
  const result = await permit.api.users.getAssignedRoles({ user: 'alice', includeTotalCount });
  expectTypeOf(result).toEqualTypeOf<RoleAssignmentRead[] | PaginatedResultRoleAssignmentRead>();
  expect(result).toEqual(page);
  expect(rest.last?.params).toMatchObject({ include_total_count: 'true' });
});
