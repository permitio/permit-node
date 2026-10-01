import { Application } from 'typedoc';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const watch = args.includes('--watch');
const outputIndex = args.indexOf('--out');
const output = outputIndex === -1 ? 'docs' : args[outputIndex + 1];
if (!output || output.startsWith('--')) throw new Error('--out requires an output directory.');
const app = await Application.bootstrapWithPlugins({ options: 'typedoc.json', watch });
async function generate(project) {
  await app.generateDocs(project, output);
  const { auditPublicExports, checkReferenceLinks } = await import(
    pathToFileURL(resolve('scripts/public-reference.mjs')).href
  );
  const contracts = auditPublicExports(process.cwd());
  const result = checkReferenceLinks(output, contracts.groups);
  console.log('Public reference check PASS: ' + JSON.stringify(result));
}
if (watch) {
  await app.convertAndWatch(generate);
} else {
  const project = await app.convert();
  if (!project) throw new Error('Documentation conversion failed; fix the reported diagnostics.');
  await generate(project);
  if (app.logger.hasErrors() || app.logger.hasWarnings()) process.exitCode = 1;
}
