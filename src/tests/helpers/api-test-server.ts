import { createServer, type IncomingHttpHeaders } from 'node:http';
import { type Socket } from 'node:net';

import { expect, onTestFinished } from 'vitest';

export interface ApiRequest {
  method: string | undefined;
  path: string;
  query: [string, string][];
  headers: IncomingHttpHeaders;
  body: unknown;
}

export interface ApiReply {
  body: unknown;
  status?: number;
}

export interface ExpectedApiRequest {
  method: string;
  path: string;
  query?: [string, string][];
  body?: unknown;
}

interface QueuedReply {
  request: ExpectedApiRequest;
  response: ApiReply | Promise<ApiReply>;
}

/**
 * Starts a real loopback API boundary that requires an explicit reply for every request.
 * Scope discovery runs normally; no SDK clients, adapters or context state are patched.
 * Unexpected traffic, mismatched contracts and unused replies fail the owning test.
 */
export async function startApi(): Promise<{
  url: string;
  requests: ApiRequest[];
  enqueue: (request: ExpectedApiRequest, response: ApiReply | Promise<ApiReply>) => void;
}> {
  const requests: ApiRequest[] = [];
  const replies: QueuedReply[] = [];
  const failures: unknown[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('error', (error) => failures.push(error));
    request.on('end', () => {
      void (async () => {
        try {
          const url = new URL(request.url ?? '/', 'http://127.0.0.1');
          const captured: ApiRequest = {
            method: request.method,
            path: url.pathname,
            query: [...url.searchParams.entries()],
            headers: request.headers,
            body: body === '' ? undefined : JSON.parse(body),
          };
          requests.push(captured);
          const queued = replies.shift();
          if (!queued) throw new Error(`Unqueued API request: ${captured.method} ${captured.path}`);
          expect(captured.method).toBe(queued.request.method);
          expect(captured.path).toBe(queued.request.path);
          expect(captured.query).toStrictEqual(queued.request.query ?? []);
          expect(captured.body).toStrictEqual(queued.request.body);
          const reply = await queued.response;
          response.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(reply.body));
        } catch (error) {
          failures.push(error);
          response.writeHead(500).end('{"message":"API fixture contract failed"}');
        }
      })();
    });
  });
  server.on('connection', (socket) => {
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
      for (const socket of sockets) socket.destroy();
    });
    expect(replies, 'The API fixture has unused replies').toHaveLength(0);
    if (failures.length > 0) throw new AggregateError(failures, 'API fixture contract failed');
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected the API fixture to listen on a TCP port');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    enqueue: (request, response) => replies.push({ request, response }),
  };
}
