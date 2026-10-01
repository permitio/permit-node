import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from '@permitio/compiler-tools';

/**
 * Rewrites authored source aliases in emitted declarations to published file paths.
 *
 * @param directory - Declaration output directory, containing every referenced SDK declaration.
 * @throws If an alias escapes the output directory or its declaration is missing.
 */
export function rewriteDeclarationAliases(directory) {
  const root = resolve(directory);
  const visitDirectory = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = join(current, entry.name);
      if (entry.isDirectory()) {
        visitDirectory(file);
        continue;
      }
      if (!entry.name.endsWith('.d.ts')) continue;
      let text = readFileSync(file, 'utf8');
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const edits = [];
      const visit = (node) => {
        if (ts.isStringLiteral(node) && node.text.startsWith('#src/')) {
          const parent = node.parent;
          const isModule =
            ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
              parent.moduleSpecifier === node) ||
            (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent));
          if (isModule) {
            const target = resolve(root, node.text.slice('#src/'.length));
            if (!target.startsWith(`${root}${sep}`) || !existsSync(`${target}.d.ts`)) {
              throw new Error(`Cannot publish ${file}: alias ${node.text} has no SDK declaration.`);
            }
            const path = relative(dirname(file), target).split(sep).join('/');
            edits.push({
              start: node.getStart(source) + 1,
              end: node.end - 1,
              text: `${path.startsWith('.') ? path : `./${path}`}.js`,
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      for (const edit of edits.reverse()) {
        text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      }
      writeFileSync(file, text);
    }
  };
  visitDirectory(root);
  if (existsSync(join(root, 'index.d.ts'))) {
    // Canonical class declarations preserve nominal identity across the two loader entry points.
    writeFileSync(join(root, 'index.d.mts'), "export * from './index.js';\n");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rewriteDeclarationAliases('build');
}
