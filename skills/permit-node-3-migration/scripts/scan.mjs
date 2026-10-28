import { lstat, open, readdir, readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// The compiler and semver come only from this skill's own node_modules, at the exact versions its
// package.json pins. Node's normal resolution would continue into the scanned project's (or any
// ancestor's) node_modules when the skill's own install is missing, so both are resolved from the
// skill's manifest, checked to lie inside the skill and to carry the pinned version, and only
// then loaded. See loadPrerequisites().
let ts;
let semver;

/** A missing or foreign scanner prerequisite: an installation failure, never a clean scan. */
export class PrerequisiteError extends Error {}

let prerequisites;

async function packageVersion(entry, name, own) {
  for (let directory = dirname(entry); directory.startsWith(own); directory = dirname(directory)) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (manifest?.name === name) return manifest.version;
  }
  return undefined;
}

/**
 * Loads the pinned TypeScript compiler and semver from this skill's own installation.
 *
 * @returns {Promise<void>} Resolves once both are loaded.
 * @throws {PrerequisiteError} When either is missing, resolves outside the skill's
 * node_modules, or has a version other than the skill's pin.
 */
export function loadPrerequisites() {
  prerequisites ??= (async () => {
    const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const manifestPath = join(skill, 'package.json');
    let own, pins;
    try {
      own = join(await realpath(skill), 'node_modules') + sep;
      pins = JSON.parse(await readFile(manifestPath, 'utf8')).dependencies;
    } catch (error) {
      throw new PrerequisiteError(`Cannot read the scanner manifest: ${error.message}`);
    }
    if (
      !pins ||
      Object.keys(pins).sort().join() !== 'semver,typescript' ||
      !Object.values(pins).every((version) => /^\d+\.\d+\.\d+$/u.test(version))
    )
      throw new PrerequisiteError('The scanner manifest must pin exact typescript and semver.');
    const require = createRequire(manifestPath);
    const loaded = {};
    for (const name of ['typescript', 'semver']) {
      const install = `install the skill's locked prerequisites (see SKILL.md) in ${dirname(own)}`;
      let entry;
      try {
        entry = await realpath(require.resolve(name));
      } catch {
        throw new PrerequisiteError(`${name} ${pins[name]} is not installed; ${install}.`);
      }
      if (!entry.startsWith(own))
        throw new PrerequisiteError(
          `${name} resolved outside the skill's own node_modules (${entry}); ${install}.`,
        );
      const version = await packageVersion(entry, name, own);
      if (version !== pins[name])
        throw new PrerequisiteError(
          `${name} ${version ?? 'of unknown version'} is installed, but the skill pins ` +
            `${pins[name]}; ${install}.`,
        );
      try {
        loaded[name] = (await import(pathToFileURL(entry).href)).default;
      } catch (error) {
        throw new PrerequisiteError(`Cannot load ${name} ${pins[name]}: ${error.message}`);
      }
    }
    if (loaded.typescript?.version !== pins.typescript)
      throw new PrerequisiteError('The loaded TypeScript compiler does not match its pin.');
    ts = loaded.typescript;
    semver = loaded.semver;
  })();
  return prerequisites;
}

const FLAT = {
  listUsers: '(await api.users.list()).data',
  listRoles: 'api.roles.list()',
  listConditionSets: 'api.conditionSets.list({ type, page, perPage })',
  listConditionSetsRules: 'api.conditionSetRules.list({ page, perPage })',
  getUser: 'api.users.get(key)',
  getTenant: 'api.tenants.get(key)',
  listTenants: 'api.tenants.list({ page })',
  getRole: 'api.roles.get(key)',
  getAssignedRoles: 'api.users.getAssignedRoles({ user, tenant })',
  createResource: 'api.resources.create(data)',
  updateResource: 'api.resources.update(key, data)',
  deleteResource: 'api.resources.delete(key)',
  createUser: 'api.users.create(data)',
  syncUser: '(await api.users.sync(data)).user',
  updateUser: 'api.users.update(key, data)',
  deleteUser: 'api.users.delete(key)',
  createTenant: 'api.tenants.create(data)',
  updateTenant: 'api.tenants.update(key, data)',
  deleteTenant: 'api.tenants.delete(key)',
  createRole: 'api.roles.create(data)',
  updateRole: 'api.roles.update(key, data)',
  deleteRole: 'api.roles.delete(key)',
  assignRole: 'api.users.assignRole(data)',
  unassignRole: 'api.users.unassignRole(data)',
  createConditionSet: 'api.conditionSets.create(data)',
  updateConditionSet: 'api.conditionSets.update(key, data)',
  deleteConditionSet: 'api.conditionSets.delete(key)',
  assignConditionSetRule: 'api.conditionSetRules.create(data)',
  unassignConditionSetRule: 'api.conditionSetRules.delete(data)',
};
const REMOVED = new Set([
  'DeprecatedApiClient',
  'IDeprecatedPermitApi',
  'IDeprecatedReadApis',
  'IDeprecatedWriteApis',
  'ContextTransform',
]);
const GROUPS = new Set([
  'users',
  'tenants',
  'roles',
  'resources',
  'conditionSets',
  'conditionSetRules',
  'roleAssignments',
  'resourceInstances',
  'relationshipTuples',
  'resourceRelations',
  'resourceActions',
  'actionGroups',
  'resourceAttributes',
  'resourceRoles',
  'groups',
  'pdps',
  'projects',
  'environments',
]);
const SOURCE = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);
const WRAPPERS = new Set(['.vue', '.svelte', '.astro', '.mdx']);
const HTML = new Set(['.html', '.htm']);
// Excluded wherever they appear.
const DEPENDENCY_DIRECTORIES = new Set(['node_modules', '.git']);
// Excluded only directly inside a package root (a directory with a package.json), so a source
// folder that happens to be called build or dist deeper in the tree is still scanned.
const OUTPUT_DIRECTORIES = new Set(['build', 'dist', 'coverage', '.next']);
const RUNTIME_PINS = new Set(['.nvmrc', '.node-version', '.tool-versions', 'Dockerfile']);
// An extensionless file with one of these interpreters in its shebang is a script source.
const SHEBANG = /^#![^\n]*\b(node|nodejs|ts-node|tsx|bun|deno)\b/u;
// Packages permitio 2.x installed that 3.0 no longer does (MIGRATION.md C3).
const FORMER_TRANSITIVE = new Set([
  '@bitauth/libauth',
  'axios-retry',
  'lodash',
  'path-to-regexp',
  'require-in-the-middle',
  'url-parse',
]);
// Migration IDs this scanner has no rule for; listed in every report's limitations.
export const NOT_DETECTED = ['A4', 'W1', 'W4', 'W5', 'W6'];
export const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const ERROR_TYPES = new Set(['error-type', 'connection-error-type', 'status-error-type']);
const RESULTS = {
  'users.list': 'page',
  'users.sync': 'sync',
  'users.unassignRole': 'void',
  'roleAssignments.unassign': 'void',
  'conditionSetRules.create': 'rule',
  'users.bulkUserCreate': 'bulk',
  'users.bulkUserDelete': 'bulk',
  'users.bulkUserReplace': 'bulk',
  'relationshipTuples.bulkRelationshipTuples': 'bulk',
  'relationshipTuples.bulkUnRelationshipTuples': 'bulk',
};

function sdkPath(path) {
  return path === 'permitio' || path?.startsWith('permitio/');
}

function literal(node) {
  return node && (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node))
    ? node.text
    : undefined;
}

function member(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) return literal(node.argumentExpression);
  return undefined;
}

function imported(name) {
  if (['Permit', 'default', 'IPermitClient'].includes(name)) return 'client-type';
  if (['ApiClient', 'DeprecatedApiClient', 'IPermitApi', ...REMOVED].includes(name)) {
    return name === 'ContextTransform' ? 'removed-type' : 'api-type';
  }
  if (name === 'ApiContext') return 'context-type';
  if (['IPermitConfig', 'IPermitOptions'].includes(name)) return 'config-type';
  if (['PermitApiError', 'PermitContextError'].includes(name)) return 'error-type';
  if (name === 'PermitConnectionError') return 'connection-error-type';
  if (name === 'PermitPDPStatusError') return 'status-error-type';
  return undefined;
}

/** The origin of an instance of an imported SDK type: every error class yields an error. */
function instance(origin) {
  return ERROR_TYPES.has(origin) ? 'error' : origin?.replace('-type', '');
}

function packageName(specifier) {
  if (typeof specifier !== 'string' || /^(?:[./]|node:|[a-z]+:)/u.test(specifier)) return undefined;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function property(origin, key) {
  if (!origin) return undefined;
  if (origin === 'module') return imported(key);
  if (origin === 'client') {
    if (key === 'api') return 'api';
    if (key === 'config') return 'config';
    return `client-method:${key}`;
  }
  if (origin === 'api') return GROUPS.has(key) ? `group:${key}` : `flat:${key}`;
  if (origin === 'config' && key === 'apiContext') return 'context';
  if (origin === 'config' && ['log', 'multiTenancy', 'retry', 'pdpRetry'].includes(key)) {
    return 'settings';
  }
  if (origin === 'settings') return 'settings';
  if (origin.startsWith('group:')) return `method:${origin.slice(6)}.${key}`;
  if (
    origin === 'error' &&
    ['response', 'originalError', 'request', 'formattedAxiosError'].includes(key)
  )
    return 'error';
  return undefined;
}

function sdkHandle(origin) {
  return (
    ['module', 'client', 'api', 'ambiguous', 'client-type', 'api-type'].includes(origin) ||
    ['group:', 'method:', 'flat:', 'client-method:'].some((prefix) => origin?.startsWith(prefix))
  );
}

function unwrap(node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isAwaitExpression(node) ||
      ts.isSatisfiesExpression(node))
  )
    node = node.expression;
  return node;
}

function within(root, path) {
  const name = relative(root, path);
  return name === '' || (!isAbsolute(name) && name !== '..' && !name.startsWith(`..${sep}`));
}

class DeadlineError extends Error {}

/**
 * Scans supported customer files without executing code or changing the project.
 *
 * @param {string} directory - Customer project directory.
 * @param {object} [options] - Optional limits.
 * @param {number} [options.maxFileBytes] - Larger files are not read and make coverage incomplete.
 * @param {number} [options.deadlineMs] - Ends the scan INCOMPLETE once this many ms have passed.
 * @returns {Promise<object>} Findings and independent traversal/parser completeness information.
 * @throws {PrerequisiteError} When the skill's own pinned compiler or semver is unavailable.
 */
export async function scan(directory, options = {}) {
  await loadPrerequisites();
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const deadline =
    options.deadlineMs === undefined ? Infinity : Date.now() + Number(options.deadlineMs);
  const report = {
    status: 'COMPLETE',
    findings: [],
    failures: [],
    scanned: [],
    excluded: [],
    limitations: [
      'Syntax and local binding provenance do not prove business or authorization semantics.',
      'Dynamic SDK sites and escaped values require review; external modules are never executed.',
      'Runtime metadata supports package.json and literal Node pins, not arbitrary configuration.',
      'Exclusions are not inspected; unsupported source wrappers make the scan incomplete.',
      'node_modules and .git are excluded everywhere; build, dist, coverage and .next only ' +
        'directly inside a directory that has a package.json.',
      `Files over ${maxFileBytes} bytes are not read and make the scan incomplete.`,
      `No rule detects ${NOT_DETECTED.join(', ')}; review those IDs manually. ` +
        'N1–N3 are optional additions, not required migrations.',
    ],
  };
  let root;
  try {
    root = await realpath(resolve(directory));
    if (!(await lstat(root)).isDirectory()) throw new Error('Expected a project directory.');
  } catch (error) {
    report.failures.push({ path: directory, reason: `Cannot read scan root: ${error.message}` });
    return finish(report);
  }
  const files = new Map();
  // Shebang scripts are parsed under a virtual JS/TS name; report paths use the real one.
  const display = new Map();
  const declared = new Map();
  const checkDeadline = () => {
    if (Date.now() > deadline) throw new DeadlineError();
  };
  async function walk(path) {
    checkDeadline();
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (error) {
      report.failures.push({ path: relative(root, path), reason: `Cannot read: ${error.code}` });
      return;
    }
    const packageRoot = entries.some((entry) => entry.name === 'package.json' && entry.isFile());
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      checkDeadline();
      const full = join(path, entry.name);
      const name = relative(root, full).split(sep).join('/');
      if (entry.isSymbolicLink()) {
        try {
          const target = await realpath(full);
          report.excluded.push({ path: name, reason: 'Symlink is not followed.' });
          if (!within(root, target)) {
            report.failures.push({ path: name, reason: 'Symlink escapes the scan root.' });
          }
        } catch (error) {
          report.failures.push({ path: name, reason: `Unresolvable symlink: ${error.code}` });
        }
        continue;
      }
      if (entry.isDirectory()) {
        if (DEPENDENCY_DIRECTORIES.has(entry.name)) {
          report.excluded.push({ path: name, reason: 'Dependency or Git directory.' });
        } else if (packageRoot && OUTPUT_DIRECTORIES.has(entry.name)) {
          report.excluded.push({ path: name, reason: 'Build output directory of a package.' });
        } else await walk(full);
        continue;
      }
      if (!entry.isFile()) {
        report.excluded.push({ path: name, reason: 'Not a regular file.' });
        continue;
      }
      const extension = extname(entry.name);
      if (WRAPPERS.has(extension)) {
        report.failures.push({
          path: name,
          reason: 'Unsupported source wrapper; inspect manually.',
        });
        continue;
      }
      const inspected =
        SOURCE.has(extension) ||
        HTML.has(extension) ||
        // Extensionless files may be shebang scripts; dotfiles such as .env are never read.
        (extension === '' && !entry.name.startsWith('.')) ||
        entry.name === 'package.json' ||
        RUNTIME_PINS.has(entry.name);
      if (!inspected) {
        report.excluded.push({ path: name, reason: 'Not a supported source or metadata file.' });
        continue;
      }
      let size;
      try {
        size = (await lstat(full)).size;
      } catch (error) {
        report.failures.push({ path: name, reason: `Cannot read: ${error.code}` });
        continue;
      }
      if (size > maxFileBytes && extension === '' && !RUNTIME_PINS.has(entry.name)) {
        // Only the first line decides whether an extensionless file is a script source.
        let first = '';
        try {
          const handle = await open(full, 'r');
          try {
            const { buffer, bytesRead } = await handle.read(Buffer.alloc(256), 0, 256, 0);
            first = buffer.subarray(0, bytesRead).toString('utf8');
          } finally {
            await handle.close();
          }
        } catch (error) {
          report.failures.push({ path: name, reason: `Cannot read: ${error.code}` });
          continue;
        }
        if (!SHEBANG.test(first)) {
          report.excluded.push({ path: name, reason: 'Not a supported source or metadata file.' });
          continue;
        }
      }
      if (size > maxFileBytes) {
        report.failures.push({
          path: name,
          reason: `File is ${size} bytes, over the ${maxFileBytes}-byte scan limit; inspect manually.`,
        });
        continue;
      }
      if (entry.name === 'package.json') {
        await metadata(full, name, report, declared);
      } else if (RUNTIME_PINS.has(entry.name)) {
        await runtimePin(full, name, report);
      } else {
        let text;
        try {
          text = await readFile(full, 'utf8');
        } catch (error) {
          report.failures.push({ path: name, reason: `Cannot read source: ${error.code}` });
          continue;
        }
        if (SOURCE.has(extension)) {
          files.set(full, text);
          report.scanned.push(name);
        } else if (HTML.has(extension)) {
          if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>\s*[^\s<]/iu.test(text)) {
            report.failures.push({
              path: name,
              reason: 'Inline HTML script is not scanned; inspect manually.',
            });
          } else report.excluded.push({ path: name, reason: 'HTML without inline script.' });
        } else {
          const shebang = SHEBANG.exec(text);
          if (shebang) {
            const virtual = `${full}.permit-scan${/ts-node|tsx/u.test(shebang[1]) ? '.ts' : '.js'}`;
            files.set(virtual, text);
            display.set(virtual, name);
            report.scanned.push(name);
          } else {
            report.excluded.push({
              path: name,
              reason: 'Not a supported source or metadata file.',
            });
          }
        }
      }
    }
  }
  try {
    await walk(root);
    analyze(files, root, report, { display, declared, checkDeadline });
  } catch (error) {
    if (error instanceof DeadlineError) {
      report.failures.push({
        path: '.',
        reason: `Scan deadline of ${options.deadlineMs} ms reached; coverage is incomplete.`,
      });
    } else {
      report.failures.push({
        path: '.',
        reason: `Cannot finish source analysis: ${error.message}`,
      });
    }
  }
  if (files.size === 0) {
    report.failures.push({ path: '.', reason: 'No supported source files were scanned.' });
  }
  return finish(report);
}

function finish(report) {
  report.status = report.failures.length === 0 ? 'COMPLETE' : 'INCOMPLETE';
  report.exitCode = report.failures.length > 0 ? 2 : report.findings.length > 0 ? 1 : 0;
  return report;
}

function finding(report, data) {
  if (
    !report.findings.some(
      (item) =>
        item.id === data.id &&
        item.path === data.path &&
        item.line === data.line &&
        item.column === data.column &&
        item.action === data.action,
    )
  )
    report.findings.push(data);
}

async function metadata(full, name, report, declared) {
  try {
    const data = JSON.parse(await readFile(full, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Expected object');
    report.scanned.push(name);
    const names = new Set();
    declared.set(dirname(full), names);
    for (const section of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      if (
        data[section] !== undefined &&
        (!data[section] || typeof data[section] !== 'object' || Array.isArray(data[section]))
      )
        throw new Error(`Expected ${section} to be an object.`);
      for (const dependency of Object.keys(data[section] ?? {})) names.add(dependency);
      const version = data[section]?.permitio;
      if (version === undefined) continue;
      if (typeof version !== 'string' || !/^[~^]?3\.\d+\.\d+$/u.test(version)) {
        finding(report, {
          id: 'P1',
          path: name,
          line: 1,
          column: 1,
          classification: 'REVIEW_REQUIRED',
          action: 'Update and verify the permitio 3.0 requirement.',
          observed: version,
        });
      }
    }
    if (
      data.engines !== undefined &&
      (!data.engines || typeof data.engines !== 'object' || Array.isArray(data.engines))
    )
      throw new Error('Expected engines to be an object.');
    const nodeRange = data.engines?.node;
    if (
      nodeRange !== undefined &&
      (typeof nodeRange !== 'string' ||
        semver.validRange(nodeRange) === null ||
        semver.minVersion(nodeRange) === null ||
        !semver.subset(nodeRange, '>=22.13.0'))
    ) {
      finding(report, {
        id: 'C1',
        path: name,
        line: 1,
        column: 1,
        classification: 'REVIEW_REQUIRED',
        action: 'Require Node >=22.13.0 or a supported subset of that range.',
        observed: data.engines.node,
      });
    }
  } catch (error) {
    report.failures.push({
      path: name,
      reason: `Cannot parse/read package metadata: ${error.message}`,
    });
  }
}

async function runtimePin(full, name, report) {
  try {
    const value = (await readFile(full, 'utf8')).trim();
    report.scanned.push(name);
    const pins = [];
    if (name.endsWith('Dockerfile')) {
      const aliases = new Set();
      for (const stage of value.matchAll(/^\s*FROM\s+([^\r\n]+)$/gimu)) {
        let source = stage[1].trim();
        const platform = /^--platform=([^\s]+)\s+/u.exec(source);
        if (platform) {
          if (!/^[a-z][a-z0-9_]*\/[a-z0-9_]+(?:\/[a-z0-9_]+)?$/u.test(platform[1])) {
            pins.push(source);
            continue;
          }
          source = source.slice(platform[0].length);
        }
        const instruction = /^([^\s]+)(?:\s+AS\s+([A-Za-z0-9_.-]+))?(?:\s+#.*)?$/iu.exec(source);
        const image = instruction?.[1];
        if (!image || image.startsWith('--') || /[$\\]/u.test(image)) {
          pins.push(source);
          continue;
        }
        const node = /^(?:docker\.io\/)?(?:library\/)?node(?::(.*)|@.*)?$/u.exec(image);
        if (node && !aliases.has(image.toLowerCase())) pins.push(node[1] ?? image);
        if (instruction[2]) aliases.add(instruction[2].toLowerCase());
      }
    } else if (name.endsWith('.tool-versions')) {
      for (const pin of value.matchAll(/^nodejs\s+([^\s]+)/gmu)) pins.push(pin[1]);
    } else pins.push(value);
    for (const pin of pins) {
      const match = /^v?(\d+\.\d+\.\d+)([^@]*)(?:@(sha256:[a-f0-9]{64}))?$/u.exec(pin);
      const dockerSuffix =
        /^-(?:alpine(?:\d+(?:\.\d+)*)?|(?:bookworm|bullseye|trixie)(?:-slim)?|slim)$/u;
      const allowedSuffix =
        match &&
        (name.endsWith('Dockerfile')
          ? match[2] === '' || dockerSuffix.test(match[2])
          : match[2] === '' && match[3] === undefined);
      const allowed =
        allowedSuffix && semver.valid(match[1]) !== null && semver.satisfies(match[1], '>=22.13.0');
      if (!allowed)
        finding(report, {
          id: 'C1',
          path: name,
          line: 1,
          column: 1,
          classification: 'REVIEW_REQUIRED',
          action: 'Verify this literal Node runtime pin.',
          observed: pin,
        });
    }
    if (pins.length === 0)
      finding(report, {
        id: 'C1',
        path: name,
        line: 1,
        column: 1,
        classification: 'REVIEW_REQUIRED',
        action: 'No literal Node pin recognized; inspect configuration.',
      });
  } catch (error) {
    report.failures.push({ path: name, reason: `Cannot read runtime metadata: ${error.code}` });
  }
}

function analyze(files, root, report, { display, declared, checkDeadline }) {
  const host = ts.createCompilerHost({});
  host.fileExists = (path) => files.has(path);
  host.readFile = (path) => files.get(path);
  host.getSourceFile = (path, version) =>
    files.has(path) ? ts.createSourceFile(path, files.get(path), version, true) : undefined;
  host.writeFile = () => {
    throw new Error('Read-only scanner cannot emit files.');
  };
  host.resolveModuleNames = (names) => names.map(() => undefined);
  const program = ts.createProgram(
    [...files.keys()],
    {
      allowJs: true,
      noResolve: true,
      noLib: true,
      target: ts.ScriptTarget.Latest,
      moduleDetection: ts.ModuleDetectionKind.Force,
    },
    host,
  );
  const checker = program.getTypeChecker();
  const symbols = new Map();
  const assignments = new Map();
  const patterns = new Map();
  const guards = new Map();
  const sources = program.getSourceFiles();
  const sdkFiles = new Set();
  const localImports = [];
  const symbol = (node) => node && checker.getSymbolAtLocation(node);
  const pathOf = (fileName) =>
    display.get(fileName) ?? relative(root, fileName).split(sep).join('/');
  // Whether a package.json in the file's directory or any ancestor up to the root declares it.
  function declares(fileName, dependency) {
    for (let directory = dirname(fileName); within(root, directory);) {
      if (declared.get(directory)?.has(dependency)) return true;
      if (directory === root) break;
      directory = dirname(directory);
    }
    return false;
  }
  const unshadowedRequire = (node) =>
    ts.isIdentifier(node) && node.text === 'require' && !symbol(node)?.declarations?.length;
  function add(node, id, action, classification = 'REVIEW_REQUIRED') {
    const source = node.getSourceFile();
    const at = source.getLineAndCharacterOfPosition(node.getStart(source));
    finding(report, {
      id,
      action,
      classification,
      path: pathOf(source.fileName),
      line: at.line + 1,
      column: at.character + 1,
    });
  }
  function bind(name, origin, initializer) {
    if (ts.isIdentifier(name)) {
      const key = symbol(name);
      if (key && origin) symbols.set(key, origin);
      if (key && initializer) patterns.set(key, initializer);
    }
  }
  let visited = 0;
  function visit(node, callback) {
    if (++visited % 4096 === 0) checkDeadline();
    callback(node);
    ts.forEachChild(node, (child) => visit(child, callback));
  }
  for (const source of sources) {
    checkDeadline();
    for (const error of source.parseDiagnostics) {
      report.failures.push({
        path: pathOf(source.fileName),
        reason: ts.flattenDiagnosticMessageText(error.messageText, ' '),
      });
    }
    visit(source, (node) => {
      const specifier =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? literal(node.moduleSpecifier)
          : ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
            ? literal(node.moduleReference.expression)
            : ts.isCallExpression(node) &&
                (unshadowedRequire(node.expression) ||
                  node.expression.kind === ts.SyntaxKind.ImportKeyword)
              ? literal(node.arguments[0])
              : undefined;
      const dependency = packageName(specifier);
      if (FORMER_TRANSITIVE.has(dependency) && !declares(source.fileName, dependency)) {
        add(
          node,
          'C3',
          `Declare ${dependency} as a direct dependency; permitio 3.0 no longer installs it.`,
        );
      }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        const path = literal(node.moduleSpecifier);
        if (sdkPath(path)) sdkFiles.add(source.fileName);
        if (path?.startsWith('.')) {
          const base = resolve(dirname(source.fileName), path);
          const candidates = [
            base,
            ...[...SOURCE].map((extension) => base + extension),
            ...[...SOURCE].map((extension) => base.replace(/\.[cm]?jsx?$/u, extension)),
            join(base, 'index.ts'),
            join(base, 'index.js'),
            `${base}.permit-scan.js`,
            `${base}.permit-scan.ts`,
          ];
          const target = candidates.find((candidate) => files.has(candidate));
          if (target) localImports.push({ node, source: source.fileName, target });
        }
      }
      if (
        ts.isCallExpression(node) &&
        sdkPath(literal(node.arguments[0])) &&
        (unshadowedRequire(node.expression) || node.expression.kind === ts.SyntaxKind.ImportKeyword)
      )
        sdkFiles.add(source.fileName);
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        sdkPath(literal(node.moduleReference.expression))
      ) {
        bind(node.name, 'module');
        sdkFiles.add(source.fileName);
        if (literal(node.moduleReference.expression) !== 'permitio') {
          add(node, 'C2', 'Replace internal/deep imports with public root exports.');
        }
      }
      if (ts.isImportDeclaration(node) && sdkPath(literal(node.moduleSpecifier))) {
        if (literal(node.moduleSpecifier) !== 'permitio') {
          add(node, 'C2', 'Replace internal/deep imports with public root exports.');
        }
        const clause = node.importClause;
        if (clause?.name) bind(clause.name, 'client-type');
        if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          bind(clause.namedBindings.name, 'module');
        } else
          for (const item of clause?.namedBindings?.elements ?? []) {
            const name = item.propertyName?.text ?? item.name.text;
            bind(item.name, imported(name));
            if (REMOVED.has(name)) add(item, 'A2', `Replace removed export ${name}.`);
            if (['EnvironmentCopyConflictStrategyEnum', 'Statistics'].includes(name)) {
              add(item, 'T1', `Review removed/renamed generated symbol ${name}.`);
            }
          }
      }
      if (ts.isVariableDeclaration(node)) bind(node.name, undefined, node.initializer);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const target = symbol(node.left);
        if (target) assignments.set(target, [...(assignments.get(target) ?? []), node.right]);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword
      ) {
        if (ERROR_TYPES.has(symbols.get(symbol(node.right))))
          guards.set(symbol(node.left), 'error');
      }
    });
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of localImports) {
      if (sdkFiles.has(item.target) && !sdkFiles.has(item.source)) {
        sdkFiles.add(item.source);
        changed = true;
      }
    }
  }
  for (const item of localImports) {
    if (sdkFiles.has(item.target)) {
      add(item.node, 'A1', 'SDK-bearing local module crosses local analysis; review its bindings.');
    }
  }
  function typeOrigin(type, seen) {
    if (!type) return undefined;
    if (ts.isParenthesizedTypeNode(type)) return typeOrigin(type.type, seen);
    if (ts.isImportTypeNode(type) && sdkPath(literal(type.argument?.literal))) {
      return instance(imported(type.qualifier?.getText()));
    }
    if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
      const members = type.types.filter(
        (item) =>
          item.kind !== ts.SyntaxKind.UndefinedKeyword &&
          !(ts.isTypeReferenceNode(item) && item.typeName.getText() === 'undefined') &&
          !(ts.isLiteralTypeNode(item) && item.literal.kind === ts.SyntaxKind.NullKeyword),
      );
      const origins = members.map((item) => typeOrigin(item, seen));
      const known = origins.find((origin) => origin !== undefined);
      if (known && origins.some((origin) => origin !== known)) return 'ambiguous';
      return known;
    }
    if (!ts.isTypeReferenceNode(type)) return undefined;
    return instance(expression(type.typeName, seen));
  }
  function bindingOwnerOrigin(node, seen = new Set()) {
    const owner = node.parent.parent;
    const origin = expression(owner.initializer, seen) ?? typeOrigin(owner.type, seen);
    if (origin || !ts.isBindingElement(owner)) return origin;
    const key = owner.propertyName
      ? (literal(owner.propertyName) ?? owner.propertyName.text)
      : ts.isIdentifier(owner.name)
        ? owner.name.text
        : undefined;
    return property(bindingOwnerOrigin(owner, seen), key);
  }
  // A result that never reached a cycle cut does not depend on `seen`, so it is cached per symbol.
  const origins = new Map();
  let cycleCuts = 0;
  function declarationOrigin(key, seen) {
    if (!key) return undefined;
    if (seen.has(key)) {
      cycleCuts++;
      return undefined;
    }
    if (origins.has(key)) return origins.get(key);
    const cutsBefore = cycleCuts;
    const origin = uncachedDeclarationOrigin(key, seen);
    if (cycleCuts === cutsBefore) origins.set(key, origin);
    return origin;
  }
  function uncachedDeclarationOrigin(key, seen) {
    const next = new Set([...seen, key]);
    let origin = symbols.get(key) ?? guards.get(key);
    const pattern = patterns.get(key);
    if (pattern) origin ??= expression(pattern, next);
    for (const declaration of key.declarations ?? []) {
      if (declaration.type) origin ??= typeOrigin(declaration.type, next);
      if (declaration.initializer) origin ??= expression(declaration.initializer, next);
      if (ts.isBindingElement(declaration)) {
        const name = declaration.propertyName
          ? (literal(declaration.propertyName) ?? declaration.propertyName.text)
          : declaration.name.text;
        origin ??= property(bindingOwnerOrigin(declaration, next), name);
      }
    }
    const assigned = (assignments.get(key) ?? []).map((value) => expression(value, next));
    origin ??= assigned.find((value) => value !== undefined);
    if (origin && assigned.some((value) => value !== origin)) return 'ambiguous';
    return origin;
  }
  function expression(input, seen = new Set()) {
    if (
      input &&
      (ts.isParenthesizedExpression(input) ||
        ts.isNonNullExpression(input) ||
        ts.isAwaitExpression(input) ||
        ts.isSatisfiesExpression(input))
    )
      return expression(input.expression, seen);
    if (
      input &&
      (ts.isAsExpression(input) || ts.isTypeAssertionExpression(input)) &&
      typeOrigin(input.type, seen)
    )
      return typeOrigin(input.type, seen);
    const node = unwrap(input);
    if (!node) return undefined;
    if (ts.isIdentifier(node)) return declarationOrigin(symbol(node), seen);
    if (ts.isQualifiedName(node)) return property(expression(node.left, seen), node.right.text);
    if (ts.isConditionalExpression(node)) {
      const left = expression(node.whenTrue, seen);
      const right = expression(node.whenFalse, seen);
      if (left === right) return left;
      if (left || right) return 'ambiguous';
      return undefined;
    }
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(node.operatorToken.kind)
    ) {
      const left = expression(node.left, seen);
      const right = expression(node.right, seen);
      if (left === right) return left;
      if (left || right) return 'ambiguous';
      return undefined;
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const origin = expression(node.expression, seen);
      const key = member(node);
      if (origin && key === undefined) return 'ambiguous';
      return property(origin, key) ?? declarationOrigin(symbol(node.name), seen);
    }
    if (ts.isNewExpression(node)) return instance(expression(node.expression, seen));
    if (ts.isCallExpression(node)) {
      if (
        unshadowedRequire(node.expression) ||
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        if (sdkPath(literal(node.arguments[0]))) return 'module';
      }
      const kind = expression(node.expression, seen);
      if (kind === 'flat:getMethods') return 'api';
      if (kind?.startsWith('method:')) return `result:${RESULTS[kind.slice(7)] ?? 'record'}`;
    }
    return undefined;
  }
  function inspectMember(node, origin, key) {
    if (origin === 'ambiguous' || (origin && key === undefined)) {
      add(node, 'A1', 'Resolve this dynamic/reassigned Permit-derived access manually.');
    } else if (origin === 'api' && Object.hasOwn(FLAT, key)) {
      add(node, 'A1', `Use ${FLAT[key]}; verify arguments and result shape.`, 'MECHANICAL');
      if (
        ['listUsers', 'syncUser', 'assignConditionSetRule'].includes(key) ||
        key.startsWith('delete') ||
        key.startsWith('unassign')
      ) {
        add(node, 'A3', 'Adapt the grouped result shape; inspect downstream result consumers.');
      }
    } else if (origin === 'api' && key === 'getMethods') {
      add(node, 'A2', 'Remove getMethods(); use receiver-preserving grouped closures.');
    } else if (origin === 'context' && key === 'level') {
      add(node, 'A2', 'Use apiContext.permittedAccessLevel.');
    } else if (origin === 'module' && REMOVED.has(key)) {
      add(node, 'A2', `Replace removed export ${key}.`);
    } else if (
      origin === 'module' &&
      ['EnvironmentCopyConflictStrategyEnum', 'Statistics'].includes(key)
    ) {
      add(node, 'T1', `Review removed/renamed generated symbol ${key}.`);
    } else if (origin === 'error' && ['request', 'originalError', 'data'].includes(key)) {
      add(node, 'E2', 'Use safe error status/code; narrow unknown bounded response data.');
    } else if (
      origin === 'result:void' ||
      (origin === 'result:page' && key === 'length') ||
      (origin === 'result:sync' && !['user', 'created'].includes(key)) ||
      (origin === 'result:rule' && key === 'length')
    ) {
      add(node, 'A3', 'Review this member against the grouped result contract.');
    } else if (origin === 'result:bulk') {
      add(
        node,
        'T2',
        'Bulk result fields are unspecified; do not treat them as request operations.',
      );
    }
  }
  function inspectLogOption(value) {
    const options = unwrap(value);
    if (!ts.isObjectLiteralExpression(options)) {
      add(value, 'F1', 'Review effective log options: log.json defaults changed in 3.0.');
      return;
    }
    for (const item of options.properties) {
      if (ts.isSpreadAssignment(item)) {
        add(item, 'F1', 'Review spread log options: log.json defaults changed in 3.0.');
      } else if (
        (ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item)) &&
        (literal(item.name) ?? item.name.getText()) === 'json' &&
        item.initializer?.kind !== ts.SyntaxKind.TrueKeyword
      ) {
        add(
          item,
          'F1',
          item.initializer?.kind === ts.SyntaxKind.FalseKeyword
            ? 'log.json: false now selects pretty output (2.x wrote JSON); update log parsers ' +
                'or set json: true.'
            : 'Review the effective log.json value: false now selects pretty output.',
        );
      }
    }
  }
  // instanceof checks against the PDP error classes, in source order.
  const errorChecks = [];
  for (const source of sources)
    visit(source, (node) => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        (!ts.isIdentifier(node.left) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) &&
        sdkHandle(expression(node.right))
      ) {
        add(node, 'A1', 'Permit-derived assignment escapes local bindings; review consumers.');
      }
      if (ts.isPropertyDeclaration(node) && sdkHandle(expression(node.initializer))) {
        add(node, 'A1', 'Permit-derived class field escapes local bindings; review consumers.');
      }
      if (
        ts.isHeritageClause(node) &&
        node.types.some((type) => sdkHandle(expression(type.expression)))
      ) {
        add(node, 'A1', 'SDK-derived heritage requires review of inherited consumer bindings.');
      }
      if (ts.isArrayTypeNode(node) && sdkHandle(typeOrigin(node.elementType))) {
        add(node, 'A1', 'SDK-derived array type requires review of its consumer bindings.');
      }
      if (ts.isIndexedAccessTypeNode(node) && sdkHandle(typeOrigin(node.objectType))) {
        add(node, 'A1', 'SDK-derived indexed type requires review of its consumer bindings.');
      }
      if (
        (ts.isThrowStatement(node) || ts.isYieldExpression(node)) &&
        sdkHandle(expression(node.expression))
      ) {
        add(node, 'A1', 'Permit-derived throw/yield escapes local bindings; review consumers.');
      }
      if (
        ts.isTypeReferenceNode(node) &&
        !expression(node.typeName) &&
        node.typeArguments?.some((type) => sdkHandle(typeOrigin(type)))
      ) {
        add(node, 'A1', 'SDK-derived utility type requires review of its consumer bindings.');
      }
      if (ts.isTypeParameterDeclaration(node) && sdkHandle(typeOrigin(node.constraint))) {
        add(node, 'A1', 'SDK-bound generic parameter requires review of its consumer bindings.');
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        inspectMember(node, expression(node.expression), member(node));
        const parent = node.parent;
        if (
          (['config', 'settings'].includes(expression(node.expression)) ||
            (expression(node.expression) === 'client' && member(node) === 'config')) &&
          ts.isBinaryExpression(parent) &&
          parent.left === node &&
          parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        ) {
          add(
            node,
            'F2',
            'SDK settings are frozen; construct a new client to change these options.',
          );
        }
      }
      if (ts.isBindingElement(node)) {
        const origin = bindingOwnerOrigin(node);
        const key = node.propertyName
          ? (literal(node.propertyName) ?? node.propertyName.text)
          : ts.isIdentifier(node.name)
            ? node.name.text
            : undefined;
        if (node.dotDotDotToken && origin) {
          add(node, 'A1', 'Permit-derived rest binding requires manual review.');
        } else inspectMember(node, origin, key);
      }
      if (
        ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
          sdkHandle(expression(node.initializer ?? node.name))) ||
        (ts.isSpreadAssignment(node) && sdkHandle(expression(node.expression))) ||
        (node.parent && ts.isArrayLiteralExpression(node.parent) && sdkHandle(expression(node)))
      ) {
        add(node, 'A1', 'Permit-derived value enters a container; review downstream consumers.');
      }
      if (ts.isCallExpression(node)) {
        if (
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          sdkPath(literal(node.arguments[0]))
        ) {
          let parent = node.parent;
          while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
          if (!parent || !ts.isAwaitExpression(parent)) {
            add(node, 'A1', 'SDK import promise escapes local bindings; review its consumers.');
          }
        }
        if (expression(node.expression) === 'client-method:checkAllTenants') {
          add(
            node,
            'W3',
            'Verify all-tenants JSON wire expectations and typed fail-closed results.',
          );
        }
        for (const argument of node.arguments) {
          if (['config', 'settings'].includes(expression(argument))) {
            add(argument, 'F2', 'SDK settings escape local analysis; review mutation consumers.');
          }
          if (sdkHandle(expression(argument))) {
            add(
              argument,
              'A1',
              'Permit-derived value escapes local analysis; inspect its consumer.',
            );
          }
        }
        if (
          (unshadowedRequire(node.expression) ||
            node.expression.kind === ts.SyntaxKind.ImportKeyword) &&
          literal(node.arguments[0])?.startsWith('permitio/')
        ) {
          add(node, 'C2', 'Replace internal/deep loading with public root exports.');
        }
      }
      if (ts.isNewExpression(node) && expression(node.expression) === 'client-type') {
        const options = node.arguments?.[0];
        if (options && !ts.isObjectLiteralExpression(options)) {
          add(options, 'F1', 'Review effective constructor options and environment values.');
        } else
          for (const item of options?.properties ?? []) {
            if (ts.isSpreadAssignment(item)) {
              add(item, 'F1', 'Review spread constructor options and effective validation.');
            } else if (ts.isPropertyAssignment(item)) {
              const key = literal(item.name) ?? item.name.getText();
              if (key === 'opaAxiosInstance') {
                add(item, 'W2', 'Review OPA hooks/transforms: request data is JSON text.');
              } else if (['token', 'pdp', 'apiUrl'].includes(key)) {
                const value = literal(item.initializer);
                if (value === '' || (value !== undefined && /\s/u.test(value))) {
                  add(item, 'F1', 'Replace invalid empty/whitespace constructor values.');
                }
              } else if (key === 'log') inspectLogOption(item.initializer);
            }
          }
      }
      if (
        ts.isPropertyAssignment(node) &&
        (literal(node.name) ?? node.name.getText()) === 'throwOnError' &&
        node.initializer.kind === ts.SyntaxKind.FalseKeyword &&
        sdkFiles.has(node.getSourceFile().fileName)
      ) {
        add(
          node,
          'E1',
          'throwOnError: false returns denial fallbacks (false, one false per bulk input, {} or ' +
            '[]); do not read them as policy denials of a healthy request.',
        );
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword
      ) {
        const kind = expression(node.right);
        if (kind === 'connection-error-type' || kind === 'status-error-type') {
          let scope = node.parent;
          while (scope && !ts.isFunctionLike(scope) && !ts.isCatchClause(scope)) {
            scope = scope.parent;
          }
          errorChecks.push({ node, kind, scope, subject: unwrap(node.left).getText() });
        }
      }
      if (
        ts.isTypeReferenceNode(node) &&
        ERROR_TYPES.has(expression(node.typeName)) &&
        node.typeArguments?.length
      ) {
        add(node, 'T3', 'PermitApiError is no longer generic; narrow unknown response data.');
      }
      if (ts.isExportAssignment(node) && expression(node.expression)) {
        add(node, 'A1', 'Permit-derived export crosses local analysis; review importers.');
      }
      if (ts.isReturnStatement(node) && sdkHandle(expression(node.expression))) {
        add(node, 'A1', 'Permit-derived return crosses local analysis; review callers.');
      }
      if (ts.isExportSpecifier(node)) {
        const target = checker.getExportSpecifierLocalTargetSymbol(node);
        if (sdkHandle(declarationOrigin(target, new Set()))) {
          add(node, 'A1', 'Permit-derived export crosses local analysis; review importers.');
        }
      }
      if (ts.isExportDeclaration(node) && sdkPath(literal(node.moduleSpecifier))) {
        add(node, 'A1', 'Permit re-export crosses local analysis; review importing consumers.');
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        sdkHandle(expression(node.right)) &&
        ts.isPropertyAccessExpression(node.left) &&
        node.left.getText() === 'module.exports' &&
        !symbol(node.left.expression)?.declarations?.length
      ) {
        add(node, 'A1', 'Permit-derived CommonJS export crosses local analysis; review importers.');
      }
      if (
        ts.isVariableDeclaration(node) &&
        expression(node.initializer) &&
        node.parent.parent.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        add(node, 'A1', 'Permit-derived export crosses local analysis; review importers.');
      }
    });
  // PermitPDPStatusError now extends PermitConnectionError, so a connection check that runs
  // before any status check on the same value also catches status failures.
  for (const check of errorChecks) {
    const earlier = errorChecks.filter(
      (other) =>
        other.scope === check.scope &&
        other.subject === check.subject &&
        other.node.getSourceFile() === check.node.getSourceFile() &&
        other.node.getStart() < check.node.getStart(),
    );
    if (
      check.kind === 'connection-error-type' &&
      !earlier.some((other) => other.kind === 'status-error-type')
    ) {
      add(
        check.node,
        'E1',
        'PermitPDPStatusError now extends PermitConnectionError; check it first if HTTP ' +
          'status failures need different handling.',
      );
    } else if (
      check.kind === 'status-error-type' &&
      earlier.some((other) => other.kind === 'connection-error-type')
    ) {
      add(
        check.node,
        'E1',
        'An earlier PermitConnectionError check already matches PermitPDPStatusError; reorder.',
      );
    }
  }
}

const executable = process.argv[1]
  ? await realpath(process.argv[1]).catch(() => undefined)
  : undefined;
const USAGE =
  'Usage: node scripts/scan.mjs [--max-file-bytes <n>] [--deadline-ms <n>] ' +
  '<customer-project-directory>\n';

if (executable === fileURLToPath(import.meta.url)) {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean' },
        'max-file-bytes': { type: 'string' },
        'deadline-ms': { type: 'string' },
      },
    });
  } catch {
    parsed = undefined;
  }
  const limit = (value) => (value === undefined ? undefined : Number(value));
  const options = parsed && {
    maxFileBytes: limit(parsed.values['max-file-bytes']),
    deadlineMs: limit(parsed.values['deadline-ms']),
  };
  if (parsed?.values.help) {
    process.stdout.write(USAGE);
  } else if (
    !parsed ||
    parsed.positionals.length !== 1 ||
    Object.values(options).some(
      (value) => value !== undefined && !(Number.isSafeInteger(value) && value > 0),
    )
  ) {
    process.stdout.write(USAGE);
    process.exitCode = 2;
  } else {
    try {
      const report = await scan(parsed.positionals[0], options);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exitCode = report.exitCode;
    } catch (error) {
      // Exit 1 means "complete with findings", so no failure may surface as Node's default 1.
      process.stderr.write(
        error instanceof PrerequisiteError
          ? `Scanner prerequisite unavailable: ${error.message}\n`
          : `Scanner failed before producing a report: ${error?.message}\n`,
      );
      process.exitCode = 2;
    }
  }
}
