import { PermitApiError } from '../../../api/base';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// elementsLoginAs has no scope segment: it posts to a fixed auth endpoint and
// (unlike the schema/facts modules) is not gated on the SDK api context.
const LOGIN_PATH = '/v2/auth/elements_login_as';

describe('ElementsClient (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('loginAs', () => {
    it('POSTs the snake_cased login body to the elements auth endpoint', async () => {
      rest.resolveWith({ redirect_url: 'https://app.permit.io/embed' });

      await permit.elements.loginAs({ userId: 'user-1', tenantId: 'tenant-1' });

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(LOGIN_PATH);
      // { userId, tenantId } is mapped onto the wire shape { user_id, tenant_id }.
      expect(rest.last?.data).toEqual({ user_id: 'user-1', tenant_id: 'tenant-1' });
    });

    it('wraps the response data with a content.url derived from redirect_url', async () => {
      rest.resolveWith({ redirect_url: 'https://app.permit.io/embed', token: 'tok-123' });

      const result = await permit.elements.loginAs({ userId: 'user-1', tenantId: 'tenant-1' });

      // The raw response fields are spread through unchanged...
      expect(result.token).toBe('tok-123');
      expect(result.redirect_url).toBe('https://app.permit.io/embed');
      // ...and `content.url` mirrors the redirect_url so callers can embed it.
      expect(result.content).toEqual({ url: 'https://app.permit.io/embed' });
    });

    it('dispatches without seeding any environment scope into the path', async () => {
      rest.resolveWith({ redirect_url: 'https://app.permit.io/embed' });

      await permit.elements.loginAs({ userId: 'user-1', tenantId: 'tenant-1' });

      expect(rest.requests).toHaveLength(1);
      expect(rest.last?.url).not.toContain('/v2/schema/');
      expect(rest.last?.url).not.toContain('/v2/facts/');
    });

    it('maps a 403 forbidden response to PermitApiError', async () => {
      rest.rejectWith(403, { message: 'Forbidden access' });

      const error = await permit.elements
        .loginAs({ userId: 'user-1', tenantId: 'tenant-1' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(403);
    });

    it('maps a 404 (user/tenant not found) to PermitApiError', async () => {
      rest.rejectWith(404, { message: 'User not found' });

      const error = await permit.elements
        .loginAs({ userId: 'missing', tenantId: 'tenant-1' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });
  });
});
