import { Application } from 'typedoc';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const watch = args.includes('--watch');
const outputIndex = args.indexOf('--out');
const output = outputIndex === -1 ? 'docs' : args[outputIndex + 1];
if (!output || output.startsWith('--')) throw new Error('--out requires an output directory.');
const app = await Application.bootstrapWithPlugins({ options: 'typedoc.json', watch });
if (watch) {
  await app.convertAndWatch((project) => app.generateDocs(project, output));
} else {
  const project = await app.convert();
  if (!project) throw new Error('Documentation conversion failed; fix the reported diagnostics.');
  await app.generateDocs(project, output);
  if (app.logger.hasErrors() || app.logger.hasWarnings()) process.exitCode = 1;
}
