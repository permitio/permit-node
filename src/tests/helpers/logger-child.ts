import { deepStrictEqual, strictEqual } from 'assert';

import axios from 'axios';
import pino from 'pino';

import { Permit, PermitConnectionError, PermitPDPStatusError } from '#src/index';

import { TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === undefined || !['default', 'json', 'env', 'pretty', 'env-pretty'].includes(mode)) {
    throw new Error('Expected a supported logger mode');
  }
  const pdp = process.argv[3];
  const operation = process.argv[4] ?? 'check';
  const throwOnError = process.argv[5] !== 'false';
  const instances = Number(process.argv[6] ?? '1');
  const expected = process.argv[7] ?? 'allow';
  if (!Number.isInteger(instances) || instances < 1) {
    throw new Error('Expected a positive instance count');
  }
  if (!['allow', 'status', 'transport'].includes(expected)) {
    throw new Error('Expected allow, status or transport as the expected outcome');
  }

  const warnings: Error[] = [];
  const onWarning = (warning: Error) => warnings.push(warning);
  process.on('warning', onWarning);
  // Pino installs one shared JSON flush listener; measure SDK growth after its initialization.
  const jsonLogger =
    mode === 'pretty' || mode === 'env-pretty' ? undefined : pino({ level: 'silent' });
  const exitListeners = process.listenerCount('exit');
  let permit: Permit | undefined;
  for (let index = 0; index < instances; index++) {
    permit = new Permit({
      token: TEST_TOKEN,
      pdp: pdp || 'http://127.0.0.1:1',
      timeout: 5000,
      retry: false,
      throwOnError,
      axiosInstance: axios.create({ headers: { 'X-Test-Secret': 'rest-secret-do-not-log' } }),
      log:
        mode === 'json' || mode === 'pretty'
          ? { level: 'debug', json: mode === 'json' }
          : { level: 'debug' },
    });
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
  jsonLogger?.flush();
  process.removeListener('warning', onWarning);
  strictEqual(process.listenerCount('exit'), exitListeners, 'Permit added process exit listeners');
  deepStrictEqual(warnings, [], 'Permit emitted process warnings');
  if (!permit) {
    throw new Error('Expected a Permit instance');
  }
  if (!pdp) {
    return;
  }

  let result: unknown;
  try {
    switch (operation) {
      case 'check':
        result = await permit.check('user-1', 'read', 'document:one');
        break;
      case 'bulkCheck':
        result = await permit.bulkCheck([
          { user: 'user-1', action: 'read', resource: 'document:one' },
          { user: 'user-1', action: 'write', resource: 'document:two' },
        ]);
        break;
      case 'getUserPermissions':
        result = await permit.getUserPermissions('user-1');
        break;
      case 'checkAllTenants':
        result = await permit.checkAllTenants('user-1', 'read', 'document:one');
        break;
      default:
        throw new Error(`Unknown test operation: ${operation}`);
    }
  } catch (error: unknown) {
    if (expected === 'allow' || !throwOnError || !(error instanceof PermitConnectionError)) {
      throw error;
    }
    strictEqual(
      error instanceof PermitPDPStatusError,
      expected === 'status',
      `Expected a ${expected} error, got ${error.name}`,
    );
    console.error(error);
    return;
  }

  if (expected !== 'allow') {
    strictEqual(throwOnError, false, 'Expected the PDP error to be thrown');
    const denied: Record<string, unknown> = {
      check: false,
      bulkCheck: [false, false],
      getUserPermissions: {},
      checkAllTenants: [],
    };
    deepStrictEqual(result, denied[operation]);
  } else {
    strictEqual(result, true, 'Expected the local PDP to allow the logger test request');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
