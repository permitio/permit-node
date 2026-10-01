import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

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
const WRAPPERS = new Set(['.vue', '.svelte', '.astro']);
const EXCLUDED = new Set(['node_modules', '.git', 'build', 'dist', 'coverage', '.next']);
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
  if (['PermitApiError', 'PermitContextError', 'PermitConnectionError'].includes(name)) {
    return 'error-type';
  }
  return undefined;
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

/**
 * Scans supported customer files without executing code or changing the project.
 *
 * @param {string} directory - Customer project directory.
 * @returns {Promise<object>} Findings and independent traversal/parser completeness information.
 */
export async function scan(directory) {
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
  async function walk(path) {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (error) {
      report.failures.push({ path: relative(root, path), reason: `Cannot read: ${error.code}` });
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
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
        if (EXCLUDED.has(entry.name)) {
          report.excluded.push({ path: name, reason: 'Dependency, build or Git directory.' });
        } else await walk(full);
        continue;
      }
      if (!entry.isFile()) {
        report.excluded.push({ path: name, reason: 'Not a regular file.' });
        continue;
      }
      if (SOURCE.has(extname(name))) {
        try {
          files.set(full, await readFile(full, 'utf8'));
          report.scanned.push(name);
        } catch (error) {
          report.failures.push({ path: name, reason: `Cannot read source: ${error.code}` });
        }
      } else if (WRAPPERS.has(extname(name))) {
        report.failures.push({
          path: name,
          reason: 'Unsupported source wrapper; inspect manually.',
        });
      } else if (entry.name === 'package.json') {
        await metadata(full, name, report);
      } else if (['.nvmrc', '.node-version', '.tool-versions', 'Dockerfile'].includes(entry.name)) {
        await runtimePin(full, name, report);
      } else {
        report.excluded.push({ path: name, reason: 'Not a supported source or metadata file.' });
      }
    }
  }
  await walk(root);
  try {
    analyze(files, root, report);
  } catch (error) {
    report.failures.push({ path: '.', reason: `Cannot finish source analysis: ${error.message}` });
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

async function metadata(full, name, report) {
  try {
    const data = JSON.parse(await readFile(full, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Expected object');
    report.scanned.push(name);
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
    if (data.engines?.node !== undefined && data.engines.node !== '^22.13.0 || ^24.0.0') {
      finding(report, {
        id: 'C1',
        path: name,
        line: 1,
        column: 1,
        classification: 'REVIEW_REQUIRED',
        action: 'Verify Node ^22.13.0 or ^24.0.0 support.',
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
    const pins = name.endsWith('Dockerfile')
      ? [...value.matchAll(/^FROM\s+node:([^\s]+)/gmu)].map((match) => match[1])
      : name.endsWith('.tool-versions')
        ? [...value.matchAll(/^nodejs\s+([^\s]+)/gmu)].map((match) => match[1])
        : [value];
    for (const pin of pins) {
      const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-@].*)?$/u.exec(pin);
      const allowed = match && (match[1] === '24' || (match[1] === '22' && Number(match[2]) >= 13));
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

function analyze(files, root, report) {
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
  const unshadowedRequire = (node) =>
    ts.isIdentifier(node) && node.text === 'require' && !symbol(node)?.declarations?.length;
  function add(node, id, action, classification = 'REVIEW_REQUIRED') {
    const source = node.getSourceFile();
    const at = source.getLineAndCharacterOfPosition(node.getStart(source));
    finding(report, {
      id,
      action,
      classification,
      path: relative(root, source.fileName).split(sep).join('/'),
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
  function visit(node, callback) {
    callback(node);
    ts.forEachChild(node, (child) => visit(child, callback));
  }
  for (const source of sources) {
    for (const error of source.parseDiagnostics) {
      report.failures.push({
        path: relative(root, source.fileName),
        reason: ts.flattenDiagnosticMessageText(error.messageText, ' '),
      });
    }
    visit(source, (node) => {
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
        if (symbols.get(symbol(node.right)) === 'error-type')
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
      return imported(type.qualifier?.getText())?.replace('-type', '');
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
    return expression(type.typeName, seen)?.replace('-type', '');
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
  function declarationOrigin(key, seen) {
    if (!key || seen.has(key)) return undefined;
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
    if (ts.isNewExpression(node)) return expression(node.expression, seen)?.replace('-type', '');
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
              }
            }
          }
      }
      if (
        ts.isTypeReferenceNode(node) &&
        expression(node.typeName) === 'error-type' &&
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
}

const executable = process.argv[1]
  ? await realpath(process.argv[1]).catch(() => undefined)
  : undefined;
if (executable === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] === '--help') {
    process.stdout.write('Usage: node scripts/scan.mjs <customer-project-directory>\n');
    process.exitCode = args[0] === '--help' ? 0 : 2;
  } else {
    const report = await scan(args[0]);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.exitCode;
  }
}
