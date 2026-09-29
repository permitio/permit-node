import { PermitApiError } from '../../../api/base';
import { ProjectCreate, ProjectUpdate } from '../../../api/projects';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// Projects are an organization-scoped resource: their paths carry no
// `{proj}/{env}` schema segment, just `/v2/projects[/{key}]`. The mock must be
// seeded with an organization-level context or every method rejects before it
// can dispatch.
const COLLECTION = '/v2/projects';

describe('ProjectsApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit({ contextLevel: 'organization' }));
  });

  describe('list', () => {
    it('GETs the projects collection with default pagination', async () => {
      rest.resolveWith([]);

      await permit.api.projects.list();

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
    });

    it('forwards page and perPage as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.projects.list({ page: 3, perPage: 25 });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.params).toMatchObject({ page: '3', per_page: '25' });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single project with the key in the path', async () => {
      rest.resolveWith({ key: 'proj-a' });

      await permit.api.projects.get('proj-a');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/proj-a`);
    });

    it('getByKey is an alias for get', async () => {
      rest.resolveWith({ key: 'proj-a' });

      await permit.api.projects.getByKey('proj-a');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/proj-a`);
    });

    it('getById is an alias for get', async () => {
      rest.resolveWith({ key: 'proj-1' });

      await permit.api.projects.getById('proj-1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/proj-1`);
    });
  });

  describe('create', () => {
    const payload: ProjectCreate = {
      key: 'proj-a',
      name: 'Project A',
    };

    it('POSTs the project body to the collection', async () => {
      rest.resolveWith({ ...payload, id: 'proj-id-1' });

      await permit.api.projects.create(payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the project body to the keyed path', async () => {
      const body: ProjectUpdate = { name: 'Renamed' };
      rest.resolveWith({ key: 'proj-a', name: 'Renamed' });

      await permit.api.projects.update('proj-a', body);

      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.url).toContain(`${COLLECTION}/proj-a`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.projects.delete('proj-a');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${COLLECTION}/proj-a`);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.projects.get('missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.projects
        .create({ key: 'proj-a', name: 'Project A' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
