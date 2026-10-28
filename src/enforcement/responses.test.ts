import {
  parseAllTenantsResponse,
  parseBulkResponse,
  parsePermissionsResponse,
} from '#src/enforcement/responses';

it('rejects sparse bulk decisions instead of skipping an absent position', () => {
  const decisions: unknown[] = [];
  decisions.length = 2;
  decisions[1] = { allow: true };
  expect(() => parseBulkResponse({ allow: decisions }, 2)).toThrow();
});

it('rejects sparse permission and role arrays returned by a custom transport', () => {
  const values: string[] = [];
  values.length = 2;
  values[1] = 'read';
  expect(() => parsePermissionsResponse({ document: { permissions: values } })).toThrow();
  expect(() =>
    parsePermissionsResponse({ document: { permissions: [], roles: values } }),
  ).toThrow();
});

it('rejects sparse all-tenant results instead of skipping an absent tenant', () => {
  const tenants: unknown[] = [];
  tenants.length = 2;
  tenants[1] = { allow: true, tenant: { key: 'tenant' } };
  expect(() => parseAllTenantsResponse({ allowed_tenants: tenants })).toThrow();
});

it('applies permission defaults without mutating the original response', () => {
  const entry = Object.freeze({
    tenant: Object.freeze({ key: 'tenant', name: 'Name' }),
    roles: null,
  });
  const body = Object.freeze({
    result: Object.freeze({ permissions: Object.freeze({ document: entry }) }),
  });
  expect(parsePermissionsResponse(body)).toStrictEqual({
    document: {
      permissions: [],
      tenant: { key: 'tenant', name: 'Name', attributes: {} },
    },
  });
  expect(entry).toStrictEqual({ tenant: { key: 'tenant', name: 'Name' }, roles: null });
});

it('validates both tenant and resource details when they coexist in a permission entry', () => {
  expect(() =>
    parsePermissionsResponse({
      document: {
        permissions: [],
        tenant: { key: 'tenant', attributes: {} },
        resource: { type: 'document', key: 42, attributes: {} },
      },
    }),
  ).toThrow();
});
