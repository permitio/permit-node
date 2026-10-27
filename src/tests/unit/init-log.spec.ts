import { spawnSync } from 'child_process';
import path from 'path';

import test from 'ava';

// A token value that only this test uses.
const TOKEN = 'permit_key_init_log_test_0123456789abcdef';

// The SDK's logger writes to the process's stdout file descriptor, so run a client in a
// child process and read what it printed.
function initLogOutput(level: string): string {
  const sdk = path.resolve(__dirname, '../../index.js');
  const script = `
    const { Permit } = require(${JSON.stringify(sdk)});
    new Permit({ token: ${JSON.stringify(TOKEN)}, log: { level: ${JSON.stringify(level)} } });
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`the client failed to start: ${result.stderr}`);
  }
  return result.stdout + result.stderr;
}

test('the debug init log carries the PDP and API URL only', (t) => {
  const output = initLogOutput('debug');

  t.true(output.includes('Permit.io SDK initialized'), output);
  t.true(output.includes('http://localhost:7766'), output);
  t.false(output.includes(TOKEN));
});

test('no log level prints the configured token', (t) => {
  for (const level of ['trace', 'debug', 'info', 'warn', 'error']) {
    t.false(initLogOutput(level).includes(TOKEN), level);
  }
});
