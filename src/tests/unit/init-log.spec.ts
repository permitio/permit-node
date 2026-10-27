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

test('the debug init line carries the endpoint origins and settings, nothing else', (t) => {
  const { output, records } = initLog({
    pdp: 'http://pdp-user:pdp-password@pdp.example.com:7766/path?key=query-secret',
    apiUrl: 'https://api.example.com/?sig=query-secret',
    log: { level: 'debug' },
  });

  const init = records.find((record) => record.msg === 'Permit.io SDK initialized');
  t.truthy(init, output);
  t.is(init.pdp, 'http://pdp.example.com:7766');
  t.is(init.apiUrl, 'https://api.example.com');
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
    ].filter((key) => key in init),
  );
  for (const secret of [TOKEN, 'pdp-password', 'pdp-user', 'query-secret']) {
    t.false(output.includes(secret), secret);
  }
});

test('the trace level does not print the token either', (t) => {
  t.false(initLog({ log: { level: 'trace' } }).output.includes(TOKEN));
});

test('log.json no longer stops the client from starting', (t) => {
  t.notThrows(() => initLog({ log: { json: true } }));
  t.notThrows(() => initLog({}, { PERMIT_LOG_JSON: 'true' }));
});
