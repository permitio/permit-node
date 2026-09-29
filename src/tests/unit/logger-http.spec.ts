import { createServer, Socket } from 'node:net';

import {
  assertLogs,
  buildLoggerChild,
  captureLogs,
  LoggerChild,
  LogMode,
  PdpOperation,
} from '../helpers/logger-test-process';
import { assertPdpRequest, startPdp } from '../helpers/pdp-test-server';

interface FailingPdp {
  url: string;
  received: () => number;
}

/**
 * Starts a TCP listener for the current test that closes each connection without an HTTP reply.
 * The listener closes when the test finishes.
 */
async function startResettingPdp(): Promise<FailingPdp> {
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
  onTestFinished(
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

async function startFailingPdp(scenario: 401 | 500 | 'reset'): Promise<FailingPdp> {
  if (scenario === 'reset') {
    return startResettingPdp();
  }
  const pdp = await startPdp({ status: scenario, body: { detail: 'test PDP failure' } });
  return { url: pdp.url, received: () => pdp.requests.length };
}

/** Asserts that the SDK logged the failure once, naming the method that failed. */
function assertOneErrorRecord(stdout: string, operation: PdpOperation) {
  const errorMessages = stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { level: number; msg: string })
    .filter((record) => record.level === 50)
    .map((record) => record.msg);
  expect(errorMessages, errorMessages.join('\n---\n')).toHaveLength(1);
  for (const message of errorMessages) {
    expect(message).toContain(`permit.${operation}(`);
  }
}

describe('SDK logging over HTTP (unit)', () => {
  let child: LoggerChild;

  beforeAll(async () => {
    child = await buildLoggerChild();
    return child.remove;
  });

  const modes: LogMode[] = ['json', 'env', 'pretty'];
  for (const mode of modes) {
    it(`PER-16493: ${mode} HTTP debug output keeps authorization out of logs`, async () => {
      const pdp = await startPdp({ status: 200, body: { allow: true } });
      const output = await captureLogs(child, mode, pdp.url);
      assertLogs(output, mode);
      expect(output.stdout).toContain('Sending HTTP request: POST allowed');
      expect(output.stdout).toContain('Received HTTP response: POST allowed, status: 200');
      expect(pdp.requests).toHaveLength(1);
      assertPdpRequest(pdp.requests[0], {
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

  const operations: PdpOperation[] = [
    'check',
    'bulkCheck',
    'getUserPermissions',
    'checkAllTenants',
  ];
  for (const mode of ['json', 'pretty'] as const) {
    for (const operation of operations) {
      for (const scenario of [401, 500, 'reset'] as const) {
        for (const throwOnError of [true, false]) {
          const title = `PER-16493: ${mode} ${operation} ${scenario} throw=${throwOnError}`;
          it(title, async () => {
            const pdp = await startFailingPdp(scenario);
            const output = await captureLogs(child, mode, pdp.url, {
              operation,
              throwOnError,
              failure: scenario === 'reset' ? 'transport' : 'status',
            });
            assertLogs(output, mode, throwOnError);
            expect(pdp.received()).toBe(1);
            if (mode === 'json' && throwOnError) {
              assertOneErrorRecord(output.stdout, operation);
            }
          });
        }
      }
    }
  }
});
