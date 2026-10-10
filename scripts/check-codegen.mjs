#!/usr/bin/env node
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateOpenApi, generatorOptions } from '#scripts/openapi-generator.mjs';
import { assertModelShapes } from '#scripts/openapi-shapes.mjs';
import { prepareOpenApi } from '#scripts/openapi-source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'src/tests/codegen/fixtures/openapi-3.1.0.json');
let output;
let pin = '';
try {
  if (!existsSync(join(root, 'node_modules')))
    throw new Error('Node dependencies unavailable; run pnpm install first.');
  if (!existsSync(fixture))
    throw new Error('Fixture spec not found; restore the committed fixture.');
  pin = JSON.parse(readFileSync(join(root, 'openapitools.json'), 'utf8'))['generator-cli']?.version;
  output = mkdtempSync(join(root, 'node_modules/.codegen-'));
  const input = join(output, 'input.json');
  writeFileSync(input, JSON.stringify(prepareOpenApi(JSON.parse(readFileSync(fixture, 'utf8')))));
  const generated = join(output, 'generated');
  await generateOpenApi({ root, input, output: generated });
  const types = join(generated, generatorOptions(root).additionalProperties.modelPackage);
  const files = readdirSync(types).filter((file) => file.endsWith('.ts'));
  await assertModelShapes(types, files, { fixture: true });
  console.log(
    `codegen guard OK - generator ${pin}; ${files.length} models checked for unexpected any; ` +
      '32 property shapes and 20 field requiredness checks verified',
  );
} catch (error) {
  console.error(`codegen guard FAILED (generator ${pin}):\n${error.message}`);
  process.exitCode = 1;
} finally {
  if (output) rmSync(output, { recursive: true, force: true });
}
