import { createServer, IncomingHttpHeaders } from 'http';
import { Socket } from 'net';

import { ExecutionContext } from 'ava';

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
}

interface TestPdp {
  url: string;
  requests: CapturedRequest[];
}

/** Starts an HTTP PDP fixture; omitting the reply leaves requests pending for timeout tests. */
export async function startPdp(t: ExecutionContext, reply?: PdpReply): Promise<TestPdp> {
  // AVA isolates each test file in a worker; keep loopback traffic off inherited proxies.
  const proxyExclusions = [
    process.env.npm_config_no_proxy,
    process.env.no_proxy,
    process.env.NO_PROXY,
    '127.0.0.1',
  ]
    .filter(Boolean)
    .join(',')
    .split(',');
  const noProxy = [...new Set(proxyExclusions)].join(',');
  process.env.npm_config_no_proxy = noProxy;
  process.env.no_proxy = noProxy;
  process.env.NO_PROXY = noProxy;

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
        response.writeHead(reply.status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(reply.body));
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

  t.teardown(async () => {
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
  t: ExecutionContext,
  request: CapturedRequest | undefined,
  expected: { path: string; body: unknown; sdk?: string },
): void {
  if (!request) {
    t.fail('The PDP did not receive the expected HTTP request');
    return;
  }
  t.deepEqual(request.body, expected.body);
  t.is(request.method, 'POST');
  t.is(request.path, expected.path);
  t.is(request.headers.authorization, `Bearer ${TEST_TOKEN}`);
  t.is(
    request.headers['x-permit-sdk-version'],
    `node:${process.env.npm_package_version ?? 'unknown'}`,
  );
  t.is(request.headers['x-permit-sdk-language'], expected.sdk);
  t.is(request.headers['content-type'], 'application/json');
}
