import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

// These generator diagnostics have specific contract tests; all other warnings fail generation.
const KNOWN_WARNINGS = [
  'OpenAPI 3.1 support is still in beta. To report an issue related to 3.1 spec, please kindly open an issue in the Github repo: https://github.com/openAPITools/openapi-generator.',
  'Failed to get the schema name: null', // The checked callback tuple repair below preserves its type.
  // The generator safely renames the inline Object model; its emitted shape is checked with all models.
  'Object (model name matches existing language type) cannot be used as a model name. Renamed to ModelObject',
];

/** Loads the single generator configuration shared by regeneration and both CI guards. */
export function generatorOptions(root) {
  const path = join(root, 'openapi/generator.json');
  const config = JSON.parse(readFileSync(path, 'utf8'));
  if (config.generatorName !== 'typescript-axios')
    throw new Error('Expected typescript-axios generator.');
  const allowed = ['generatorName', 'additionalProperties', 'globalProperties', 'typeMappings'];
  if (Object.keys(config).some((key) => !allowed.includes(key)))
    throw new Error('Unsupported generator configuration option.');
  if (config.typeMappings?.set !== 'Array' || Object.keys(config.typeMappings).length !== 1) {
    throw new Error('Generator typeMappings must preserve unique JSON arrays with set: Array.');
  }
  for (const key of ['apiPackage', 'modelPackage']) {
    if (!/^[a-z][a-z0-9-]*$/i.test(config.additionalProperties?.[key] ?? '')) {
      throw new Error(`Generator ${key} must be a single directory name.`);
    }
  }
  return config;
}

/** Checks completion metadata and every generated TypeScript file before consuming output. */
export function assertGeneratedComplete(output, pin) {
  const metadata = join(output, '.openapi-generator');
  for (const file of ['VERSION', 'FILES']) {
    if (!existsSync(join(metadata, file)))
      throw new Error(`Missing completion metadata ${file}; rerun generation.`);
  }
  const version = readFileSync(join(metadata, 'VERSION'), 'utf8').trim();
  if (version !== pin)
    throw new Error(`Generator ran ${version}, but openapitools.json pins ${pin}.`);
  const manifest = readFileSync(join(metadata, 'FILES'), 'utf8')
    .split(/\r?\n/)
    .filter((file) => file.endsWith('.ts'));
  if (manifest.length === 0)
    throw new Error('Completion manifest FILES lists no TypeScript files.');
  for (const file of manifest) {
    if (file.startsWith('/') || file.split('/').includes('..') || !existsSync(join(output, file))) {
      throw new Error(`Incomplete generation: manifest file ${file} is missing or invalid.`);
    }
  }
  const actual = readdirSync(output, { recursive: true }).filter((file) => file.endsWith('.ts'));
  if (actual.length !== new Set(manifest).size)
    throw new Error('Generated files differ from the completion manifest FILES.');
  return manifest;
}

/** Restores the one tuple that the pinned generator currently widens to Array<any>. */
export function repairCallbackTuple(output, modelDirectory) {
  const file = join(output, modelDirectory, 'callbacks-inner.ts');
  const text = readFileSync(file, 'utf8');
  const expected = /^export type CallbacksInner = Array<any> \| string;$/m;
  if (!expected.test(text))
    throw new Error(
      'Callback tuple generator behavior changed; review the narrow tuple correction.',
    );
  writeFileSync(
    file,
    text.replace(
      expected,
      "import type { OPALHttpFetcherConfig } from './opalhttp-fetcher-config';\n" +
        'export type CallbacksInner = string | [string, OPALHttpFetcherConfig];',
    ),
  );
}

/** Preserves explicit SDK API/PDP routing when the injected Axios instance has a baseURL. */
export function repairRequestRouting(output) {
  const file = join(output, 'common.ts');
  const text = readFileSync(file, 'utf8');
  const original =
    "(axios.defaults.baseURL ? '' : configuration?.basePath ?? basePath) + axiosArgs.url";
  if (text.split(original).length !== 2) {
    throw new Error(
      'Generated request routing changed; review the explicit SDK base-path correction.',
    );
  }
  writeFileSync(
    file,
    text.replace(original, '(configuration?.basePath || basePath) + axiosArgs.url'),
  );
}

/** Restores the reviewed Axios return type without asserting a generic Promise shape. */
export function repairRequestReturnType(output) {
  const file = join(output, 'common.ts');
  let text = readFileSync(file, 'utf8');
  for (const [original, replacement] of [
    [': Promise<R> => {', ': ReturnType<typeof globalAxios.request<T, R>> => {'],
    [
      'axios.request<T, R>(axiosRequestArgs) as Promise<R>',
      'axios.request<T, R>(axiosRequestArgs)',
    ],
  ]) {
    if (text.split(original).length !== 2) {
      throw new Error(
        'Generated Axios return type changed; review the generic return-type correction.',
      );
    }
    text = text.replace(original, replacement);
  }
  writeFileSync(file, text);
}

/**
 * Restores five reviewed comment wraps flattened by the pinned generator.
 *
 * @param output - Completed generator output directory.
 * @param modelDirectory - Checked model directory from the shared generator configuration.
 * @param input - Prepared schema containing the five exact multiline descriptions.
 * @throws If a source description or its single generated property occurrence changes.
 */
export function repairPropertyDescriptions(output, modelDirectory, input) {
  const spec = JSON.parse(readFileSync(input, 'utf8'));
  for (const [model, property, filename] of [
    [
      'data_generator_lib__schemas__schema_opal_data__DerivationSettings',
      'superseded_by_direct_role',
      'data-generator-lib-schemas-schema-opal-data-derivation-settings',
    ],
    ...['GroupAssignment', 'GroupCreate', 'GroupReadSchema'].map((model) => [
      model,
      'group_instance_key',
      model.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).slice(1),
    ]),
    ['TenantBlockRead', 'attributes', 'tenant-block-read'],
  ]) {
    const description = spec.components?.schemas?.[model]?.properties?.[property]?.description;
    if (typeof description !== 'string' || !description.includes('\n')) {
      throw new Error(`Checked comment source for ${model}.${property} changed; review it.`);
    }
    const file = join(output, modelDirectory, filename + '.ts');
    const text = readFileSync(file, 'utf8');
    const suffix = `\n     */\n    '${property}'`;
    const original = '     * ' + description.replaceAll('\n', ' ') + suffix;
    if (text.split(original).length !== 2) {
      throw new Error(`Generated comment for ${model}.${property} changed; review the repair.`);
    }
    const wrapped = '     * ' + description.split('\n').join('\n     * ') + suffix;
    writeFileSync(file, text.replace(original, wrapped));
  }
}

/** Downloads a missing pinned JAR and verifies its reviewed digest before any Java execution. */
export async function verifyGeneratorArtifact(root) {
  const provenance = JSON.parse(readFileSync(join(root, 'openapi/provenance.json'), 'utf8'));
  const pin = JSON.parse(readFileSync(join(root, 'openapitools.json'), 'utf8'))['generator-cli']
    ?.version;
  if (!/^\d+\.\d+\.\d+$/.test(pin ?? '')) {
    throw new Error('openapitools.json must pin an explicit stable generator version.');
  }
  if (pin !== provenance.generator || !/^[a-f0-9]{64}$/.test(provenance.generatorSha256 ?? '')) {
    throw new Error('Generator pin and reviewed artifact provenance disagree.');
  }
  const jar = join(root, `node_modules/@openapitools/openapi-generator-cli/versions/${pin}.jar`);
  const expected = provenance.generatorSha256;
  function verify(bytes) {
    if (createHash('sha256').update(bytes).digest('hex') !== expected) {
      throw new Error(
        'Generator JAR hash differs from the reviewed artifact; restore the pinned archive.',
      );
    }
  }
  if (!existsSync(jar)) {
    const url = `https://repo.maven.apache.org/maven2/org/openapitools/openapi-generator-cli/${pin}/openapi-generator-cli-${pin}.jar`;
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    } catch (cause) {
      throw new Error(`Cannot download pinned generator ${pin} from Maven Central.`, { cause });
    }
    if (!response.ok)
      throw new Error(`Generator download failed with HTTP ${response.status}: ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    verify(bytes);
    mkdirSync(dirname(jar), { recursive: true });
    writeFileSync(jar, bytes);
  }
  verify(readFileSync(jar));
  return pin;
}

/**
 * Generates a prepared local schema with validation enabled and rejects unexpected warnings.
 *
 * @param options - Repository, prepared input file and fresh output directory.
 * @returns The generated TypeScript manifest.
 */
export async function generateOpenApi({ root, input, output }) {
  const config = generatorOptions(root);
  const wrapper = join(root, 'node_modules/@openapitools/openapi-generator-cli/main.js');
  if (!existsSync(wrapper))
    throw new Error('OpenAPI generator unavailable; run pnpm install first.');
  const pin = await verifyGeneratorArtifact(root);
  mkdirSync(dirname(output), { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      wrapper,
      'generate',
      '-i',
      relative(root, input),
      '-o',
      relative(root, output),
      '-c',
      'openapi/generator.json',
      '-t',
      'openapi/templates',
    ],
    {
      cwd: root,
      env: { ...process.env, PWD: root, INIT_CWD: root },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const log = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    throw new Error(
      `OpenAPI generator ${pin} failed (${result.signal ?? `exit ${result.status ?? result.error?.code}`}).\n${log}`,
      { cause: result.error },
    );
  }
  for (const warning of log.split(/\r?\n/).filter((line) => /\b(?:WARN|ERROR)\b/.test(line))) {
    if (/\bERROR\b/.test(warning) || !KNOWN_WARNINGS.some((known) => warning.endsWith(known)))
      throw new Error(`Unexpected generator diagnostic: ${warning}`);
  }
  const manifest = assertGeneratedComplete(output, pin);
  repairCallbackTuple(output, config.additionalProperties.modelPackage);
  repairRequestRouting(output);
  repairRequestReturnType(output);
  repairPropertyDescriptions(output, config.additionalProperties.modelPackage, input);
  return manifest;
}
