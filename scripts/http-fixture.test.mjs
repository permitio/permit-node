import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, onTestFinished, test } from 'vitest';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test.each([
  ['unqueued', "await fetch(api.url + '/extra');"],
  [
    'mismatched',
    `
    api.enqueue({method: 'POST', path: '/expected', body: {value: 1}}, {body: {}});
    await fetch(api.url + '/expected');
  `,
  ],
  ['unused', "api.enqueue({method: 'GET', path: '/unused'}, {body: {}});"],
])('the real HTTP fixture fails the owning test for %s requests', (_name, operation) => {
  const directory = mkdtempSync(join(tmpdir(), 'permit-http-fixture-'));
  const files = ['node_modules', 'vitest.config.mjs', 'fixture.test.mjs', 'report.json'];
  onTestFinished(() => {
    for (const file of files) unlinkSync(join(directory, file));
    rmdirSync(directory);
  });
  symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
  writeFileSync(
    join(directory, 'vitest.config.mjs'),
    `
export default {
  resolve: {alias: {'#src': ${JSON.stringify(join(root, 'src'))}}},
  test: {include: ['fixture.test.mjs']},
};
`,
  );
  writeFileSync(
    join(directory, 'fixture.test.mjs'),
    `
import {test} from 'vitest';
import {startApi} from '#src/tests/helpers/api-test-server';
test('cannot swallow fixture violations', async () => {
  const api = await startApi();
  ${operation}
});
`,
  );
  const output = join(directory, 'report.json');
  const run = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--reporter=json',
      `--outputFile=${output}`,
      '--maxWorkers=1',
    ],
    { cwd: directory, encoding: 'utf8', timeout: 15_000 },
  );
  expect(run.status, run.stderr).toBe(1);
  expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({
    success: false,
    numFailedTests: 1,
  });
});
