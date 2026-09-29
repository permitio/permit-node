import { PermitApiError } from '../../../api/base';
import { RelationshipTupleCreate, RelationshipTupleDelete } from '../../../api/relationship-tuples';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// Facts modules dispatch on the REST transport; the env-scoped default context
// places every tuple URL under `/v2/facts/{proj}/{env}/relationship_tuples`.
const PROJ = 'proj';
const ENV = 'env';
const COLLECTION = `/v2/facts/${PROJ}/${ENV}/relationship_tuples`;
const BULK = `${COLLECTION}/bulk`;

describe('RelationshipTuplesApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the env-scoped collection with no params when none are given', async () => {
      rest.resolveWith([]);

      await permit.api.relationshipTuples.list({});

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      // The SDK does not default pagination here, so omitted filters are absent.
      expect(rest.last?.params).not.toHaveProperty('page');
      expect(rest.last?.params).not.toHaveProperty('tenant');
    });

    it('forwards filters and pagination as snake_case wire params', async () => {
      rest.resolveWith([]);

      await permit.api.relationshipTuples.list({
        tenant: 'default',
        subject: 'user:alice',
        relation: 'parent',
        object: 'folder:root',
        objectType: 'folder',
        subjectType: 'user',
        page: 2,
        perPage: 5,
      });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({
        tenant: 'default',
        subject: 'user:alice',
        relation: 'parent',
        object: 'folder:root',
        object_type: 'folder',
        subject_type: 'user',
        page: '2',
        per_page: '5',
      });
    });
  });

  describe('create', () => {
    const tuple: RelationshipTupleCreate = {
      subject: 'user:alice',
      relation: 'parent',
      object: 'folder:root',
      tenant: 'default',
    };

    it('POSTs the tuple body to the facts collection', async () => {
      rest.resolveWith({ ...tuple, id: 'tuple-1' });

      await permit.api.relationshipTuples.create(tuple);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.url).not.toContain('/bulk');
      expect(rest.last?.data).toEqual(tuple);
    });
  });

  describe('delete', () => {
    const tuple: RelationshipTupleDelete = {
      subject: 'user:alice',
      relation: 'parent',
      object: 'folder:root',
    };

    it('DELETEs with the tuple as the request body', async () => {
      rest.resolveWith({});

      await permit.api.relationshipTuples.delete(tuple);

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.url).not.toContain('/bulk');
      expect(rest.last?.data).toEqual(tuple);
    });
  });

  describe('bulkRelationshipTuples', () => {
    it('POSTs the tuples wrapped under operations to the bulk path', async () => {
      const tuples: RelationshipTupleCreate[] = [
        { subject: 'user:alice', relation: 'parent', object: 'folder:root', tenant: 'default' },
        { subject: 'user:bob', relation: 'member', object: 'folder:root', tenant: 'default' },
      ];
      rest.resolveWith({});

      await permit.api.relationshipTuples.bulkRelationshipTuples(tuples);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(BULK);
      expect(rest.last?.data).toEqual({ operations: tuples });
    });
  });

  describe('bulkUnRelationshipTuples', () => {
    it('DELETEs the tuples wrapped under idents to the bulk path', async () => {
      const tuples: RelationshipTupleDelete[] = [
        { subject: 'user:alice', relation: 'parent', object: 'folder:root' },
        { subject: 'user:bob', relation: 'member', object: 'folder:root' },
      ];
      rest.resolveWith({});

      await permit.api.relationshipTuples.bulkUnRelationshipTuples(tuples);

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(BULK);
      expect(rest.last?.data).toEqual({ idents: tuples });
    });
  });

  describe('waitForSync', () => {
    it('returns the same instance and ignores the call when proxyFactsViaPdp is off', () => {
      const api = permit.api.relationshipTuples;

      expect(api.waitForSync(10)).toBe(api);
    });

    it('returns a clone that sends X-Wait-Timeout when proxyFactsViaPdp is on', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });
      const api = proxied.permit.api.relationshipTuples;

      const synced = api.waitForSync(30);
      expect(synced).not.toBe(api);

      proxied.rest.resolveWith({});
      await synced.create({ subject: 'user:alice', relation: 'parent', object: 'folder:root' });

      expect(proxied.rest.last?.method).toBe('POST');
      // proxyFactsViaPdp routes facts requests at the PDP host.
      expect(proxied.rest.last?.url).toContain('http://localhost:7766');
      expect(proxied.rest.last?.headers?.['X-Wait-Timeout']).toBe('30');
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.relationshipTuples.list({}).catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.relationshipTuples
        .create({ subject: 'user:alice', relation: 'parent', object: 'folder:root' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
