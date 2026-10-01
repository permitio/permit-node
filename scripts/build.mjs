import { rm } from 'node:fs/promises';

import { build } from 'esbuild';

await rm('build', { recursive: true, force: true });
for (const format of ['cjs', 'esm']) {
  await build({
    entryPoints: ['src/index.ts'],
    tsconfig: 'tsconfig.build.json',
    bundle: true,
    packages: 'external',
    platform: 'node',
    target: 'node22',
    format,
    outfile: format === 'cjs' ? 'build/index.js' : 'build/index.mjs',
  });
}
