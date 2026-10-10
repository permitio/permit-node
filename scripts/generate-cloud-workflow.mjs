import { buildSync } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const allowedInputs = new Set([
  'scripts/cloud-workflow-entry.mjs',
  ...['cloud-http', 'cloud-closure', 'cloud-environment', 'cloud-fixture', 'cloud-lifecycle'].map(
    (name) => `scripts/${name}.mjs`,
  ),
]);

const steps = {
  SETUP: 'setupTrustedCloud',
  HANDOFF: 'handoffTrustedCloud',
  CLEANUP: 'cleanupTrustedCloud',
};

/**
 * Bundles reviewed public lifecycle code into fixed pre-checkout steps with only Node builtins.
 * @param options - Source root and whether to replace the three existing workflow blocks.
 * @returns The exact generated workflow; no candidate or dependency code executes with a broad key.
 * @throws When block boundaries, bundled imports or generated source diverge.
 */
export function generateCloudWorkflow({ root, write = false }) {
  const temp = mkdtempSync(join(tmpdir(), 'permit-cloud-bundle-'));
  try {
    const config = join(temp, 'format.json');
    writeFileSync(config, JSON.stringify({ printWidth: 90, singleQuote: true, semi: true }));
    const path = join(root, '.github/workflows/ci.yaml');
    let workflow = readFileSync(path, 'utf8');
    for (const [name, entry] of Object.entries(steps)) {
      const bundle = buildSync({
        stdin: {
          contents: `import { ${entry} } from '#scripts/cloud-lifecycle.mjs';
import { join } from 'node:path';
try {
 await ${entry}({directory:join(process.env.RUNNER_TEMP,'cloud-acceptance')});
 console.log('Trusted cloud ${name.toLowerCase()} completed.');
} catch {
 console.error('Trusted cloud lifecycle failed; no cleanup credit.');
 process.exitCode=1;
}`,
          resolveDir: join(root, 'scripts'),
          sourcefile: 'cloud-workflow-entry.mjs',
          loader: 'js',
        },
        absWorkingDir: root,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node22',
        write: false,
        treeShaking: true,
        metafile: true,
        logLevel: 'silent',
      });
      if (
        bundle.errors.length ||
        bundle.warnings.length ||
        Object.keys(bundle.metafile.inputs).some((input) => !allowedInputs.has(input)) ||
        Object.values(bundle.metafile.outputs).some((output) =>
          output.imports.some((imported) => !imported.path.startsWith('node:')),
        )
      )
        throw new Error('Trusted bundle includes an unsupported runtime dependency.');
      const formatted = execFileSync(
        process.execPath,
        [
          join(root, 'node_modules/oxfmt/bin/oxfmt'),
          '--config',
          config,
          '--stdin-filepath',
          'cloud-workflow-entry.mjs',
        ],
        { input: bundle.outputFiles[0].text, encoding: 'utf8', timeout: 30_000 },
      );
      const start = `          # BEGIN TRUSTED_CLOUD_${name}`;
      const end = `          # END TRUSTED_CLOUD_${name}`;
      if (workflow.split(start).length !== 2 || workflow.split(end).length !== 2)
        throw new Error('Trusted workflow block is missing or repeated.');
      const begin = workflow.indexOf(start),
        endIndex = workflow.indexOf(end, begin);
      if (endIndex < begin) throw new Error('Trusted workflow block is missing or repeated.');
      const finish = endIndex + end.length;
      const block = [
        start,
        '          set -euo pipefail',
        "          node --input-type=module <<'NODE'",
        ...formatted
          .trimEnd()
          .split('\n')
          .map((line) => (line ? '          ' + line : '')),
        '          NODE',
        end,
      ].join('\n');
      workflow = workflow.slice(0, begin) + block + workflow.slice(finish);
    }
    if (write) writeFileSync(path, workflow);
    return workflow;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/** Updates or checks generated fixed workflow blocks without executing the cloud lifecycle. */
export function main(args = process.argv.slice(2), root = resolve(import.meta.dirname, '..')) {
  try {
    if (args.length !== 1 || !['--write', '--check'].includes(args[0]))
      throw new Error('Invalid mode.');
    const result = generateCloudWorkflow({ root, write: args[0] === '--write' });
    if (
      args[0] === '--check' &&
      result !== readFileSync(join(root, '.github/workflows/ci.yaml'), 'utf8')
    )
      throw new Error('Trusted workflow bundles differ from reviewed public lifecycle code.');
    console.log('Trusted cloud workflow bundles match reviewed public lifecycle code.');
    return 0;
  } catch {
    console.error('Trusted cloud workflow generation failed.');
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = main();
