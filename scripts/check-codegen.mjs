#!/usr/bin/env node
/*
 * Codegen guard — regenerates the typescript-axios client from a pinned OpenAPI 3.1.0
 * fixture through the real generate pipeline (the same `openapi-generator-cli` and the
 * same --additional-properties flags as `yarn generate-openapi-client`, with the
 * generator version resolved from openapitools.json), then asserts the output is fully
 * typed. It fails (non-zero) when the generator silently degrades named properties to
 * `any` — which is what happens when the pinned generator cannot model the 3.1 spec.
 *
 * Two complementary checks catch the degradation:
 *   (a) a tree-wide scan for the `[key: string]: any;` index signature the collapse emits;
 *   (b) positive canaries — named scalar properties that must stay typed. The canaries also
 *       cover the partial-collapse class where a property degrades to a bare `'prop': any;`
 *       WITHOUT an index signature (e.g. the *-obj / group-assign-user types under 6.2.1),
 *       which check (a) alone would not see.
 *
 * It runs OUTSIDE the ava `test:*` suites: it needs Java and a generator run that does
 * not fit ava's per-test budget, so CI wires it as its own Java-provisioned job
 * (.github/workflows/ci.yaml `codegen-guard`). Run locally with `node scripts/check-codegen.mjs`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'src/tests/codegen/fixtures/openapi-3.1.0.json');
const WRAPPER = join(ROOT, 'node_modules/.bin/openapi-generator-cli');

// the exact typescript-axios flags from the generate-openapi-client script (package.json)
const ADDL =
  'useSingleRequestParameter=true,withSeparateModelsAndApi=true,apiPackage=api,modelPackage=types';
// Only these two may retain the known generator-7.x allOf+default residual (a separate,
// narrower mechanism). Any OTHER all-`any` collapse is the regression this guard catches.
const ALLOWED_RESIDUAL = new Set(['derived-role-rule-create.ts', 'derived-role-block-edit.ts']);
const COLLAPSE = /\[key: string\]: any;/;

// Positive canaries: named scalar props that a 3.1-native generator types correctly but the
// pinned 6.2.1 degrades to `any`. role-create.ts carries the index signature under 6.2.1 (so it
// also trips check (a)); the *-obj / group-assign-user types degrade to a bare `'prop': any;`
// with NO index signature, so they guard the partial-collapse class (a) cannot see.
const CANARIES = [
  { file: 'role-create.ts', prop: 'key' },
  { file: 'group-assign-user.ts', prop: 'tenant' },
  { file: 'tenant-obj.ts', prop: 'id' },
  { file: 'user-obj.ts', prop: 'id' },
  { file: 'action-obj.ts', prop: 'id' },
];

let out = null; // module-scoped so fail() can clean the temp dir up before exiting
function cleanup() {
  if (out) {
    rmSync(out, { recursive: true, force: true });
    out = null;
  }
}

function fail(msg) {
  cleanup(); // process.exit() skips the `finally`, so release the temp dir here too
  console.error('codegen guard FAILED:\n' + msg);
  console.error(
    '\nThe pinned OpenAPI generator cannot type the 3.1.0 spec. ' +
      'openapitools.json must pin a 3.1-native generator (>= 7.12.0).',
  );
  process.exit(1);
}

if (!existsSync(FIXTURE)) fail(`fixture spec not found: ${FIXTURE}`);
if (!existsSync(WRAPPER))
  fail(`openapi-generator-cli not found — run \`yarn install\` first: ${WRAPPER}`);

out = mkdtempSync(join(tmpdir(), 'codegen-guard-'));
try {
  // real pipeline: the wrapper resolves the generator version from openapitools.json (cwd = ROOT)
  try {
    execFileSync(
      WRAPPER,
      [
        'generate',
        '-i',
        FIXTURE,
        '-g',
        'typescript-axios',
        '-o',
        out,
        `--additional-properties=${ADDL}`,
        '--skip-validate-spec',
      ],
      { cwd: ROOT, stdio: 'inherit' },
    );
  } catch (err) {
    // a generator that aborts (e.g. an NPE on an unsupported pin) should fail with the clean
    // diagnostic, not a raw Node exception dump
    fail(
      `openapi-generator-cli aborted (exit ${
        err && err.status != null ? err.status : '?'
      }) — the pinned generator could not complete the generate pipeline.`,
    );
  }

  const typesDir = join(out, 'types');
  const files = existsSync(typesDir) ? readdirSync(typesDir).filter((f) => f.endsWith('.ts')) : [];
  if (files.length < 300) {
    fail(`generator produced only ${files.length} type files (< 300) — generation likely failed`);
  }

  // (a) tree-wide: no type file may collapse to all-`any` (index signature) except the tracked residual
  const collapsed = files.filter((f) => COLLAPSE.test(readFileSync(join(typesDir, f), 'utf8')));
  const unexpected = collapsed.filter((f) => !ALLOWED_RESIDUAL.has(f));
  if (unexpected.length) {
    fail(
      `${unexpected.length} type file(s) collapsed to all-\`any\` (named properties lost):\n  ` +
        unexpected.slice(0, 12).join('\n  ') +
        (unexpected.length > 12 ? `\n  ... (+${unexpected.length - 12} more)` : ''),
    );
  }

  // (b) canaries: each named scalar prop must stay typed (not `any`) — also catches the
  // bare-`'prop': any;` partial collapse that carries no index signature
  for (const { file, prop } of CANARIES) {
    const p = join(typesDir, file);
    if (!existsSync(p)) {
      fail(`canary type file missing: ${file} — generator output shape changed`);
    }
    const src = readFileSync(p, 'utf8');
    if (COLLAPSE.test(src)) {
      fail(`canary ${file} collapsed to all-\`any\` (\`[key: string]: any;\` present)`);
    }
    const present = new RegExp(`'${prop}'\\??:\\s`);
    const degraded = new RegExp(`'${prop}'\\??:\\s*any\\b`);
    if (!present.test(src)) {
      fail(
        `canary ${file}: expected property '${prop}' not found — generator output shape changed`,
      );
    }
    if (degraded.test(src)) {
      fail(`canary ${file}: property '${prop}' degraded to \`any\` (named type lost)`);
    }
  }

  console.log(
    `codegen guard OK - ${files.length} type files fully typed ` +
      `(${collapsed.length} known residual: ${collapsed.join(', ') || 'none'}; ` +
      `${CANARIES.length} canaries typed)`,
  );
} finally {
  cleanup();
}
