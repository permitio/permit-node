import axios from 'axios';
import { expect, expectTypeOf, test } from 'vitest';

import { OrganizationsApi } from '#src/openapi/api/organizations-api';
import { Configuration } from '#src/openapi/configuration';
import type { HistoricalUsage } from '#src/openapi/types/historical-usage';
import type { MonthlyUsage } from '#src/openapi/types/monthly-usage';
import type { OrganizationStats } from '#src/openapi/types/organization-stats';

const tenantIds = ['b258e124-d46c-4aa1-8f8d-efce374e8bd0', '5cd1f42c-28d3-4a7d-8fb3-bbf34e45a984'];

test('generated usage declarations describe optional arrays through nested statistics', () => {
  expectTypeOf<MonthlyUsage['monthly_tenants']>().toEqualTypeOf<string[] | undefined>();
  expectTypeOf<HistoricalUsage['current_month']>().toEqualTypeOf<MonthlyUsage | undefined>();
  expectTypeOf<OrganizationStats['historical_usage']>().toEqualTypeOf<HistoricalUsage>();
  const usage: MonthlyUsage = { monthly_tenants: tenantIds };
  expect(usage.monthly_tenants?.includes(tenantIds[0] ?? '')).toBe(true);
});

test.each([{ tenants: tenantIds }, { tenants: [] }])(
  'source-generated Axios statistics preserve JSON arrays without Set conversion: %j',
  async ({ tenants }) => {
    const requests: Array<{ method: string | undefined; url: string; auth: unknown }> = [];
    const body: OrganizationStats = {
      key: 'organization',
      id: 'fcfbd383-de5f-46bc-aa02-bc3bde32032f',
      name: 'Organization',
      is_enterprise: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      stats: { projects: 1, environments: 1, users: 2 },
      historical_usage: { current_month: { monthly_tenants: tenants, month: 1, year: 2026 } },
    };
    const client = axios.create({
      adapter: async (config) => {
        requests.push({
          method: config.method,
          url: client.getUri(config),
          auth: config.headers.get('Authorization'),
        });
        return {
          data: JSON.stringify(body),
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          config,
        };
      },
    });
    const api = new OrganizationsApi(
      new Configuration({ basePath: 'https://api.invalid', accessToken: 'test-token' }),
      undefined,
      client,
    );
    const response = await api.statsOrganization({ orgId: 'org/id' });
    expect(requests).toEqual([
      {
        method: 'get',
        url: 'https://api.invalid/v2/orgs/org%2Fid/stats',
        auth: 'Bearer test-token',
      },
    ]);
    expect(response.data).toEqual(body);
    const actual = response.data.historical_usage.current_month?.monthly_tenants;
    expect(Array.isArray(actual)).toBe(true);
    expect(actual).toEqual(tenants);
    expect(actual).not.toBeInstanceOf(Set);
    expect(actual?.map((id) => id)).toEqual(tenants);
    expect(actual?.includes(tenantIds[0] ?? '')).toBe(tenants.length > 0);
  },
);
