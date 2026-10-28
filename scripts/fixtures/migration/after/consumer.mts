import { Permit, PermitApiError, PermitConnectionError, PermitPDPStatusError } from 'permitio';

/**
 * Runs a representative migration against the configured environment and PDP.
 *
 * @returns Typed grouped records and authorization decisions.
 * @throws Error When deployment values are missing or an SDK operation fails.
 */
export default async function migratedConsumer() {
  const token = process.env['PERMIT_API_KEY'];
  const apiUrl = process.env['PERMIT_API_URL'];
  const pdp = process.env['PERMIT_PDP_URL'];
  if (!token || /[\s\p{Cc}]/u.test(token) || !apiUrl || !pdp) {
    throw new Error('Set valid Permit API key, API URL and PDP URL deployment values.');
  }
  const permit = new Permit({ token, apiUrl, pdp, log: { level: 'silent' } });
  try {
    const page = await permit.api.users.list({ page: 2, perPage: 3 });
    const sync = await permit.api.users.sync({ key: 'customer' });
    const rule = await permit.api.conditionSetRules.create({
      user_set: 'set',
      resource_set: 'resource-set',
      permission: 'document:read',
    });
    const rules = await permit.api.conditionSetRules.list({ permissionKey: 'read' });
    await permit.api.users.unassignRole({ user: 'customer', role: 'reader', tenant: 'tenant' });
    const allow = await permit.check('customer', 'read', { type: 'document', tenant: 'tenant' });
    return { users: page.data, user: sync.user, created: sync.created, rule, rules, allow };
  } catch (error: unknown) {
    if (error instanceof PermitPDPStatusError) {
      throw new Error(`PDP status ${error.statusCode ?? 'unknown'}`, { cause: error });
    }
    if (error instanceof PermitConnectionError) {
      throw new Error(`PDP connection ${error.code ?? 'unknown'}`, { cause: error });
    }
    if (error instanceof PermitApiError) {
      throw new Error(`REST status ${error.status ?? 'unknown'}`, { cause: error });
    }
    throw error;
  }
}
