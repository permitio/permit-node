import { createServer, Socket } from 'net';

import test, { ExecutionContext } from 'ava';

import { assertLogs, captureLogs, LogMode, PdpOperation } from './logger-test-process';
import { assertPdpRequest, startPdp } from './pdp-test-server';

interface FailingPdp {
  url: string;
  received: () => number;
}

/** Starts a TCP listener that closes each connection without an HTTP reply. */
async function startResettingPdp(t: ExecutionContext): Promise<FailingPdp> {
  let connections = 0;
  const server = createServer((socket: Socket) => {
    connections++;
    socket.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  t.teardown(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected the resetting PDP to listen on a TCP port');
  }
  return { url: `http://127.0.0.1:${address.port}`, received: () => connections };
}

async function startFailingPdp(
  t: ExecutionContext,
  scenario: 401 | 500 | 'reset',
): Promise<FailingPdp> {
  if (scenario === 'reset') {
    return startResettingPdp(t);
  }
  const pdp = await startPdp(t, { status: scenario, body: { detail: 'test PDP failure' } });
  return { url: pdp.url, received: () => pdp.requests.length };
}

/** Asserts that the SDK logged the failure once, naming the method that failed. */
function assertOneErrorRecord(t: ExecutionContext, stdout: string, operation: PdpOperation) {
  const errorMessages = stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { level: number; msg: string })
    .filter((record) => record.level === 50)
    .map((record) => record.msg);
  t.is(errorMessages.length, 1, errorMessages.join('\n---\n'));
  t.true(errorMessages.every((message) => message.includes(`permit.${operation}(`)));
}

const modes: LogMode[] = ['json', 'env', 'pretty'];
for (const mode of modes) {
  test(`PER-16493: ${mode} HTTP debug output keeps authorization out of logs`, async (t) => {
    const pdp = await startPdp(t, { status: 200, body: { allow: true } });
    const output = await captureLogs(mode, pdp.url);
    assertLogs(t, output, mode);
    t.true(output.stdout.includes('Sending HTTP request: POST allowed'));
    t.true(output.stdout.includes('Received HTTP response: POST allowed, status: 200'));
    t.is(pdp.requests.length, 1);
    assertPdpRequest(t, pdp.requests[0], {
      path: '/allowed',
      body: {
        user: { key: 'user-1' },
        action: 'read',
        resource: { type: 'document', key: 'one', tenant: 'default' },
        context: {},
      },
    });
  });
}

const operations: PdpOperation[] = ['check', 'bulkCheck', 'getUserPermissions', 'checkAllTenants'];
for (const mode of ['json', 'pretty'] as const) {
  for (const operation of operations) {
    for (const scenario of [401, 500, 'reset'] as const) {
      for (const throwOnError of [true, false]) {
        const title = `PER-16493: ${mode} ${operation} ${scenario} throw=${throwOnError}`;
        test.serial(title, async (t) => {
          const pdp = await startFailingPdp(t, scenario);
          const output = await captureLogs(mode, pdp.url, {
            operation,
            throwOnError,
            failure: scenario === 'reset' ? 'transport' : 'status',
          });
          assertLogs(t, output, mode, throwOnError);
          t.is(pdp.received(), 1);
          if (mode === 'json' && throwOnError) {
            assertOneErrorRecord(t, output.stdout, operation);
          }
        });
      }
    }
  }
}
