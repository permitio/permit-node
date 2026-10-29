import { spawnSync } from 'child_process';
import path from 'path';

import test from 'ava';

// A token value that only this test uses.
const TOKEN = 'permit_key_init_log_test_0123456789abcdef';

// The SDK's logger writes to the process's stdout file descriptor, so run a client in a
// child process and read what it printed. The child gets no PERMIT_* variables, so the
// shell running the tests can't change the client's config.
function initLog(config: Record<string, unknown>, env: Record<string, string> = {}) {
  const sdk = path.resolve(__dirname, '../../index.js');
  const script = `
    const { Permit } = require(${JSON.stringify(sdk)});
    new Permit(${JSON.stringify({ token: TOKEN, ...config })});
  `;
  const childEnv: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('PERMIT_')) {
      childEnv[name] = value;
    }
  }
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...childEnv, ...env },
    // A hung child fails here, with the reason, rather than at ava's inactivity timeout.
    timeout: 20000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `the client failed to start (status ${result.status}, signal ${result.signal}): ${
        result.error ?? result.stderr
      }`,
    );
  }
  const output = result.stdout + result.stderr;
  const records = result.stdout
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line));
  return { output, records };
}

test('the debug init line carries the endpoints and settings, nothing else', (t) => {
  const { output, records } = initLog({
    pdp: 'http://pdp-user:pdp-password@pdp.example.com:7766/path?key=query-secret',
    apiUrl: 'https://api.example.com/?sig=query-secret',
    log: { level: 'debug' },
    // Set, so that every field the line carries is present.
    timeout: 1234,
    retry: { maxRetries: 2 },
    pdpRetry: { maxRetries: 1 },
  });

  const init = records.find((record) => record.msg === 'Permit.io SDK initialized');
  t.truthy(init, output);
  t.is(init.pdp, 'http://pdp.example.com:7766/path');
  t.is(init.apiUrl, 'https://api.example.com');
  t.is(init.timeout, 1234);
  t.deepEqual(init.retry, { maxRetries: 2 });
  t.deepEqual(init.pdpRetry, { maxRetries: 1 });
  t.deepEqual(
    Object.keys(init)
      .filter((key) => !['level', 'time', 'label', 'msg'].includes(key))
      .sort(),
    [
      'apiUrl',
      'factsSyncTimeout',
      'factsSyncTimeoutPolicy',
      'multiTenancy',
      'pdp',
      'pdpRetry',
      'proxyFactsViaPdp',
      'retry',
      'throwOnError',
      'timeout',
    ],
  );
  for (const secret of [TOKEN, 'pdp-password', 'pdp-user', 'query-secret']) {
    t.false(output.includes(secret), secret);
  }
});

test('the init line keeps a PDP value without a scheme recognisable', (t) => {
  const { output, records } = initLog({
    pdp: 'pdp-user:pdp-password@localhost:7766',
    log: { level: 'debug' },
  });

  const init = records.find((record) => record.msg === 'Permit.io SDK initialized');
  t.truthy(init, output);
  t.is(init.pdp, 'localhost:7766');
  t.false(output.includes('pdp-password'));
});

test('the trace level does not print the token either', (t) => {
  t.false(initLog({ log: { level: 'trace' } }).output.includes(TOKEN));
});

test('log.json no longer stops the client from starting', (t) => {
  t.notThrows(() => initLog({ log: { json: true } }));
  for (const value of ['true', 'True', '', 'yes', '1']) {
    t.notThrows(() => initLog({}, { PERMIT_LOG_JSON: value }), value);
  }
});
