import { PermitApiError } from '../../../api/base';
import { EnvironmentCopy, EnvironmentCreate, EnvironmentUpdate } from '../../../api/environments';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

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
      rest.resolveWith([]);

      await permit.api.environments.list({ projectKey: PROJECT });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
    });

    it('forwards page and perPage as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.environments.list({ projectKey: PROJECT, page: 2, perPage: 10 });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.params).toMatchObject({ page: '2', per_page: '10' });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single environment with both keys in the path', async () => {
      rest.resolveWith({ key: ENV });

      await permit.api.environments.get(PROJECT, ENV);

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(RESOURCE);
    });

    it('getByKey is an alias for get', async () => {
      rest.resolveWith({ key: ENV });

      await permit.api.environments.getByKey(PROJECT, ENV);

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(RESOURCE);
    });

    it('getById is an alias for get', async () => {
      rest.resolveWith({ key: ENV });

      await permit.api.environments.getById(PROJECT, ENV);

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(RESOURCE);
    });
  });

  describe('getStats', () => {
    it('GETs the stats sub-path', async () => {
      rest.resolveWith({});

      await permit.api.environments.getStats(PROJECT, ENV);

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${RESOURCE}/stats`);
    });
  });

  describe('getApiKey', () => {
    it('GETs the api-key path keyed by project and environment', async () => {
      rest.resolveWith({ secret: 'permit_key' });

      await permit.api.environments.getApiKey(PROJECT, ENV);

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`/v2/api-key/${PROJECT}/${ENV}`);
    });
  });

  describe('create', () => {
    const payload: EnvironmentCreate = {
      key: ENV,
      name: 'Environment A',
    };

    it('POSTs the environment body to the project collection', async () => {
      rest.resolveWith({ ...payload, id: 'env-id-1' });

      await permit.api.environments.create(PROJECT, payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the environment body to the keyed path', async () => {
      const body: EnvironmentUpdate = { name: 'Renamed' };
      rest.resolveWith({ key: ENV, name: 'Renamed' });

      await permit.api.environments.update(PROJECT, ENV, body);

      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.url).toContain(RESOURCE);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('copy', () => {
    it('POSTs the copy params to the copy sub-path', async () => {
      const copyParams: EnvironmentCopy = {
        target_env: { existing: 'env-b' },
        conflict_strategy: 'overwrite',
      };
      rest.resolveWith({ key: 'env-b' });

      await permit.api.environments.copy(PROJECT, ENV, copyParams);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(`${RESOURCE}/copy`);
      expect(rest.last?.data).toEqual(copyParams);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.environments.delete(PROJECT, ENV);

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(RESOURCE);
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
