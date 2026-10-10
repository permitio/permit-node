import { createServer, type IncomingHttpHeaders } from 'node:http';
import { Socket } from 'node:net';

export const TEST_TOKEN = 'permit-test-token-do-not-log';

interface CapturedRequest {
  method: string | undefined;
  path: string | undefined;
  headers: IncomingHttpHeaders;
  body: unknown;
}

interface PdpReply {
  status: number;
  body: unknown;
  delayMs?: number;
}

interface TestPdp {
  url: string;
  requests: CapturedRequest[];
}

/**
 * Starts an HTTP PDP fixture on a free loopback port for the current test and closes it when the
 * test finishes. Omitting the reply leaves requests pending, for timeout tests.
 */
export async function startPdp(reply?: PdpReply | ((index: number) => PdpReply)): Promise<TestPdp> {
  // Vitest runs each test file in its own worker; keep loopback traffic off inherited proxies.
  const proxyExclusions = [
    process.env['npm_config_no_proxy'],
    process.env['no_proxy'],
    process.env['NO_PROXY'],
    '127.0.0.1',
  ]
    .filter(Boolean)
    .join(',')
    .split(',');
  const noProxy = [...new Set(proxyExclusions)].join(',');
  process.env['npm_config_no_proxy'] = noProxy;
  process.env['no_proxy'] = noProxy;
  process.env['NO_PROXY'] = noProxy;

  const requests: CapturedRequest[] = [];
  const sockets = new Set<Socket>();
  const requestErrors: Error[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('error', (error: Error) => requestErrors.push(error));
    request.on('end', () => {
      try {
        const parsedBody: unknown = JSON.parse(body);
        requests.push({
          method: request.method,
          path: request.url,
          headers: request.headers,
          body: parsedBody,
        });
      } catch (error: unknown) {
        requestErrors.push(error instanceof Error ? error : new Error(String(error)));
        response.writeHead(400).end();
        return;
      }

      if (reply) {
        const selected = typeof reply === 'function' ? reply(requests.length - 1) : reply;
        const respond = () => {
          response.writeHead(selected.status, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(selected.body));
        };
        if (selected.delayMs === undefined) respond();
        else setTimeout(respond, selected.delayMs).unref();
      }
    });
  });
  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  onTestFinished(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      for (const socket of sockets) {
        socket.destroy();
      }
    });
    if (requestErrors.length > 0) {
      throw new Error(`Failed to read PDP test requests: ${requestErrors.map(String).join('; ')}`);
    }
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected the test PDP to listen on a TCP port');
  }
  return { url: `http://127.0.0.1:${address.port}`, requests };
}

/** Asserts the exact SDK HTTP contract and JSON payload received by the PDP. */
export function assertPdpRequest(
  request: CapturedRequest | undefined,
  expected: { path: string; body: unknown; sdk?: string | undefined },
): void {
  assert(request, 'The PDP did not receive the expected HTTP request');
  expect(request.body).toStrictEqual(expected.body);
  expect(request.method).toBe('POST');
  expect(request.path).toBe(expected.path);
  expect(request.headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
  expect(request.headers['x-permit-sdk-version']).toBe(
    `node:${process.env['npm_package_version'] ?? 'unknown'}`,
  );
  expect(request.headers['x-permit-sdk-language']).toBe(expected.sdk);
  expect(request.headers['content-type']).toBe('application/json');
}
