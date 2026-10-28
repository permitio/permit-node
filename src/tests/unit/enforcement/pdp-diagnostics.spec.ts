import { createServer, type Server } from 'node:net';
import { inspect } from 'node:util';

import axios from 'axios';

import { Permit, PermitConnectionError, PermitPDPStatusError } from '#src/index';
import { startPdp, TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';
import { rejectionOf } from '#src/tests/helpers/rejection';

const ECHOED = 'echoed-request-value';

function representations(error: Error): string[] {
  return [
    String(error),
    inspect(error, { depth: Infinity, showHidden: true }),
    JSON.stringify(error),
  ];
}

function checks(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    user: { key: `user-${index}@example.test`, attributes: { note: `private-note-${index}` } },
    action: 'read',
    resource: `document:document-${index}-key`,
  }));
}

/** A loopback port with nothing listening on it, for connection-refused failures. */
async function closedPort(): Promise<string> {
  const server: Server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address !== null && typeof address !== 'string');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${address.port}`;
}

describe('PDP diagnostics keep useful context', () => {
  it('keeps the text around a request value a PDP 503 body echoes', async () => {
    const pdp = await startPdp({ status: 503, body: { detail: `busy evaluating ${ECHOED} now` } });
    const permit = new Permit({
      token: TEST_TOKEN,
      pdp: pdp.url,
      retry: false,
      log: { level: 'silent' },
    });
    const error = await rejectionOf(permit.check({ key: ECHOED }, 'read', 'document:one'));
    assert(error instanceof PermitPDPStatusError);
    expect(error.responseBody).toStrictEqual({ detail: 'busy evaluating [REDACTED] now' });
    for (const text of representations(error)) {
      expect(text).not.toContain(ECHOED);
      expect(text).not.toContain(TEST_TOKEN);
    }
  });

  for (const count of [100, 1000]) {
    it(`keeps the transport code and PDP address for a ${count}-item bulkCheck that cannot connect`, async () => {
      const pdp = await closedPort();
      const permit = new Permit({
        token: TEST_TOKEN,
        pdp: `${pdp}/pdp-prefix`,
        retry: false,
        log: { level: 'silent' },
      });
      const error = await rejectionOf(permit.bulkCheck(checks(count)));
      assert(error instanceof PermitConnectionError);
      expect(error).not.toBeInstanceOf(PermitPDPStatusError);
      expect(error.code).toBe('ECONNREFUSED');
      expect(error.message).toContain(`running at ${pdp}/pdp-prefix `);
      expect(error.message).toContain('ECONNREFUSED');
      for (const text of representations(error)) {
        expect(text).not.toContain(TEST_TOKEN);
        expect(text).not.toContain('private-note-1');
        expect(text).not.toContain('user-1@example.test');
      }
    });

    it(`keeps the transport code for a ${count}-item bulkCheck that times out`, async () => {
      const pdp = await startPdp();
      const permit = new Permit({
        token: TEST_TOKEN,
        pdp: pdp.url,
        timeout: 200,
        retry: false,
        log: { level: 'silent' },
      });
      const error = await rejectionOf(permit.bulkCheck(checks(count)));
      assert(error instanceof PermitConnectionError);
      expect(error.code).toBe('ECONNABORTED');
      expect(error.message).toContain(`running at ${pdp.url}/ `);
      for (const text of representations(error)) {
        expect(text).not.toContain(TEST_TOKEN);
        expect(text).not.toContain('private-note-1');
      }
    });
  }

  it('never shows the token in a PDP address when request privacy overflows', async () => {
    const pdp = await closedPort();
    const permit = new Permit({
      token: TEST_TOKEN,
      pdp: `${pdp}/${TEST_TOKEN}`,
      retry: false,
      log: { level: 'silent' },
    });
    const error = await rejectionOf(permit.bulkCheck(checks(1000)));
    assert(error instanceof PermitConnectionError);
    expect(error.code).toBe('ECONNREFUSED');
    expect(error.message).toContain(`running at ${pdp}/[REDACTED] `);
    for (const text of representations(error)) expect(text).not.toContain(TEST_TOKEN);
  });

  it('drops a custom error code that is not a transport constant when privacy overflows', async () => {
    const secretCode = 'OPAQUE_CALLER_CREDENTIAL';
    const permit = new Permit({
      token: secretCode,
      pdp: 'http://127.0.0.1:7766',
      retry: false,
      log: { level: 'silent' },
      opaAxiosInstance: axios.create({
        adapter: async () => {
          throw Object.assign(new Error(`caller failed with ${secretCode}`), { code: secretCode });
        },
      }),
    });
    const context = Object.fromEntries(
      Array.from({ length: 1000 }, (_, index) => [`field${index}`, `private-value-${index}`]),
    );
    const error = await rejectionOf(
      permit.check('user-1', 'read', 'document:one', context, { useOpa: true }),
    );
    assert(error instanceof PermitConnectionError);
    expect(error.code).toBeUndefined();
    for (const text of representations(error)) expect(text).not.toContain(secretCode);
  });
});
