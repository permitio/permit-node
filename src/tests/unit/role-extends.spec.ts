import { expect, test } from 'vitest';

import { Permit } from '../../index';

type RoleCreate = Parameters<Permit['api']['roles']['create']>[0];
type RoleRead = Awaited<ReturnType<Permit['api']['roles']['get']>>;
type RoleUpdate = Parameters<Permit['api']['roles']['update']>[1];
type ResourceRoleCreate = Parameters<Permit['api']['resourceRoles']['create']>[1];
type ResourceRoleRead = Awaited<ReturnType<Permit['api']['resourceRoles']['get']>>;
type ResourceRoleUpdate = Parameters<Permit['api']['resourceRoles']['update']>[2];

type IsExact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type Assert<T extends true> = T;
type Inheritance = { extends?: Array<string> };

// lint:types checks these contracts. Pick preserves the optional modifier, and exact
// equality rejects any, null, non-array values, and a required property (even with undefined).
export type RoleInheritanceContracts = [
  Assert<IsExact<Pick<RoleCreate, 'extends'>, Inheritance>>,
  Assert<IsExact<Pick<RoleRead, 'extends'>, Inheritance>>,
  Assert<IsExact<Pick<RoleUpdate, 'extends'>, Inheritance>>,
  Assert<IsExact<Pick<ResourceRoleCreate, 'extends'>, Inheritance>>,
  Assert<IsExact<Pick<ResourceRoleRead, 'extends'>, Inheritance>>,
  Assert<IsExact<Pick<ResourceRoleUpdate, 'extends'>, Inheritance>>,
];

function createClient(inheritance: Inheritance) {
  const permit = new Permit({
    token: 'test',
    apiUrl: 'https://api.permit.io',
    log: { level: 'silent' },
  });
  const requests: Array<{ method: string | undefined; url: string | undefined; body: unknown }> =
    [];
  const role: ResourceRoleRead = {
    key: 'editor',
    name: 'Editor',
    id: 'role-id',
    organization_id: 'org',
    project_id: 'proj',
    environment_id: 'env',
    resource_id: 'resource-id',
    resource: 'doc',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...inheritance,
  };
  permit.config.axiosInstance.defaults.adapter = async (config) => {
    const isScopeRequest = config.url === 'https://api.permit.io/v2/api-key/scope';
    if (!isScopeRequest) {
      requests.push({
        method: config.method,
        url: config.url,
        body: config.data === undefined ? undefined : JSON.parse(config.data),
      });
    }
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: isScopeRequest
        ? { organization_id: 'org', project_id: 'proj', environment_id: 'env' }
        : { ...role },
    };
  };
  return { permit, requests };
}

const cases: Array<{ name: string; inheritance: Inheritance }> = [
  { name: 'multiple inherited roles', inheritance: { extends: ['viewer', 'auditor'] } },
  { name: 'empty inheritance', inheritance: { extends: [] } },
  { name: 'omitted inheritance', inheritance: {} },
];

for (const { name, inheritance } of cases) {
  test(`roles create/update/get preserve ${name}`, async () => {
    const { permit, requests } = createClient(inheritance);
    const created = await permit.api.roles.create({
      key: 'editor',
      name: 'Editor',
      ...inheritance,
    });
    const updated = await permit.api.roles.update('editor', { ...inheritance });
    const fetched = await permit.api.roles.get('editor');

    expect(created.extends).toStrictEqual(inheritance.extends);
    expect(updated.extends).toStrictEqual(inheritance.extends);
    expect(fetched.extends).toStrictEqual(inheritance.extends);
    expect(requests).toStrictEqual([
      {
        method: 'post',
        url: 'https://api.permit.io/v2/schema/proj/env/roles',
        body: { key: 'editor', name: 'Editor', ...inheritance },
      },
      {
        method: 'patch',
        url: 'https://api.permit.io/v2/schema/proj/env/roles/editor',
        body: { ...inheritance },
      },
      {
        method: 'get',
        url: 'https://api.permit.io/v2/schema/proj/env/roles/editor',
        body: undefined,
      },
    ]);
  });

  test(`resource roles create/update/get preserve ${name}`, async () => {
    const { permit, requests } = createClient(inheritance);
    const created = await permit.api.resourceRoles.create('doc', {
      key: 'editor',
      name: 'Editor',
      ...inheritance,
    });
    const updated = await permit.api.resourceRoles.update('doc', 'editor', { ...inheritance });
    const fetched = await permit.api.resourceRoles.get('doc', 'editor');

    expect(created.extends).toStrictEqual(inheritance.extends);
    expect(updated.extends).toStrictEqual(inheritance.extends);
    expect(fetched.extends).toStrictEqual(inheritance.extends);
    expect(requests).toStrictEqual([
      {
        method: 'post',
        url: 'https://api.permit.io/v2/schema/proj/env/resources/doc/roles',
        body: { key: 'editor', name: 'Editor', ...inheritance },
      },
      {
        method: 'patch',
        url: 'https://api.permit.io/v2/schema/proj/env/resources/doc/roles/editor',
        body: { ...inheritance },
      },
      {
        method: 'get',
        url: 'https://api.permit.io/v2/schema/proj/env/resources/doc/roles/editor',
        body: undefined,
      },
    ]);
  });
}
