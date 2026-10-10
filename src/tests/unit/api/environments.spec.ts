import { PermitApiError } from '#src/api/base';
import {
  type EnvironmentCopy,
  type EnvironmentCreate,
  type EnvironmentUpdate,
} from '#src/api/environments';
import { Permit } from '#src/index';
import { createMockPermit, type MockTransport } from '#src/tests/helpers/mock-api';

// Environments live under a project: their paths are
// `/v2/projects/{projectKey}/envs[/{environmentKey}]`. Every method requires an
// organization context, and the project/environment keys are passed as explicit
// arguments (not read from the seeded scope), so the mock is seeded at the
// organization level.
const PROJECT = 'proj-a';
const ENV = 'env-a';
const COLLECTION = `/v2/projects/${PROJECT}/envs`;
const RESOURCE = `${COLLECTION}/${ENV}`;

describe('EnvironmentsApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit({ contextLevel: 'organization' }));
  });

  describe('list', () => {
    it('GETs the project-scoped collection with default pagination', async () => {
      const environments = [{ key: ENV, id: 'env-id-1' }];
      rest.resolveWith(environments);

      const result = await permit.api.environments.list({ projectKey: PROJECT });

      expect(result).toEqual(environments);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
    });

    it('forwards page and perPage as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.environments.list({ projectKey: PROJECT, page: 2, perPage: 10 });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '2', per_page: '10' });
    });
  });

  describe('get / getByKey / getById', () => {
    const environment = { key: ENV, id: 'env-id-1' };

    it('GETs a single environment with both keys in the path', async () => {
      rest.resolveWith(environment);

      const result = await permit.api.environments.get(PROJECT, ENV);

      expect(result).toEqual(environment);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(RESOURCE);
    });

    it('getByKey is an alias for get', async () => {
      rest.resolveWith(environment);

      const result = await permit.api.environments.getByKey(PROJECT, ENV);

      expect(result).toEqual(environment);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(RESOURCE);
    });

    it('getById is an alias for get', async () => {
      rest.resolveWith(environment);

      const result = await permit.api.environments.getById(PROJECT, ENV);

      expect(result).toEqual(environment);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(RESOURCE);
    });
  });

  describe('getStats', () => {
    it('GETs the stats sub-path', async () => {
      const stats = { key: ENV, stats: { roles: 2, users: 3 } };
      rest.resolveWith(stats);

      const result = await permit.api.environments.getStats(PROJECT, ENV);

      expect(result).toEqual(stats);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${RESOURCE}/stats`);
    });
  });

  describe('getApiKey', () => {
    it('GETs the api-key path keyed by project and environment', async () => {
      const apiKey = { id: 'key-1', secret: 'permit_key' };
      rest.resolveWith(apiKey);

      const result = await permit.api.environments.getApiKey(PROJECT, ENV);

      expect(result).toEqual(apiKey);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`/v2/api-key/${PROJECT}/${ENV}`);
    });
  });

  describe('create', () => {
    const payload: EnvironmentCreate = {
      key: ENV,
      name: 'Environment A',
    };

    it('POSTs the environment body to the project collection', async () => {
      const created = { ...payload, id: 'env-id-1' };
      rest.resolveWith(created);

      const result = await permit.api.environments.create(PROJECT, payload);

      expect(result).toEqual(created);
      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the environment body to the keyed path', async () => {
      const body: EnvironmentUpdate = { name: 'Renamed' };
      const updated = { key: ENV, name: 'Renamed' };
      rest.resolveWith(updated);

      const result = await permit.api.environments.update(PROJECT, ENV, body);

      expect(result).toEqual(updated);
      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.path).toBe(RESOURCE);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('copy', () => {
    it('POSTs the copy params to the copy sub-path', async () => {
      const copyParams: EnvironmentCopy = {
        target_env: { existing: 'env-b' },
        conflict_strategy: 'overwrite',
      };
      const target = { key: 'env-b', id: 'env-id-2' };
      rest.resolveWith(target);

      const result = await permit.api.environments.copy(PROJECT, ENV, copyParams);

      expect(result).toEqual(target);
      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.path).toBe(`${RESOURCE}/copy`);
      expect(rest.last?.data).toEqual(copyParams);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.environments.delete(PROJECT, ENV);

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.path).toBe(RESOURCE);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.environments.get(PROJECT, 'missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.environments
        .create(PROJECT, { key: ENV, name: 'Environment A' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
