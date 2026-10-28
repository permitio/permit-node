import { Permit, PermitConnectionError, PermitError } from '#src/index';
import { type ICheckQuery } from '#src/enforcement/interfaces';
import { startPdp, TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';
import { rejectionOf } from '#src/tests/helpers/rejection';
import { type CheckConfig } from '#src/utils/context';

const operations: [string, (permit: Permit, config: CheckConfig) => Promise<unknown>][] = [
  ['check', (permit, config) => permit.check('user-1', 'read', 'document:one', {}, config)],
  [
    'bulkCheck',
    (permit, config) =>
      permit.bulkCheck([{ user: 'user-1', action: 'read', resource: 'document:one' }], {}, config),
  ],
  [
    'getUserPermissions',
    (permit, config) =>
      permit.getUserPermissions('user-1', undefined, undefined, undefined, config),
  ],
  [
    'getAuthorizedUsers',
    (permit, config) => permit.getAuthorizedUsers('read', 'document', {}, config),
  ],
  ['getUserTenants', (permit, config) => permit.getUserTenants('user-1', {}, config)],
  [
    'filterObjects',
    (permit, config) => permit.filterObjects('user-1', 'read', [{ type: 'document' }], {}, config),
  ],
  ['checkUrl', (permit, config) => permit.checkUrl('user-1', 'GET', 'https://app.test/x', config)],
  ['getLocalRoleAssignments', (permit, config) => permit.getLocalRoleAssignments({}, config)],
];

describe('per-call timeout validation', () => {
  for (const [name, call] of operations) {
    for (const timeout of [-1, Number.NaN, Number.POSITIVE_INFINITY, '500', 2_147_483_648]) {
      it(`${name} rejects timeout ${String(timeout)} with PermitError in either error policy`, async () => {
        const pdp = await startPdp({ status: 200, body: {} });
        for (const throwOnError of [true, false]) {
          const permit = new Permit({
            token: TEST_TOKEN,
            pdp: pdp.url,
            retry: false,
            throwOnError,
            log: { level: 'silent' },
          });
          const config = { timeout } as unknown as CheckConfig;
          const error = await rejectionOf(call(permit, config));
          expect(error).toBeInstanceOf(PermitError);
          expect(error).not.toBeInstanceOf(PermitConnectionError);
          expect(error.message).toBe(
            `Permit.${name}() timeout must be between 0 and 2147483647 ms.`,
          );
          const perCall = await rejectionOf(call(permit, { ...config, throwOnError: false }));
          expect(perCall).toBeInstanceOf(PermitError);
          expect(perCall).not.toBeInstanceOf(PermitConnectionError);
        }
        expect(pdp.requests).toHaveLength(0);
      });
    }
  }
});

describe('bulkCheck slot validation', () => {
  for (const slot of [null, 'document:one', 7]) {
    it(`rejects a ${slot === null ? 'null' : typeof slot} slot with PermitError, not a TypeError`, async () => {
      const pdp = await startPdp({ status: 200, body: { allow: [{ allow: true }] } });
      const permit = new Permit({
        token: TEST_TOKEN,
        pdp: pdp.url,
        retry: false,
        log: { level: 'silent' },
      });
      const checks = [
        slot,
        { user: 'user-1', action: 'read', resource: 'document:one' },
      ] as unknown as ICheckQuery[];
      const error = await rejectionOf(permit.bulkCheck(checks));
      expect(error).toBeInstanceOf(PermitError);
      expect(error.message).toBe(
        'permit.bulkCheck() requires a check object at every array position',
      );
      expect(await permit.bulkCheck(checks, {}, { throwOnError: false })).toStrictEqual([
        false,
        false,
      ]);
      expect(pdp.requests).toHaveLength(0);
    });
  }
});
