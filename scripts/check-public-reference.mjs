import { resolve } from 'node:path';

import { auditPublicExports, checkReferenceLinks } from '#scripts/public-reference.mjs';

try {
  const output = process.argv[2] ?? 'docs';
  if (process.argv.length > 3) throw new Error('Usage: node check-public-reference.mjs [output]');
  const contracts = auditPublicExports(process.cwd());
  const links = checkReferenceLinks(resolve(output), contracts.groups);
  console.log('Public reference check PASS: ' + JSON.stringify(links));
} catch (error) {
  console.error(`Public reference check FAILED: ${error.message}`);
  process.exitCode = 1;
}
