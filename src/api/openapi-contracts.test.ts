import axios from 'axios';
import { expect, expectTypeOf, test } from 'vitest';

import {
  type BulkOperationsApi,
  type CallbacksInner,
  type GroupsApi,
  type OPALHttpFetcherConfig,
  type PaginatedResultRoleRead,
  type PolicyDecisionPointsApi,
  type ResourceInstanceCreate,
  type RoleAssignmentRemove,
  type RoleRead,
  type Secret,
  type ResponseListRolesV2SchemaProjIdEnvIdRolesGet,
  type TenantsApi,
  RoleAssignmentsApiAxiosParamCreator,
} from '#src/openapi/index';
import {
  type RelationshipTupleCreateBulkOperation,
  type RelationshipTupleDeleteBulkOperation,
} from '#src/api/relationship-tuples';
import { Permit } from '#src/index';
import { createMockPermit } from '#src/tests/helpers/mock-api';

test('preserves reviewed unions, tuples, required tenants and unspecified bulk results', () => {
  expectTypeOf<RelationshipTupleCreateBulkOperation>().toHaveProperty('operations');
  expectTypeOf<RelationshipTupleDeleteBulkOperation>().toHaveProperty('idents');
  expectTypeOf<Secret>().toEqualTypeOf<string | { [key: string]: string }>();
  expectTypeOf<CallbacksInner>().toEqualTypeOf<string | [string, OPALHttpFetcherConfig]>();
  expectTypeOf<ResponseListRolesV2SchemaProjIdEnvIdRolesGet>().toEqualTypeOf<
    RoleRead[] | PaginatedResultRoleRead
  >();
  expectTypeOf<Pick<ResourceInstanceCreate, 'tenant'>>().toEqualTypeOf<{ tenant: string }>();
  expectTypeOf<Pick<RoleAssignmentRemove, 'tenant'>>().toEqualTypeOf<{ tenant: string }>();
  expectTypeOf<
    Awaited<ReturnType<BulkOperationsApi['bulkCreateUsers']>>['data']
  >().toEqualTypeOf<object>();
  expectTypeOf<GroupsApi['createGroup']>().toBeFunction();
  expectTypeOf<TenantsApi['addUserToTenant']>().toBeFunction();
  expectTypeOf<PolicyDecisionPointsApi['refreshPdpData']>().toBeFunction();
  expectTypeOf<PolicyDecisionPointsApi['refreshEnvironmentPdpData']>().toBeFunction();
});

for (const name of [
  'conditionSets',
  'resourceInstances',
  'relationshipTuples',
  'tenants',
] as const) {
  test(`${name}.list returns arrays for both published response variants`, async () => {
    const { permit, rest } = createMockPermit();
    for (const rows of [[], [{ key: 'one' }]]) {
      for (const response of [rows, { data: rows, total_count: rows.length, page_count: 1 }]) {
        rest.resolveWith(response);
        const result = await permit.api[name].list({ page: 2, perPage: 7 });
        expect(result).toEqual(rows);
        expect(rest.last?.params).toMatchObject({ page: '2', per_page: '7' });
      }
    }
  });
}

test('serializes singleton role filters exactly once under unbracketed keys', async () => {
  const { permit, rest } = createMockPermit();
  const filters = { user: 'user/a?b+c=é', tenant: 'tenant+one&two', role: 'reader/one' };
  const response = { data: [], total_count: 0 };
  rest.resolveWith(response);
  expect(await permit.api.roleAssignments.list({ ...filters, includeTotalCount: true })).toEqual(
    response,
  );
  const url = new URL(rest.last?.url ?? 'http://missing.invalid');
  for (const [key, value] of Object.entries(filters)) {
    expect(url.searchParams.getAll(key)).toEqual([value]);
    expect(url.searchParams.has(`${key}[]`)).toBe(false);
  }
  rest.resolveWith([]);
  await permit.api.users.getAssignedRoles({ user: filters.user, tenant: filters.tenant });
  expect(rest.last?.params).toMatchObject({ user: filters.user, tenant: filters.tenant });
});

test('raw role filters repeat array keys and omit missing filters', async () => {
  const creator = RoleAssignmentsApiAxiosParamCreator();
  const request = await creator.listRoleAssignments('project', 'environment', ['a+b', 'c/d']);
  const url = new URL(request.url, 'http://localhost');
  expect(url.searchParams.getAll('user')).toEqual(['a+b', 'c/d']);
  expect(url.searchParams.has('user[]')).toBe(false);
  expect(url.searchParams.has('tenant')).toBe(false);
  expect(url.searchParams.has('role')).toBe(false);
});

test('high-level unassign methods retain their void contract despite response bodies', async () => {
  const { permit, rest } = createMockPermit();
  const assignment = { user: 'user', role: 'reader', tenant: 'tenant' };
  rest.resolveWith(assignment);
  expect(await permit.api.roleAssignments.unassign(assignment)).toBeUndefined();
  rest.resolveWith(assignment);
  expect(await permit.api.users.unassignRole(assignment)).toBeUndefined();
});

for (const proxyFactsViaPdp of [false, true]) {
  test(`configured routing overrides injected Axios baseURL with proxyFactsViaPdp=${proxyFactsViaPdp}`, async () => {
    const requests: string[] = [];
    const client = axios.create({ baseURL: 'https://custom.invalid' });
    client.defaults.adapter = async (config) => {
      const url = new URL(config.url ?? '', config.baseURL);
      requests.push(url.href);
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data:
          url.pathname === '/v2/api-key/scope'
            ? { organization_id: 'org', project_id: 'proj', environment_id: 'env' }
            : { data: [], total_count: 0 },
      };
    };
    const permit = new Permit({
      token: 'test',
      apiUrl: 'https://permit.invalid',
      pdp: 'http://localhost:7766',
      proxyFactsViaPdp,
      axiosInstance: client,
      log: { level: 'silent' },
    });
    await permit.api.users.list({ page: 1, perPage: 100 });
    expect(requests).toEqual([
      'https://permit.invalid/v2/api-key/scope',
      `${proxyFactsViaPdp ? 'http://localhost:7766' : 'https://permit.invalid'}/v2/facts/proj/env/users?page=1&per_page=100`,
    ]);
  });
}
