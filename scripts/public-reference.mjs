import { readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

import ts from '@permitio/compiler-tools';

/**
 * Audits existing named public method inputs/results/errors and derives the API group pages.
 *
 * @param root - SDK checkout containing its strict build configuration and root entry source.
 * @returns Export names, required contracts and actual IPermitApi group interfaces.
 * @throws If a public contract is not root-exported or source/configuration cannot be inspected.
 */
export function auditPublicExports(root) {
  const config = ts.readConfigFile(resolve(root, 'tsconfig.build.json'), ts.sys.readFile);
  if (config.error) throw new Error('Cannot read public-reference compiler configuration.');
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) throw new Error('Public-reference compiler configuration is invalid.');
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  if (program.getSyntacticDiagnostics().length) throw new Error('Public source has syntax errors.');
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(resolve(root, 'src/index.ts'));
  const module = source && checker.getSymbolAtLocation(source);
  if (!module) throw new Error('Public root entry source is missing.');
  const target = (symbol) =>
    symbol?.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const exports = checker.getExportsOfModule(module);
  const symbols = new Set(exports.map(target));
  const required = new Map();
  const visited = new Set();
  const prefix = resolve(root, 'src') + sep;
  function requireSymbol(symbol, site) {
    const actual = target(symbol);
    if (
      actual &&
      !(actual.flags & ts.SymbolFlags.TypeParameter) &&
      actual.declarations?.some((node) => node.getSourceFile().fileName.startsWith(prefix))
    ) {
      required.set(actual, new Set([...(required.get(actual) ?? []), site]));
    }
  }
  function typeReferences(node, site) {
    if (ts.isTypeReferenceNode(node)) {
      requireSymbol(checker.getSymbolAtLocation(node.typeName), site);
    }
    ts.forEachChild(node, (child) => typeReferences(child, site));
  }
  function declaration(node) {
    if (visited.has(node)) return;
    visited.add(node);
    if (!ts.isInterfaceDeclaration(node) && !ts.isClassDeclaration(node)) return;
    for (const clause of node.heritageClauses ?? []) {
      for (const item of clause.types) {
        const symbol = target(checker.getSymbolAtLocation(item.expression));
        for (const parent of symbol?.declarations ?? []) declaration(parent);
      }
    }
    for (const member of node.members) {
      if (
        member.modifiers?.some((modifier) =>
          [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(modifier.kind),
        )
      )
        continue;
      if (
        !ts.isMethodSignature(member) &&
        !ts.isMethodDeclaration(member) &&
        !ts.isConstructorDeclaration(member) &&
        !ts.isGetAccessorDeclaration(member)
      )
        continue;
      const site = `${node.name?.text}.${member.name?.getText() ?? 'constructor'}`;
      for (const parameter of member.parameters) {
        if (parameter.type) typeReferences(parameter.type, site);
      }
      if (member.type) typeReferences(member.type, site);
      for (const parameter of member.typeParameters ?? []) typeReferences(parameter, site);
      for (const tag of ts.getJSDocTags(member)) {
        if (tag.tagName.text !== 'throws') continue;
        const name = tag.getText().match(/^@throws\s+(?:\{@link\s+|\{)?([\w]+)/)?.[1];
        if (name) {
          const error = checker.resolveName(name, member, ts.SymbolFlags.Type, false);
          requireSymbol(error ?? exports.find((symbol) => symbol.name === name), site + ' throws');
        }
      }
    }
  }
  for (const symbol of symbols) {
    for (const node of symbol.declarations ?? []) declaration(node);
  }
  const api = target(exports.find((symbol) => symbol.name === 'IPermitApi'));
  if (!api) throw new Error('IPermitApi is not exported from the public root.');
  const groups = [];
  for (const property of checker.getDeclaredTypeOfSymbol(api).getProperties()) {
    const node = property.valueDeclaration ?? property.declarations?.[0];
    if (!node || !ts.isPropertySignature(node)) continue;
    const group = checker.getTypeOfSymbolAtLocation(property, node).symbol;
    if (!group) throw new Error(`Cannot resolve public API group ${property.name}.`);
    requireSymbol(group, `IPermitApi.${property.name}`);
    for (const item of group.declarations ?? []) declaration(item);
    groups.push({ field: property.name, interface: group.name });
  }
  const contracts = [...required].map(([symbol, sites]) => ({
    name: symbol.name,
    exported: symbols.has(symbol),
    sites: [...sites].sort(),
  }));
  const missing = contracts.filter((contract) => !contract.exported);
  if (missing.length) {
    throw new Error(
      'Public root contracts are missing: ' +
        missing.map((item) => `${item.name} (${item.sites.join(', ')})`).join('; '),
    );
  }
  return { exports: exports.map((symbol) => symbol.name).sort(), contracts, groups };
}

function attributes(text, name) {
  const expression = new RegExp(`(?:^|\\s)(?:${name})\\s*=\\s*(["'])(.*?)\\1`, 'gi');
  return [...text.matchAll(expression)].map((match) =>
    match[2].replace(/&(?:amp|quot|#39);/g, (entity) => {
      if (entity === '&amp;') return '&';
      if (entity === '&quot;') return '"';
      return "'";
    }),
  );
}

/**
 * Checks generated group navigation/field links and all local HTML file/fragment/asset targets.
 *
 * @param output - Standalone TypeDoc output directory.
 * @param groups - Compiler-derived public IPermitApi fields and interface names.
 * @returns Counts of checked HTML files, local references and public groups.
 * @throws If output is missing, navigation/field links are absent or a local target is broken.
 */
export function checkReferenceLinks(output, groups) {
  const root = resolve(output);
  const read = (file) => readFileSync(resolve(root, file), 'utf8');
  const script = read('assets/navigation.js');
  const encoded = script.match(/^window\.navigationData\s*=\s*("[^"]+")\s*;?\s*$/)?.[1];
  if (!encoded) throw new Error('Generated TypeDoc navigation data is unreadable.');
  const navigation = JSON.parse(inflateSync(Buffer.from(JSON.parse(encoded), 'base64')));
  const paths = new Set();
  function collect(items) {
    for (const item of items) {
      if (typeof item.path === 'string') paths.add(item.path);
      if (item.children) collect(item.children);
    }
  }
  collect(navigation);
  const api = read('interfaces/IPermitApi.html');
  for (const group of groups) {
    const page = `interfaces/${group.interface}.html`;
    if (!paths.has(page)) throw new Error(`Public API navigation is missing ${page}.`);
    const position = api.indexOf(`id="${group.field.toLowerCase()}"`);
    const section = api.slice(
      api.lastIndexOf('<section', position),
      api.indexOf('</section>', position),
    );
    if (position === -1 || !attributes(section, 'href').includes(`${group.interface}.html`)) {
      throw new Error(`IPermitApi.${group.field} is missing its ${group.interface} page link.`);
    }
  }
  const files = readdirSync(root, { recursive: true }).filter((file) => file.endsWith('.html'));
  if (!files.length) throw new Error('Generated reference contains no HTML pages.');
  const fragments = new Map();
  let references = 0;
  for (const file of files) {
    const current = resolve(root, file);
    for (const value of attributes(read(file), 'href|src')) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue;
      const url = new URL(value, pathToFileURL(current));
      const target = fileURLToPath(url);
      const path = relative(root, target);
      if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) {
        throw new Error(`${file}: local reference escapes output: ${value}`);
      }
      try {
        if (!statSync(target).isFile()) throw new Error('not a file');
      } catch (cause) {
        throw new Error(`${file}: missing local reference ${value}`, { cause });
      }
      if (url.hash) {
        if (!fragments.has(target)) {
          fragments.set(target, new Set(attributes(readFileSync(target, 'utf8'), 'id|name')));
        }
        if (!fragments.get(target).has(decodeURIComponent(url.hash.slice(1)))) {
          throw new Error(`${file}: missing local fragment ${value}`);
        }
      }
      references += 1;
    }
  }
  return { htmlFiles: files.length, localReferences: references, publicGroups: groups.length };
}
