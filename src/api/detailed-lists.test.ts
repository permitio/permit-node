import { expect, test } from 'vitest';

import { PermitContextError } from '#src/api/context';
import { type Permit } from '#src/index';
import { createMockPermit, MOCK_API_ORIGIN } from '#src/tests/helpers/mock-api';

const cases = [
  {
    name: 'relationship tuples',
    route: 'relationship_tuples',
    call: (permit: Permit) => permit.api.relationshipTuples.listDetailed(),
    filtered: (permit: Permit) =>
      permit.api.relationshipTuples.listDetailed({
        tenant: 'east / west',
        subject: 'user:alice',
        relation: 'owner',
        object: 'doc:report',
        objectType: 'doc',
        subjectType: 'user',
        page: 2,
        perPage: 3,
      }),
    query: {
      tenant: 'east / west',
      subject: 'user:alice',
      relation: 'owner',
      object: 'doc:report',
      object_type: 'doc',
      subject_type: 'user',
      page: '2',
      per_page: '3',
    },
    item: {
      subject_details: { attributes: null },
      object_details: null,
      relation_details: { key: 'owner' },
      tenant_details: { key: 'east' },
    },
  },
  {
    name: 'resource instances',
    route: 'resource_instances',
    call: (permit: Permit) => permit.api.resourceInstances.listDetailed(),
    filtered: (permit: Permit) =>
      permit.api.resourceInstances.listDetailed({
        tenant: 'east / west',
        resource: 'doc',
        search: ['report'],
        page: 2,
        perPage: 3,
      }),
    query: { tenant: 'east / west', resource: 'doc', search: 'report', page: '2', per_page: '3' },
    item: {
      relationships: [{ subject: 'user:alice', relation: 'owner', object: 'doc:report' }],
      attributes: null,
    },
  },
  {
    name: 'role assignments',
    route: 'role_assignments',
    call: (permit: Permit) => permit.api.roleAssignments.listDetailed(),
    filtered: (permit: Permit) =>
      permit.api.roleAssignments.listDetailed({
        tenant: 'east / west',
        user: 'alice',
        role: 'reader',
        resource: 'doc',
        resourceInstance: 'doc:report',
        page: 2,
        perPage: 3,
      }),
    query: {
      tenant: 'east / west',
      user: 'alice',
      role: 'reader',
      resource: 'doc',
      resource_instance: 'doc:report',
      page: '2',
      per_page: '3',
    },
    item: {
      role: { key: 'reader' },
      user: { key: 'alice', attributes: null },
      tenant: { key: 'east' },
      resource_instance: null,
    },
  },
];

for (const { name, route, call, filtered, query, item } of cases) {
  test(`${name} use the dedicated route with defaults and preserve all nested details`, async () => {
    const { permit, rest } = createMockPermit({
      project: 'project / east',
      environment: 'environment east',
    });
    const result = {
      data: [{ id: 'row-id', ...item, future_detail: null }],
      total_count: 7,
      page_count: 3,
      future_envelope: 'retained',
    };
    rest.resolveWith(result);
    expect(await call(permit)).toEqual(result);
    expect(rest.last).toMatchObject({
      method: 'GET',
      origin: MOCK_API_ORIGIN,
      path: `/v2/facts/project%20%2F%20east/environment%20east/${route}/detailed`,
      params: { page: '1', per_page: '100' },
    });
    expect(rest.last?.data).toBeUndefined();
    expect(rest.last?.headers.get('Authorization')).toBe('Bearer test-token');
    expect(rest.last?.params).not.toHaveProperty('detailed');
    expect(rest.last?.params).not.toHaveProperty('include_total_count');
  });

  test(`${name} forward every filter and preserve empty/count-only envelopes`, async () => {
    const { permit, rest } = createMockPermit();
    const result = { data: [], total_count: 7 };
    rest.resolveWith(result);
    expect(await filtered(permit)).toEqual(result);
    expect(rest.last?.params).toEqual(query);
    rest.resolveWith({ data: [], total_count: 0, page_count: 0 });
    expect(await call(permit)).toEqual({ data: [], total_count: 0, page_count: 0 });
  });

  test(`${name} stay on the control plane when facts proxying is enabled`, async () => {
    const { permit, rest } = createMockPermit({ proxyFactsViaPdp: true });
    await call(permit);
    expect(rest.last?.origin).toBe(MOCK_API_ORIGIN);
    expect(rest.last?.headers.has('X-Wait-Timeout')).toBe(false);
    expect(rest.last?.headers.has('X-Timeout-Policy')).toBe(false);
    expect(rest.last?.path).toBe(`/v2/facts/proj/env/${route}/detailed`);
  });

  test(`${name} require environment context before dispatch`, async () => {
    const { permit, rest } = createMockPermit({ contextLevel: 'project' });
    await expect(call(permit)).rejects.toBeInstanceOf(PermitContextError);
    expect(rest.requests).toHaveLength(0);
  });

  test(`${name} normalize a backend rejection instead of returning an empty page`, async () => {
    const { permit, rest } = createMockPermit();
    rest.rejectWith(404, { message: 'missing filter target' });
    await expect(filtered(permit)).rejects.toMatchObject({ name: 'PermitApiError', status: 404 });
    expect(rest.requests).toHaveLength(1);
  });
}

test('detailed resource-instance search uses repeated terms rather than a joined scalar', async () => {
  const { permit, rest } = createMockPermit({ proxyFactsViaPdp: true });
  await permit.api.resourceInstances.listDetailed({ search: ['report & annual', 'budget/east'] });
  const query = new URL(rest.last?.url ?? '', 'http://fixture.invalid').searchParams;
  expect(query.getAll('search')).toEqual(['report & annual', 'budget/east']);
});

test('detailed filters retain empty strings and explicit numeric pagination', async () => {
  const { permit, rest } = createMockPermit();
  await permit.api.relationshipTuples.listDetailed({
    tenant: '',
    subject: '',
    object: '',
    relation: '',
    objectType: '',
    subjectType: '',
    page: 0,
    perPage: 0,
  });
  expect(rest.last?.params).toEqual({
    tenant: '',
    subject: '',
    object: '',
    relation: '',
    object_type: '',
    subject_type: '',
    page: '0',
    per_page: '0',
  });
  await permit.api.resourceInstances.listDetailed({
    tenant: '',
    resource: '',
    search: [''],
    page: 0,
    perPage: 0,
  });
  expect(rest.last?.params).toEqual({
    tenant: '',
    resource: '',
    search: '',
    page: '0',
    per_page: '0',
  });
  await permit.api.roleAssignments.listDetailed({
    tenant: '',
    user: '',
    role: '',
    resource: '',
    resourceInstance: '',
    page: 0,
    perPage: 0,
  });
  expect(rest.last?.params).toEqual({
    tenant: '',
    user: '',
    role: '',
    resource: '',
    resource_instance: '',
    page: '0',
    per_page: '0',
  });
});

test('existing role list keeps each legacy flag combination and runtime response form', async () => {
  const { permit, rest } = createMockPermit();
  for (const detailed of [false, true]) {
    for (const includeTotalCount of [false, true]) {
      const row = detailed
        ? { role: { key: 'reader' }, user: { key: 'alice' }, tenant: { key: 'east' } }
        : { role: 'reader', user: 'alice', tenant: 'east' };
      const response = includeTotalCount ? { data: [row], total_count: 1, page_count: 1 } : [row];
      rest.resolveWith(response);
      expect(await permit.api.roleAssignments.list({ detailed, includeTotalCount })).toEqual(
        response,
      );
      expect(rest.last?.path).toBe('/v2/facts/proj/env/role_assignments');
      expect(rest.last?.params).toEqual({
        detailed: String(detailed),
        include_total_count: String(includeTotalCount),
        page: '1',
        per_page: '100',
      });
    }
  }
});

test('new detailed reads honor selected scope and ignore synchronization headers on cloned clients', async () => {
  const { permit, rest } = createMockPermit({
    proxyFactsViaPdp: true,
    contextLevel: 'organization',
  });
  permit.config.apiContext.setEnvironmentLevelContext(
    'org',
    'selected / project',
    'selected environment',
  );
  await permit.api.relationshipTuples.waitForSync(null, 'fail').listDetailed();
  await permit.api.resourceInstances
    .waitForSync(7, 'fail')
    .listDetailed({ search: ['annual report', 'east/budget'] });
  await permit.api.roleAssignments.waitForSync(7, 'ignore').listDetailed();
  expect(rest.requests.map((request) => request.path)).toEqual([
    '/v2/facts/selected%20%2F%20project/selected%20environment/relationship_tuples/detailed',
    '/v2/facts/selected%20%2F%20project/selected%20environment/resource_instances/detailed',
    '/v2/facts/selected%20%2F%20project/selected%20environment/role_assignments/detailed',
  ]);
  for (const request of rest.requests) {
    expect(request.origin).toBe(MOCK_API_ORIGIN);
    expect(request.headers.has('X-Wait-Timeout')).toBe(false);
    expect(request.headers.has('X-Timeout-Policy')).toBe(false);
  }
  const query = new URL(rest.requests[1]?.url ?? '', 'http://fixture.invalid').searchParams;
  expect(query.getAll('search')).toEqual(['annual report', 'east/budget']);
});
