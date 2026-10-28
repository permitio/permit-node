import { inspect } from 'node:util';

import { Permit } from '#src/index';
import { createMockPermit } from '#src/tests/helpers/mock-api';

const TOKEN = 'permit_key_config_token_canary';

describe('configuration token visibility', () => {
  it('keeps the token readable but redacts it from inspect and JSON', () => {
    const permit = new Permit({ token: TOKEN, log: { level: 'silent' } });
    expect(permit.config.token).toBe(TOKEN);
    expect(Object.isFrozen(permit.config)).toBe(true);
    expect(JSON.stringify(permit.config)).not.toContain(TOKEN);
    expect(JSON.parse(JSON.stringify(permit.config))).toMatchObject({
      token: '[REDACTED]',
      pdp: 'http://localhost:7766',
    });
    expect(inspect(permit.config)).toContain("token: '[REDACTED]'");
    for (const options of [{}, { depth: Infinity }, { depth: Infinity, showHidden: true }]) {
      expect(inspect(permit, options)).not.toContain(TOKEN);
      expect(inspect(permit.api.users, options)).not.toContain(TOKEN);
    }
    expect(() => {
      (permit.config as { token: string }).token = 'replaced';
    }).toThrow(TypeError);
    expect(permit.config.token).toBe(TOKEN);
  });

  it('keeps the token in a spread copy used to construct a new client', () => {
    const permit = new Permit({ token: TOKEN, log: { level: 'silent' } });
    const copy = { ...permit.config };
    expect(copy.token).toBe(TOKEN);
    expect(Object.keys(copy)).not.toContain('toJSON');
    const next = new Permit({ ...permit.config, pdp: 'http://127.0.0.1:7000' });
    expect(next.config.token).toBe(TOKEN);
    expect(inspect(next)).not.toContain(TOKEN);
  });

  it('still authenticates REST and PDP requests with the hidden token', async () => {
    const { permit, rest } = createMockPermit();
    rest.resolveWith({ data: [], total_count: 0, page_count: 0 });
    await permit.api.users.list();
    expect(rest.last?.headers.get('Authorization')).toBe(`Bearer ${permit.config.token}`);
  });
});
