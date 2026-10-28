import SDK = require('permitio');

/**
 * Runs the grouped CommonJS migration against configured owned fixtures.
 *
 * @returns Typed grouped results and a literal authorization decision.
 * @throws Error When deployment values are missing or an SDK operation fails.
 */
async function migratedConsumer() {
  const token = process.env['PERMIT_API_KEY'];
  const apiUrl = process.env['PERMIT_API_URL'];
  const pdp = process.env['PERMIT_PDP_URL'];
  if (!token || /[\s\p{Cc}]/u.test(token) || !apiUrl || !pdp) {
    throw new Error('Set valid Permit API key, API URL and PDP URL deployment values.');
  }
  const permit = new SDK.Permit({ token, apiUrl, pdp, log: { level: 'silent' } });
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
}

export = migratedConsumer;
