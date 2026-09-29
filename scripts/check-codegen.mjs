#!/usr/bin/env node
/*
 * Regenerate the pinned OpenAPI 3.1 fixture using the repository's generator and
 * package-script options. Check completion, named properties, unexpected `any`,
 * and representative 3.1 null unions. This requires Java; the Vitest regression tests
 * mock only the generator process and run without Java. See the fixture README.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = 'src/tests/codegen/fixtures/openapi-3.1.0.json';
const WRAPPER = join(ROOT, 'node_modules/@openapitools/openapi-generator-cli/main.js');

// These individual properties are intentionally unconstrained in the pinned API spec.
// No entire model is exempt from the checks below.
const FREE_FORM = new Set([
  'audit-log-model.ts:input',
  'audit-log-model.ts:result',
  'audit-log-model.ts:context',
  'detailed-audit-log-model.ts:input',
  'detailed-audit-log-model.ts:result',
  'detailed-audit-log-model.ts:context',
  'error-details.ts:additional_info',
  'generic-engine-decision-log.ts:input',
  'generic-engine-decision-log.ts:result',
  'generic-engine-decision-log.ts:context',
  'jsonpatch-action.ts:value',
  'opaengine-decision-log.ts:input',
  'opaengine-decision-log.ts:result',
  'opalhttp-fetcher-config.ts:data',
  'raw-data.ts:input',
  'raw-data.ts:result',
  'raw-data.ts:context',
  'raw-data1.ts:input',
  'raw-data1.ts:result',
  'raw-data1.ts:context',
]);
const EXPECTED = {
  'role-create.ts:key': 'string',
  'role-create.ts:extends': 'Array<string>',
  'resource-role-create.ts:extends': 'Array<string>',
  'group-assign-user.ts:tenant': 'string',
  'tenant-obj.ts:id': 'string',
  'user-obj.ts:id': 'string',
  'action-obj.ts:id': 'string',
  'codegen-probe.ts:nullable_string': 'string|null',
  'codegen-probe.ts:nullable_any_of': 'string|null',
  'codegen-probe.ts:nullable_ref': 'CodegenProbeInner|null',
  'codegen-probe.ts:nullable_array': 'Array<number>|null',
};

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read JSON at ${path}: ${err.message}. Restore or repair this file.`);
  }
}

function generateOptions() {
  const script = readJson(join(ROOT, 'package.json')).scripts?.['generate-openapi-client'];
  const tokens = typeof script === 'string' ? script.split('&&')[0].trim().split(/\s+/) : [];
  if (tokens.shift() !== 'openapi-generator-cli' || tokens.shift() !== 'generate') {
    throw new Error(
      'Expected generate-openapi-client to start with openapi-generator-cli generate.',
    );
  }
  const values = new Map();
  let skipValidation = false;
  while (tokens.length) {
    const flag = tokens.shift();
    if (['-i', '-g', '-o'].includes(flag)) {
      values.set(flag, tokens.shift());
    } else if (flag.startsWith('--additional-properties=')) {
      values.set('additional', flag.slice('--additional-properties='.length));
    } else if (flag === '--skip-validate-spec') {
      skipValidation = true;
    } else {
      throw new Error(
        `Unsupported generate-openapi-client option ${flag}; update the guard parser.`,
      );
    }
  }
  const additional = values.get('additional');
  if (values.get('-g') !== 'typescript-axios' || !additional) {
    throw new Error(
      'generate-openapi-client must specify -g typescript-axios and --additional-properties.',
    );
  }
  // The wrapper joins its arguments in a shell. Accept only unquoted option tokens.
  if (!/^[\w=,.-]+$/.test(additional)) {
    throw new Error('Unsupported additional-properties syntax; update the guard parser.');
  }
  const modelPackage = additional.split(',').find((option) => option.startsWith('modelPackage='));
  const modelDir = modelPackage?.slice('modelPackage='.length);
  if (!modelDir || !/^[\w-]+$/.test(modelDir)) {
    throw new Error('generate-openapi-client must set modelPackage to a single directory name.');
  }
  return {
    modelDir,
    args: [
      '-g',
      values.get('-g'),
      `--additional-properties=${additional}`,
      ...(skipValidation ? ['--skip-validate-spec'] : []),
    ],
  };
}

function assertComplete(out, pin, modelDir) {
  const metadata = join(out, '.openapi-generator');
  for (const name of ['VERSION', 'FILES']) {
    if (!existsSync(join(metadata, name))) {
      throw new Error(`Missing completion metadata ${name}; inspect the generator log and rerun.`);
    }
  }
  const version = readFileSync(join(metadata, 'VERSION'), 'utf8').trim();
  if (version !== pin) {
    throw new Error(
      `Generator ran ${version}, but openapitools.json pins ${pin}. Check the wrapper.`,
    );
  }
  const manifest = readFileSync(join(metadata, 'FILES'), 'utf8')
    .split(/\r?\n/)
    .filter((file) => file.startsWith(`${modelDir}/`) && file.endsWith('.ts'))
    .map((file) => file.slice(modelDir.length + 1));
  if (!manifest.length) {
    throw new Error(
      'Completion manifest FILES lists no models; inspect the generator log and rerun.',
    );
  }
  const typesDir = join(out, modelDir);
  const files = existsSync(typesDir) ? readdirSync(typesDir).filter((f) => f.endsWith('.ts')) : [];
  for (const file of manifest) {
    if (!files.includes(file)) {
      throw new Error(
        `Incomplete generation: manifest model ${file} is missing; rerun the generator.`,
      );
    }
  }
  if (files.length !== new Set(manifest).size) {
    throw new Error(
      'Generated models differ from the completion manifest FILES; rerun the generator.',
    );
  }
  return { typesDir, files };
}

function assertTypes(typesDir, files) {
  const ts = createRequire(import.meta.url)('typescript');
  function containsAny(node) {
    if (!node) return false;
    if (node.kind === ts.SyntaxKind.AnyKeyword) return true;
    // A nested dictionary is legitimate free-form data, not a collapsed model.
    if (ts.isIndexSignatureDeclaration(node)) return false;
    return Boolean(ts.forEachChild(node, containsAny));
  }

  const properties = new Map();
  const problems = [];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(join(typesDir, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    if (source.parseDiagnostics.length) {
      throw new Error(`Invalid generated TypeScript in ${file}; inspect the generator output.`);
    }
    for (const declaration of source.statements) {
      if (ts.isTypeAliasDeclaration(declaration) && containsAny(declaration.type)) {
        problems.push(`${file}: unexpected any in type alias ${declaration.name.text}`);
      }
      if (!ts.isInterfaceDeclaration(declaration)) continue;
      for (const member of declaration.members) {
        if (ts.isIndexSignatureDeclaration(member) && containsAny(member.type)) {
          problems.push(`${file}: unexpected top-level any index signature`);
        }
        if (!ts.isPropertySignature(member)) continue;
        const key = `${file}:${member.name.text}`;
        properties.set(key, member.type?.getText(source).replace(/\s+/g, ''));
        if ((!member.type || containsAny(member.type)) && !FREE_FORM.has(key)) {
          problems.push(`${key}: unexpected any (named type lost)`);
        }
      }
    }
  }
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (properties.get(key) !== expected) {
      problems.push(`${key}: expected ${expected}, got ${properties.get(key) ?? 'missing'}`);
    }
  }
  if (problems.length) {
    throw new Error(
      `${problems.length} type-shape regression(s):\n  ${problems.slice(0, 12).join('\n  ')}\n` +
        'Inspect the fixture and models before changing the generator pin or expectations.',
    );
  }
}

let out;
let generator = '';
try {
  if (!existsSync(join(ROOT, FIXTURE))) {
    throw new Error(`Fixture spec not found: ${FIXTURE}; restore the committed fixture.`);
  }
  if (readJson(join(ROOT, FIXTURE)).openapi !== '3.1.0') {
    throw new Error('The codegen fixture must declare OpenAPI 3.1.0; do not downgrade its header.');
  }
  if (!existsSync(WRAPPER)) {
    throw new Error(`openapi-generator-cli not found at ${WRAPPER}; run yarn install first.`);
  }
  const pin = readJson(join(ROOT, 'openapitools.json'))['generator-cli']?.version;
  if (typeof pin !== 'string' || !/^\d+\.\d+\.\d+$/.test(pin)) {
    throw new Error('openapitools.json must pin an explicit stable generator version.');
  }
  generator = ` (generator ${pin})`;
  const { args, modelDir } = generateOptions();
  // Relative paths survive the wrapper's shell join even when ROOT or TMPDIR has spaces.
  out = mkdtempSync(join(ROOT, 'node_modules/.codegen-'));
  try {
    execFileSync(
      process.execPath,
      [WRAPPER, 'generate', '-i', FIXTURE, '-o', relative(ROOT, out), ...args],
      { cwd: ROOT, env: { ...process.env, PWD: ROOT, INIT_CWD: ROOT }, stdio: 'inherit' },
    );
  } catch (err) {
    const reason = err.signal ? `signal ${err.signal}` : `exit ${err.status ?? err.code}`;
    throw new Error(
      `openapi-generator-cli ${pin} aborted (${reason}). ` +
        'Check Java 11+ on PATH, access to Maven Central, and the generator output above.',
    );
  }
  const { typesDir, files } = assertComplete(out, pin, modelDir);
  assertTypes(typesDir, files);
  console.log(
    `codegen guard OK - generator ${pin}; ${files.length} models checked for unexpected any; ` +
      `${Object.keys(EXPECTED).length} property shapes verified`,
  );
} catch (err) {
  console.error(`codegen guard FAILED${generator}:\n${err.message}`);
  process.exitCode = 1;
} finally {
  if (out) rmSync(out, { recursive: true, force: true });
}
