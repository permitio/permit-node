#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeOpenApi } from '#scripts/normalize-openapi.mjs';
import { generateOpenApi } from '#scripts/openapi-generator.mjs';
import { assertModelShapes } from '#scripts/openapi-shapes.mjs';
import { loadReviewedOpenApi } from '#scripts/openapi-source.mjs';

/** Compares the complete TypeScript tree, including removed and added files. */
export function assertSameOutput(expected, actual, context) {
  const files = new Set(
    [
      ...readdirSync(expected, { recursive: true }),
      ...readdirSync(actual, { recursive: true }),
    ].filter((file) => file.endsWith('.ts')),
  );
  for (const file of [...files].sort()) {
    let left;
    let right;
    try {
      left = readFileSync(join(expected, file));
      right = readFileSync(join(actual, file));
    } catch (cause) {
      throw new Error(`${context}: generated file ${file} was added or removed.`, { cause });
    }
    if (!left.equals(right)) throw new Error(`${context}: generated file ${file} differs.`);
  }
}

/**
 * Regenerates from the reviewed offline snapshot, or checks two runs and committed output.
 *
 * @param root - Repository with the pinned toolchain installed.
 * @param check - Verify determinism and committed output without changing SDK files.
 * @throws If generation, schema/type validation, normalization or comparison fails.
 */
export async function regenerateOpenApi(root, check = false) {
  const spec = loadReviewedOpenApi(root);
  const work = mkdtempSync(join(root, '.openapi-'));
  try {
    const input = join(work, 'input.json');
    const formatConfig = join(work, '.oxfmtrc.json');
    const formatter = JSON.parse(readFileSync(join(root, '.oxfmtrc.json'), 'utf8'));
    // The staged target contains only generated source; repository exclusions must not hide it.
    writeFileSync(formatConfig, JSON.stringify({ ...formatter, ignorePatterns: [] }));
    writeFileSync(input, JSON.stringify(spec));
    async function generate(name) {
      const stage = join(work, name);
      const generated = join(stage, 'generated');
      const files = await generateOpenApi({ root, input, output: generated });
      cpSync(join(root, 'src'), join(stage, 'src'), {
        recursive: true,
        filter: (file) => relative(join(root, 'src'), file) !== 'openapi',
      });
      cpSync(join(root, 'tsconfig.build.json'), join(stage, 'tsconfig.build.json'));
      symlinkSync(join(root, 'node_modules'), join(stage, 'node_modules'), 'junction');
      const output = join(stage, 'src/openapi');
      for (const file of files) {
        mkdirSync(dirname(join(output, file)), { recursive: true });
        cpSync(join(generated, file), join(output, file));
      }
      normalizeOpenApi(stage);
      execFileSync(
        process.execPath,
        [join(root, 'node_modules/oxfmt/bin/oxfmt'), '--config', formatConfig, '--write', output],
        { cwd: root, stdio: 'pipe' },
      );
      const models = join(output, 'types');
      await assertModelShapes(
        models,
        readdirSync(models).filter((file) => file.endsWith('.ts')),
      );
      return output;
    }
    const first = await generate('first');
    const committed = join(root, 'src/openapi');
    if (check) {
      const second = await generate('second');
      assertSameOutput(first, second, 'Generation is not deterministic');
      assertSameOutput(
        first,
        committed,
        'Committed output is stale; run pnpm generate-openapi-client',
      );
      console.log('OpenAPI check OK: two clean generations and committed output match.');
    } else {
      const previous = join(work, 'previous');
      renameSync(committed, previous);
      try {
        renameSync(first, committed);
      } catch (cause) {
        renameSync(previous, committed);
        throw cause;
      }
      console.log('OpenAPI generation OK: reviewed, validated and normalized output installed.');
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
      throw new Error('Usage: node scripts/generate-openapi.mjs [--check]');
    }
    await regenerateOpenApi(
      resolve(dirname(fileURLToPath(import.meta.url)), '..'),
      args[0] === '--check',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
