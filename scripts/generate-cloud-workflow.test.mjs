import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, onTestFinished, test, vi } from 'vitest';

import { generateCloudWorkflow, main } from '#scripts/generate-cloud-workflow.mjs';

const root = resolve(import.meta.dirname, '..');
function temporary() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'permit-cloud-workflow-')));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function fixture() {
  const directory = temporary();
  mkdirSync(join(directory, 'scripts'));
  mkdirSync(join(directory, '.github/workflows'), { recursive: true });
  symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
  for (const name of [
    'package.json',
    'cloud-http.mjs',
    'cloud-closure.mjs',
    'cloud-environment.mjs',
    'cloud-fixture.mjs',
    'cloud-lifecycle.mjs',
  ])
    writeFileSync(join(directory, 'scripts', name), readFileSync(join(root, 'scripts', name)));
  writeFileSync(
    join(directory, '.github/workflows/ci.yaml'),
    readFileSync(join(root, '.github/workflows/ci.yaml')),
  );
  return directory;
}
function program(workflow, name) {
  const start = '# BEGIN TRUSTED_CLOUD_' + name,
    end = '# END TRUSTED_CLOUD_' + name;
  const block = workflow.slice(workflow.indexOf(start), workflow.indexOf(end));
  return block
    .slice(block.indexOf("<<'NODE'\n") + 9, block.lastIndexOf('          NODE'))
    .split('\n')
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
}

test('fixed pre-checkout bundles are exact reviewed public source with no runtime packages', () => {
  const workflow = readFileSync(join(root, '.github/workflows/ci.yaml'), 'utf8');
  expect(generateCloudWorkflow({ root })).toBe(workflow);
  for (const name of ['SETUP', 'HANDOFF', 'CLEANUP']) {
    const source = program(workflow, name);
    expect(source).toContain('node:');
    expect(source).not.toContain('node_modules');
    expect(source).not.toContain('PROJECT_API_KEY=');
    expect(source.split('\n').every((line) => line.length <= 90)).toBe(true);
  }
});

test.each(['SETUP', 'HANDOFF', 'CLEANUP'])(
  'actual trusted %s bundle refuses untrusted metadata before HTTP and prints no credential',
  (name) => {
    const workflow = readFileSync(join(root, '.github/workflows/ci.yaml'), 'utf8');
    const result = spawnSync(process.execPath, ['--input-type=module'], {
      input:
        "let calls=0;globalThis.fetch=()=>{calls++;throw new Error('NO_NETWORK');};" +
        "process.on('exit',()=>console.log('http-count='+calls));\n" +
        program(workflow, name),
      env: { PATH: process.env.PATH, RUNNER_TEMP: temporary(), PROJECT_API_KEY: 'PRIVATE_CANARY' },
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('http-count=0\n');
    expect(result.stderr).toBe(
      (name === 'HANDOFF' ? '' : 'Cloud lifecycle diagnostic: lifecycle:trusted-run\n') +
        'Trusted cloud lifecycle failed; no cleanup credit.\n',
    );
    expect(result.stdout + result.stderr).not.toContain('PRIVATE_CANARY');
  },
);

test('additional local runtime source cannot be silently embedded into the broad-key steps', () => {
  const directory = fixture();
  writeFileSync(
    join(directory, 'scripts/foreign-helper.mjs'),
    "globalThis.FOREIGN_SOURCE='PRIVATE_CANARY';\n",
  );
  const path = join(directory, 'scripts/cloud-http.mjs');
  writeFileSync(path, "import '#scripts/foreign-helper.mjs';\n" + readFileSync(path, 'utf8'));
  expect(() => generateCloudWorkflow({ root: directory })).toThrow(
    'unsupported runtime dependency',
  );
});

test.each(['missing', 'duplicate'])(
  'refuses %s fixed workflow boundaries instead of rewriting an arbitrary step',
  (kind) => {
    const directory = fixture(),
      path = join(directory, '.github/workflows/ci.yaml');
    const marker = '# BEGIN TRUSTED_CLOUD_SETUP';
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        marker,
        kind === 'missing' ? '' : marker + '\n          ' + marker,
      ),
    );
    expect(() => generateCloudWorkflow({ root: directory })).toThrow('missing or repeated');
  },
);

test('actual generation CLI rejects unknown modes with a static diagnostic', () => {
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  onTestFinished(() => output.mockRestore());
  expect(main(['PRIVATE_CANARY'], root)).toBe(1);
  expect(output.mock.calls).toEqual([['Trusted cloud workflow generation failed.']]);
});
