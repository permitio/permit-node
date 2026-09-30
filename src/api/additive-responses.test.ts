import { expect, test } from 'vitest';

import { createMockPermit } from '#src/tests/helpers/mock-api';

test('preserves additive fields and unknown enum values on returned control-plane objects', async () => {
  const { permit, rest } = createMockPermit();
  const response = {
    key: 'document',
    future_status: 'new-server-value',
    attributes: { classification: { type: 'future-attribute-type', extra: { enabled: true } } },
    new_metadata: { values: [null, false, 0, ''] },
  };
  rest.resolveWith(response);
  expect(await permit.api.resources.get('document')).toEqual(response);
});

for (const proxyFactsViaPdp of [false, true]) {
  test(`preserves unknown user and envelope data with proxyFactsViaPdp=${proxyFactsViaPdp}`, async () => {
    const { permit, rest } = createMockPermit({ proxyFactsViaPdp });
    const user = { key: 'alice', attributes: { nested: { added: true } }, future_flag: false };
    const response = { data: [user], total_count: 1, future_cursor: 'cursor' };
    rest.resolveWith(response);
    expect(await permit.api.users.list()).toEqual(response);
    rest.resolveWith(user);
    expect(await permit.api.users.get('alice')).toEqual(user);
  });
}

test('preserves additive row fields when a documented wrapper unwraps an envelope', async () => {
  const { permit, rest } = createMockPermit();
  const rows = [{ key: 'owner', future_kind: 'future-relation', metadata: { nested: ['value'] } }];
  rest.resolveWith({ data: rows, page_count: 1, total_count: 1, future_cursor: 'cursor' });
  expect(await permit.api.resourceRelations.list({ resourceKey: 'document' })).toEqual(rows);
});
