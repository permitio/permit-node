#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { digest, extractSdk } from '#scripts/api-contracts.mjs';
import {
  coverageReport,
  loadContractSources,
  sourceSnapshot,
  specInventory,
} from '#scripts/api-contract-report.mjs';

const publicSources = new Set([
  'https://api.permit.io/v2/openapi.json',
  'https://cloudpdp.api.permit.io/openapi.json',
]);

/** Fetches only public schema documentation, with bounded time and response size. */
export async function fetchInventory(record, fetcher = fetch) {
  if (!publicSources.has(record.url)) throw new Error(`Unapproved source URL for ${record.name}.`);
  try {
    const response = await fetcher(record.url, {
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const maximum = 10 * 1024 * 1024;
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > maximum) throw new Error('schema exceeds the 10 MiB response limit');
      chunks.push(chunk);
    }
    return specInventory(JSON.parse(Buffer.concat(chunks).toString('utf8')), record.name);
  } catch (error) {
    throw new Error(`${record.name}: cannot inspect published schema: ${error.message}`, {
      cause: error,
    });
  }
}

/** Produces local evidence; live mode compares public documentation with pinned snapshots. */
export async function inspectContracts({ root, live = false, fetcher = fetch }) {
  const { sources: reviewed, provenance } = loadContractSources(root);
  const baseline = JSON.parse(readFileSync(join(root, 'api-coverage/baseline.json'), 'utf8'));
  if (digest(provenance) !== digest(baseline.provenance))
    throw new Error('Source provenance changed without a reviewed contract baseline update.');
  baseline.sources = Object.fromEntries(
    Object.entries(reviewed).map(([name, inventory]) => [name, sourceSnapshot(inventory)]),
  );
  const sources = { ...reviewed };
  if (live) {
    for (const record of provenance.sources) {
      if (record.url) sources[record.name] = await fetchInventory(record, fetcher);
    }
  }
  const report = coverageReport({
    sdk: extractSdk(root),
    sources,
    provenance,
    baseline,
    decisions: JSON.parse(readFileSync(join(root, 'api-coverage/decisions.json'), 'utf8')),
  });
  return {
    ...report,
    mode: live ? 'public-source-drift' : 'reviewed-local-inventory',
    sourceProvenance: provenance.sources,
  };
}

/** Renders evidence status and per-operation results without an overall parity percentage. */
export function markdownReport(report) {
  if (report.integrity === 'INVALID')
    return `# API contract evidence\n\nIntegrity: INVALID\n\n${report.error}\n`;
  const lines = [
    '# API contract evidence',
    '',
    `Local integrity: **${report.integrity}**. Coverage: **${report.coverage}**.`,
    `Shared target: **${report.sharedTarget.status}** (${report.sharedTarget.owner}).`,
    `Real backend: **${report.realBackend.status}** — ${report.realBackend.reason}`,
    '',
    report.shapeEvidence,
    '',
    '| Source | Published operations | Primary exposed | Generated only | Supporting only | Missing |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const source of report.sourceProvenance) {
    const rows = report.operations.filter((operation) => operation.source === source.name);
    const count = (status) => rows.filter((operation) => operation.coverage === status).length;
    lines.push(
      `| ${source.name} | ${rows.length} | ${count('exposed')} | ${count('generated-only')} | ${count('supporting-only')} | ${count('missing') + count('deprecated-only')} |`,
    );
  }
  lines.push('', '## Failures', '');
  if (!report.failures.length)
    lines.push('No local inventory or reviewed-contract drift detected.');
  for (const failure of report.failures)
    lines.push(`- ${failure.kind}: ${failure.path} — ${failure.reason}`);
  lines.push(
    '',
    '## Operations',
    '',
    '| Source and operation | Evidence | Decision / owner |',
    '| --- | --- | --- |',
  );
  for (const operation of report.operations)
    lines.push(
      `| ${operation.source}: ${operation.method} ${operation.path} | ${operation.lifecycle}; ${operation.coverage}; backend NOT_MEASURED | ${operation.decision?.action ?? 'UNDECIDED'} / ${operation.decision?.owner ?? 'unassigned'} |`,
    );
  return lines.join('\n') + '\n';
}

/** Returns 0 for consistent local evidence, 1 for drift, and 2 for invalid/incomplete input. */
export async function main(
  args = process.argv.slice(2),
  root = resolve(import.meta.dirname, '..'),
) {
  let report;
  let output = resolve(root, 'coverage/api-contracts');
  try {
    let live = false;
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg === '--live') live = true;
      else if (arg === '--output' && args[index + 1]) output = resolve(args[++index]);
      else
        throw new Error(`Unknown or incomplete option ${arg}. Use --live or --output DIRECTORY.`);
    }
    report = await inspectContracts({ root, live });
  } catch (error) {
    report = { integrity: 'INVALID', error: error.message };
  }
  try {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(join(output, 'report.md'), markdownReport(report));
  } catch (error) {
    console.error(`Cannot save API evidence in ${output}: ${error.message}`);
    return 2;
  }
  console.log(`API contract evidence: ${report.integrity}; report: ${join(output, 'report.md')}`);
  if (report.integrity === 'INVALID') console.error(report.error);
  return report.integrity === 'PASS' ? 0 : report.integrity === 'FAIL' ? 1 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await main();
