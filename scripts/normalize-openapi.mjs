import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from '@permitio/compiler-tools';

/**
 * Applies compiler-directed compatibility edits after OpenAPI generation.
 *
 * @param root - Repository containing tsconfig.build.json and src/openapi.
 * @throws If the compiler configuration cannot be read.
 */
export function normalizeOpenApi(root = process.cwd()) {
  const configFile = resolve(root, 'tsconfig.build.json');
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  if (config.error)
    throw new Error(`Cannot read ${configFile}; repair the compiler configuration.`);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) {
    throw new Error(
      ts.formatDiagnostics(parsed.errors, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
      }),
    );
  }
  const generated = resolve(root, 'src/openapi') + sep;
  for (const file of parsed.fileNames.filter((name) => name.startsWith(generated))) {
    const text = readFileSync(file, 'utf8')
      .replace(/^\s*\/\/ @ts-ignore[^\n]*\n/gm, '')
      .replace(/^\s*\/\/ Some imports not used depending on template conditions\n/gm, '');
    writeFileSync(file, text);
  }
  const host = {
    ...ts.sys,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => '0',
    getScriptSnapshot: (file) => {
      const text = ts.sys.readFile(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
  };
  const service = ts.createLanguageService(host);
  const program = service.getProgram();
  if (!program) throw new Error('Cannot initialize the compiler API for generated imports.');
  const syntaxErrors = program
    .getSyntacticDiagnostics()
    .filter((diagnostic) => diagnostic.file?.fileName.startsWith(generated));
  if (syntaxErrors.length) {
    service.dispose();
    throw new Error(
      ts.formatDiagnostics(syntaxErrors, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
      }),
    );
  }
  const printer = ts.createPrinter();
  for (const file of parsed.fileNames.filter((name) => name.startsWith(generated))) {
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`Cannot read generated source ${file}.`);
    const edits = [];
    for (const diagnostic of service.getSemanticDiagnostics(file)) {
      if (diagnostic.start === undefined) continue;
      let node = source;
      const visit = (current) => {
        if (current.getStart(source) <= diagnostic.start && current.end > diagnostic.start) {
          node = current;
          ts.forEachChild(current, visit);
        }
      };
      visit(source);
      if (diagnostic.code === 1484 || diagnostic.code === 1205) {
        while (node && !ts.isImportSpecifier(node) && !ts.isExportSpecifier(node)) {
          node = node.parent;
        }
        if (node) edits.push({ start: node.getStart(source), length: 0, newText: 'type ' });
      } else if (diagnostic.code === 4111) {
        while (node && !ts.isPropertyAccessExpression(node)) node = node.parent;
        if (node)
          edits.push({
            start: node.expression.end,
            length: node.end - node.expression.end,
            newText: `${node.questionDotToken ? '?.' : ''}[${JSON.stringify(node.name.text)}]`,
          });
      } else if (diagnostic.code === 4114) {
        while (node && !ts.isPropertyDeclaration(node)) node = node.parent;
        if (node)
          edits.push({ start: node.name.getStart(source), length: 0, newText: 'override ' });
      } else if (diagnostic.code === 2412) {
        while (node && !ts.isPropertyAccessExpression(node)) node = node.parent;
        if (!node || node.expression.kind !== ts.SyntaxKind.ThisKeyword) continue;
        const property = program.getTypeChecker().getSymbolAtLocation(node.name)?.valueDeclaration;
        if (!property || !ts.isPropertyDeclaration(property) || !property.type) continue;
        // Generated constructors assign optional parameters even when absent. Preserve that
        // runtime behavior by describing those particular stored properties truthfully.
        const type = ts.factory.createUnionTypeNode([
          property.type,
          ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
        ]);
        edits.push({
          start: property.type.getStart(source),
          length: property.type.end - property.type.getStart(source),
          newText: printer.printNode(ts.EmitHint.Unspecified, type, source),
        });
      }
    }
    const annotateRequest = (node) => {
      if (
        ts.isPropertyDeclaration(node) &&
        node.type &&
        node.initializer &&
        ts.isLiteralTypeNode(node.type) &&
        ts.isStringLiteral(node.type.literal) &&
        ts.isStringLiteral(node.initializer) &&
        node.type.literal.text === node.initializer.text
      ) {
        edits.push({ start: node.name.end, length: node.type.end - node.name.end, newText: '' });
        edits.push({ start: node.initializer.end, length: 0, newText: ' as const' });
      }
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'createRequestFunction') {
        const visit = (child) => {
          if (ts.isArrowFunction(child) && !child.type) {
            edits.push({
              start: child.equalsGreaterThanToken.getStart(source),
              length: 0,
              newText: ': ReturnType<typeof globalAxios.request<T, R>> ',
            });
          } else {
            ts.forEachChild(child, visit);
          }
        };
        ts.forEachChild(node, visit);
      }
      ts.forEachChild(node, annotateRequest);
    };
    annotateRequest(source);
    let text = readFileSync(file, 'utf8');
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      text = text.slice(0, edit.start) + edit.newText + text.slice(edit.start + edit.length);
    }
    text = text.replaceAll('/* tslint:disable */\n', '').replaceAll('/* eslint-disable */\n', '');
    text = text.replace(/^\s*\* @(?:export|memberof)\b[^\n]*\n/gm, '');
    writeFileSync(file, text);
  }
  service.dispose();
  // Recreate the service after edits so unused generated imports are removed against current text.
  const imports = ts.createLanguageService(host);
  for (const file of parsed.fileNames.filter((name) => name.startsWith(generated))) {
    const changes = imports.organizeImports({ type: 'file', fileName: file }, {}, {});
    for (const change of changes) {
      let text = readFileSync(change.fileName, 'utf8');
      for (const edit of [...change.textChanges].reverse()) {
        text =
          text.slice(0, edit.span.start) +
          edit.newText +
          text.slice(edit.span.start + edit.span.length);
      }
      writeFileSync(change.fileName, text);
    }
  }
  imports.dispose();
  try {
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
        '-p',
        configFile,
        '--noEmit',
        '--emitDeclarationOnly',
        'false',
        '--pretty',
        'false',
      ],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' },
    );
  } catch (cause) {
    throw new Error(
      'Generated source failed the TypeScript 7 SDK check; fix the generator output.\n' +
        String(cause.stdout ?? '') +
        String(cause.stderr ?? ''),
      { cause },
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  normalizeOpenApi();
}
