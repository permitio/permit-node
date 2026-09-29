import { PermitApiError } from '../../../api/base';
import { ConditionSetRuleCreate, ConditionSetRuleRemove } from '../../../api/condition-set-rules';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// set-rules URL is scoped under `/v2/facts/{proj}/{env}/set_rules`.
const PROJ = 'proj';
const ENV = 'env';
const COLLECTION = `/v2/facts/${PROJ}/${ENV}/set_rules`;

describe('ConditionSetRulesApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the env-scoped collection mapping filters to wire params', async () => {
      rest.resolveWith([]);

      await permit.api.conditionSetRules.list({
        userSetKey: 'us-employees',
        permissionKey: 'document:read',
        resourceSetKey: 'confidential-docs',
      });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      // userSetKey/permissionKey/resourceSetKey map to snake_case wire params.
      expect(rest.last?.params).toMatchObject({
        user_set: 'us-employees',
        permission: 'document:read',
        resource_set: 'confidential-docs',
        page: '1',
        per_page: '100',
      });
    });

    it('forwards page and perPage alongside the filters', async () => {
      rest.resolveWith([]);

      await permit.api.conditionSetRules.list({
        userSetKey: 'us-employees',
        permissionKey: 'document:read',
        resourceSetKey: 'confidential-docs',
        page: 2,
        perPage: 10,
      });

      expect(rest.last?.params).toMatchObject({ page: '2', per_page: '10' });
    });
  });

  describe('create', () => {
    const rule: ConditionSetRuleCreate = {
      user_set: 'us-employees',
      permission: 'document:read',
      resource_set: 'confidential-docs',
    };

    it('POSTs the rule body to the collection', async () => {
      // assignSetPermissions returns an array; the SDK unwraps `.data[0]`.
      rest.resolveWith([{ ...rule, id: 'rule-1' }]);

      await permit.api.conditionSetRules.create(rule);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(rule);
    });
  });

  describe('delete', () => {
    const rule: ConditionSetRuleRemove = {
      user_set: 'us-employees',
      permission: 'document:read',
      resource_set: 'confidential-docs',
    };

    it('DELETEs the collection with the rule as the request body', async () => {
      rest.resolveWith({});

      await permit.api.conditionSetRules.delete(rule);

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(rule);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 on list to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.conditionSetRules
        .list({
          userSetKey: 'us-employees',
          permissionKey: 'document:read',
          resourceSetKey: 'confidential-docs',
        })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.conditionSetRules
        .create({
          user_set: 'us-employees',
          permission: 'document:read',
          resource_set: 'confidential-docs',
        })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
