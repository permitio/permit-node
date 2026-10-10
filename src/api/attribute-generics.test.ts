import { expectTypeOf } from 'vitest';

import {
  type ICreateOrUpdateUserResult,
  type PaginatedResultResourceInstanceDetailedRead,
  type PaginatedResultUserRead,
  type PaginatedResultTenantRead,
  type ResourceInstanceDetailedRead,
  type ResourceInstanceRead,
  type TenantRead,
  type UserRead,
} from '#src/api/index';
import {
  type PaginatedResultResourceInstanceDetailedRead as GeneratedDetailedPage,
  type PaginatedResultUserRead as GeneratedUserPage,
  type PaginatedResultTenantRead as GeneratedTenantPage,
  type ResourceInstanceDetailedRead as GeneratedDetailed,
  type ResourceInstanceRead as GeneratedInstance,
  type TenantRead as GeneratedTenant,
  type UserRead as GeneratedUser,
} from '#src/openapi/index';
import { createMockPermit, MOCK_API_ORIGIN } from '#src/tests/helpers/mock-api';

type DefaultDetailedPage = PaginatedResultResourceInstanceDetailedRead;

interface Attributes {
  readonly category: 'research';
  note: string | null;
  score?: number;
}

it('default read models remain bidirectionally compatible with generated contracts', () => {
  expectTypeOf<UserRead>().toEqualTypeOf<GeneratedUser>();
  expectTypeOf<TenantRead>().toEqualTypeOf<GeneratedTenant>();
  expectTypeOf<ResourceInstanceRead>().toEqualTypeOf<GeneratedInstance>();
  expectTypeOf<ResourceInstanceDetailedRead>().toEqualTypeOf<GeneratedDetailed>();
  expectTypeOf<PaginatedResultUserRead>().toEqualTypeOf<GeneratedUserPage>();
  expectTypeOf<PaginatedResultTenantRead>().toEqualTypeOf<GeneratedTenantPage>();
  expectTypeOf<DefaultDetailedPage>().toEqualTypeOf<GeneratedDetailedPage>();
  expectTypeOf<ICreateOrUpdateUserResult>().toEqualTypeOf<{
    user: GeneratedUser;
    created: boolean;
  }>();
  expectTypeOf<UserRead<Attributes>['attributes']>().toEqualTypeOf<Attributes | undefined>();
  expectTypeOf<TenantRead<Attributes>['attributes']>().toEqualTypeOf<Attributes | undefined>();
  expectTypeOf<ResourceInstanceRead<Attributes>['attributes']>().toEqualTypeOf<
    Attributes | undefined
  >();
  expectTypeOf<ResourceInstanceDetailedRead<Attributes>['attributes']>().toEqualTypeOf<
    Attributes | undefined
  >();
  expectTypeOf<PaginatedResultUserRead<Attributes>['data'][number]['attributes']>().toEqualTypeOf<
    Attributes | undefined
  >();
  expectTypeOf<
    PaginatedResultResourceInstanceDetailedRead<Attributes>['data'][number]['attributes']
  >().toEqualTypeOf<Attributes | undefined>();
  expectTypeOf<PaginatedResultTenantRead<Attributes>['data'][number]['attributes']>().toEqualTypeOf<
    Attributes | undefined
  >();
  expectTypeOf<ICreateOrUpdateUserResult<Attributes>['user']['attributes']>().toEqualTypeOf<
    Attributes | undefined
  >();
});

it('typed read selection preserves omitted attributes and additive server data', async () => {
  const { permit, rest } = createMockPermit();
  const attributes = { category: 'research', note: null, score: 0, server_extra: ['retained'] };
  const user = { key: 'alice', attributes, associated_tenants: [], additive: { kept: true } };
  const tenant = { key: 'east', name: 'East', attributes };
  const instance = { key: 'report', resource: 'document', tenant: 'east', attributes };
  for (const [response, request] of [
    [user, () => permit.api.users.get<Attributes>('alice')],
    [tenant, () => permit.api.tenants.get<Attributes>('east')],
    [instance, () => permit.api.resourceInstances.get<Attributes>('document:report')],
  ] as const) {
    rest.resolveWith(response);
    expect(await request()).toEqual(response);
  }
  const omitted = { key: 'alice' };
  rest.resolveWith(omitted);
  expect(await permit.api.users.get<Attributes>('alice')).toEqual(omitted);
  expect(rest.requests).toHaveLength(4);
});

it('typed sync and membership retain user attributes, envelopes and write payloads', async () => {
  const { permit, rest } = createMockPermit({ proxyFactsViaPdp: true });
  const attributes: Attributes = { category: 'research', note: null };
  const payload = Object.freeze({ key: 'alice', attributes });
  const user = { ...payload, id: 'user-id' };
  const page = { data: [user], total_count: 13, page_count: 1, additive: ['retained'] };
  for (const [status, created] of [
    [201, true],
    [200, false],
  ] as const) {
    rest.resolveWith(user, status);
    expect(await permit.api.users.sync<Attributes>(payload)).toEqual({ user, created });
    expect(rest.last?.method).toBe('PUT');
    expect(rest.last?.data).toEqual(payload);
  }
  rest.resolveWith(user, 201);
  expect(await permit.api.tenants.addUser<Attributes>('east', payload)).toEqual(user);
  expect(rest.last?.origin).toBe(MOCK_API_ORIGIN);
  expect(rest.last?.path).toBe('/v2/facts/proj/env/tenants/east/users');
  expect(rest.last?.data).toEqual(payload);
  rest.resolveWith(page);
  expect(await permit.api.tenants.listTenantUsers<Attributes>({ tenantKey: 'east' })).toEqual(page);
  rest.resolveWith(page);
  expect(await permit.api.users.list<Attributes>({ includeResourceInstanceRoles: true })).toEqual(
    page,
  );
  expect(payload).toEqual({ key: 'alice', attributes });
  expect(rest.requests).toHaveLength(5);
});

it('typed detailed instances retain relationships, counts and extra fields', async () => {
  const { permit, rest } = createMockPermit({ proxyFactsViaPdp: true });
  const instance = {
    key: 'report',
    resource: 'document',
    tenant: 'east',
    attributes: { category: 'research', note: null },
    relationships: [{ subject: 'folder:archive', relation: 'parent' }],
  };
  const page = { data: [instance], total_count: 11, page_count: 1, additive: { kept: true } };
  rest.resolveWith(page);
  const result = await permit.api.resourceInstances.listDetailed<Attributes>({ tenant: 'east' });
  expect(result).toEqual(page);
  expect(rest.last?.origin).toBe(MOCK_API_ORIGIN);
  expect(rest.last?.path).toBe('/v2/facts/proj/env/resource_instances/detailed');
  expect(rest.last?.params).toEqual({ tenant: 'east', page: '1', per_page: '100' });
  expect(rest.requests).toHaveLength(1);
});

it('attribute selection leaves the public HTTP failure policy unchanged', async () => {
  const { permit, rest } = createMockPermit();
  const requests = [
    () => permit.api.users.get<Attributes>('alice'),
    () => permit.api.tenants.addUser<Attributes>('east', { key: 'alice' }),
    () => permit.api.resourceInstances.listDetailed<Attributes>(),
  ];
  for (const request of requests) {
    rest.rejectWith(422, { detail: 'invalid input' });
    await expect(request()).rejects.toMatchObject({ name: 'PermitApiError', status: 422 });
  }
  expect(rest.requests).toHaveLength(3);
});
