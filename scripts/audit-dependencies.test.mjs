import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { expect, onTestFinished, test } from 'vitest';

import { parsePnpmAudit, parseTrivy, summarize } from '#scripts/audit-dependencies.mjs';

const roots = { fixture: '1.0.0' };
const inventory = ['child@1.0.0', 'fixture@1.0.0'];
const cleanPnpm = () => ({
  advisories: {},
  metadata: {
    totalDependencies: 3,
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
  },
});
const cleanTrivy = () => ({
  SchemaVersion: 2,
  Results: [
    {
      Type: 'pnpm',
      Packages: [
        { ID: 'fixture@1.0.0', Name: 'fixture', Version: '1.0.0', DependsOn: ['child@1.0.0'] },
        { ID: 'child@1.0.0', Name: 'child', Version: '1.0.0' },
      ],
      Vulnerabilities: [],
    },
  ],
});
const response = (data, status = 0) => ({ stdout: JSON.stringify(data), status });

function advisory(severity = 'high', fixed = '>=1.0.1') {
  return {
    id: 123,
    module_name: 'child',
    severity,
    patched_versions: fixed,
    github_advisory_id: 'GHSA-fixture',
    url: 'https://example.test/advisory',
    findings: [{ version: '1.0.0', paths: ['.>fixture>child'] }],
  };
}

function trivyAdvisory(severity = 'HIGH', fixed = '1.0.1') {
  return {
    PkgID: 'child@1.0.0',
    PkgName: 'child',
    InstalledVersion: '1.0.0',
    VulnerabilityID: 'CVE-fixture',
    PrimaryURL: 'https://example.test/advisory',
    Severity: severity,
    FixedVersion: fixed,
  };
}

function lane(scans) {
  return { status: 'PASS', scans };
}

test('nonempty clean reports prove both scanners ran', () => {
  const scans = [
    parsePnpmAudit(response(cleanPnpm())),
    parseTrivy(response(cleanTrivy()), roots, inventory),
  ];
  expect(scans.map((scan) => scan.packageCount)).toEqual([3, 2]);
  expect(summarize([lane(scans)])).toBe('PASS');
});

for (const [severity, fix, expected] of [
  ['high', '>=1.0.1', 'FAIL'],
  ['critical', '>=1.0.1', 'FAIL'],
  ['moderate', '>=1.0.1', 'PASS'],
  ['low', '>=1.0.1', 'PASS'],
  ['high', '<0.0.0', 'PASS'],
]) {
  test(`pnpm ${severity} with fix ${fix} is ${expected} and remains in the report`, () => {
    const data = cleanPnpm();
    data.advisories['123'] = advisory(severity, fix);
    data.metadata.vulnerabilities[severity] = 1;
    const parsed = parsePnpmAudit(response(data, 1));
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].paths).toEqual(['.>fixture>child']);
    expect(summarize([lane([parsed, parseTrivy(response(cleanTrivy()), roots, inventory)])])).toBe(
      expected,
    );
  });
}

for (const [severity, fix, expected] of [
  ['HIGH', '1.0.1', 'FAIL'],
  ['CRITICAL', '1.0.1', 'FAIL'],
  ['MEDIUM', '1.0.1', 'PASS'],
  ['HIGH', '', 'PASS'],
  ['UNKNOWN', '', 'PASS'],
]) {
  test(`Trivy ${severity} with fix ${JSON.stringify(fix)} is ${expected} and visible`, () => {
    const data = cleanTrivy();
    data.Results[0].Vulnerabilities.push(trivyAdvisory(severity, fix));
    const parsed = parseTrivy(response(data), roots, inventory);
    expect(parsed.findings).toHaveLength(1);
    expect(summarize([lane([parsePnpmAudit(response(cleanPnpm())), parsed])])).toBe(expected);
  });
}

for (const bad of [
  { stdout: '', status: 0 },
  { stdout: '{invalid', status: 0 },
  { stdout: '{}', status: 0 },
  { stdout: '{"error":"offline"}', status: 1 },
  response(cleanPnpm(), 1),
  response(cleanPnpm(), 2),
  { ...response(cleanPnpm()), error: new Error('spawn failed') },
  response({ ...cleanPnpm(), metadata: { ...cleanPnpm().metadata, totalDependencies: 0 } }),
]) {
  test(`rejects invalid pnpm evidence ${JSON.stringify(bad)}`, () => {
    expect(() => parsePnpmAudit(bad)).toThrow();
  });
}

test('pnpm advisory/count disagreement cannot erase a finding', () => {
  const data = cleanPnpm();
  data.advisories['123'] = advisory();
  expect(() => parsePnpmAudit(response(data))).toThrow(/disagree/);
});

for (const [name, mutate] of [
  [
    'empty results',
    (data) => {
      data.Results = [];
    },
  ],
  [
    'null results',
    (data) => {
      data.Results = null;
    },
  ],
  [
    'empty inventory',
    (data) => {
      data.Results[0].Packages = [];
    },
  ],
  [
    'missing root',
    (data) => {
      data.Results[0].Packages.shift();
    },
  ],
  [
    'missing edge',
    (data) => {
      data.Results[0].Packages.pop();
    },
  ],
  [
    'duplicate package',
    (data) => {
      data.Results[0].Packages.push(data.Results[0].Packages[0]);
    },
  ],
  [
    'orphan advisory',
    (data) => {
      data.Results[0].Vulnerabilities.push({ ...trivyAdvisory(), PkgID: 'absent' });
    },
  ],
  [
    'invalid severity',
    (data) => {
      data.Results[0].Vulnerabilities.push(trivyAdvisory('NONE'));
    },
  ],
]) {
  test(`Trivy ${name} is invalid`, () => {
    const data = cleanTrivy();
    mutate(data);
    expect(() => parseTrivy(response(data), roots, inventory)).toThrow();
  });
}

for (const edges of [undefined, []]) {
  test(`Trivy omitted runtime edges ${JSON.stringify(edges)} cannot hide a package`, () => {
    const data = cleanTrivy();
    data.Results[0].Packages[0].DependsOn = edges;
    expect(() => parseTrivy(response(data), roots, inventory)).toThrow(/independent pnpm lock/);
  });
}

for (const fixed of [[], {}, null]) {
  test(`Trivy malformed fix ${JSON.stringify(fixed)} cannot turn HIGH into unfixable`, () => {
    const data = cleanTrivy();
    data.Results[0].Vulnerabilities.push(trivyAdvisory('HIGH', fixed));
    expect(() => parseTrivy(response(data), roots, inventory)).toThrow(/required evidence/);
  });
}

for (const mismatch of [{ PkgName: 'other' }, { InstalledVersion: '2.0.0' }]) {
  test(`Trivy advisory identity mismatch ${JSON.stringify(mismatch)} is invalid`, () => {
    const data = cleanTrivy();
    data.Results[0].Vulnerabilities.push({ ...trivyAdvisory(), ...mismatch });
    expect(() => parseTrivy(response(data), roots, inventory)).toThrow(/required evidence/);
  });
}

for (const expected of [[], ['fixture@1.0.0'], [...inventory, 'extra@1.0.0']]) {
  test(`Trivy requires matching independent inventory ${JSON.stringify(expected)}`, () => {
    expect(() => parseTrivy(response(cleanTrivy()), roots, expected)).toThrow(/inventory/);
  });
}

test('Trivy process failure cannot become clean from valid stdout', () => {
  expect(() => parseTrivy(response(cleanTrivy(), 1), roots, inventory)).toThrow(/did not complete/);
});

test('runtime excludes disconnected tooling; the tooling lane retains its findings', () => {
  const data = cleanTrivy();
  data.Results[0].Packages.push({ ID: 'tool@1.0.0', Name: 'tool', Version: '1.0.0' });
  data.Results[0].Vulnerabilities.push({
    ...trivyAdvisory(),
    PkgID: 'tool@1.0.0',
    PkgName: 'tool',
  });
  expect(parseTrivy(response(data), roots, inventory)).toMatchObject({
    packageCount: 2,
    findings: [],
  });
  expect(parseTrivy(response(data), undefined, [...inventory, 'tool@1.0.0'])).toMatchObject({
    packageCount: 3,
    findings: [expect.anything()],
  });
});

test('missing lanes/scanners and invalid evidence never summarize as clean', () => {
  expect(summarize([])).toBe('INVALID');
  expect(summarize([lane([])])).toBe('INVALID');
  expect(summarize([{ status: 'INVALID', scans: [] }])).toBe('INVALID');
});

function fixture({
  pnpm = cleanPnpm(),
  trivy = cleanTrivy(),
  pnpmStatus = 0,
  trivyStatus = 0,
} = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'permit audit '));
  onTestFinished(() => rmSync(cwd, { recursive: true, force: true }));
  const bin = join(cwd, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({
      name: 'fixture-sdk',
      version: '1.0.0',
      packageManager: 'pnpm@12.8.1',
      dependencies: roots,
    }),
  );
  writeFileSync(join(cwd, 'artifact.tgz'), 'packed bytes');
  writeFileSync(join(cwd, 'artifact-manifest.json'), readFileSync(join(cwd, 'package.json')));
  writeFileSync(join(cwd, 'pnpm-lock.yaml'), 'fixture lock: process boundary is stubbed\n');
  const writeTool = (name, body) =>
    writeFileSync(join(bin, name), `#!${process.execPath}\n${body}`, { mode: 0o755 });
  writeTool(
    'pnpm',
    `const fs=require('node:fs'); const args=process.argv.slice(2);
if(args.includes('--version')) console.log('12.8.1');
else if(args.includes('list')) {
const deps={fixture:{version:'1.0.0',dependencies:{child:{version:'1.0.0'}}}};
const local=JSON.parse(fs.readFileSync('package.json','utf8'));
const dependencies = local.dependencies['fixture-sdk']
  ? {'fixture-sdk':{version:'1.0.0',dependencies:deps}} : deps;
console.log(JSON.stringify([{dependencies}]));
}
else if(args.includes('audit')) {
  console.log(${JSON.stringify(JSON.stringify(pnpm))});
  process.exitCode=${pnpmStatus};
}
else {
fs.appendFileSync(${JSON.stringify(join(cwd, 'calls'))}, JSON.stringify(args)+'\\n');
if(args.includes('--lockfile-only')) {
  fs.writeFileSync('pnpm-lock.yaml','fixture');
  process.exitCode=Number(process.env.RESOLVE_STATUS ?? 0);
}
else {
  fs.appendFileSync(${JSON.stringify(join(cwd, 'installed'))},JSON.stringify(args)+'\\n');
  process.exitCode=Number(process.env.INSTALL_STATUS ?? 0);
}
}`,
  );
  writeTool(
    'trivy',
    `if(process.argv.includes('version')) console.log('{"Version":"0.74.0"}');
else { const data=${JSON.stringify(trivy)};
if(/(?:minimum|newest)-runtime$/.test(process.cwd()) && data.Results?.[0]?.Packages) {
  data.Results[0].Packages.push({ID:'fixture-sdk@1.0.0',Name:'fixture-sdk',
    Version:'1.0.0',DependsOn:['fixture@1.0.0']});
}
console.log(JSON.stringify(data)); process.exitCode=${trivyStatus}; }`,
  );
  writeTool(
    'tar',
    `const manifest=${JSON.stringify(join(cwd, 'artifact-manifest.json'))};
console.log(require('node:fs').readFileSync(manifest, 'utf8'));`,
  );
  return {
    cwd,
    run(args = [], env = {}) {
      const result = spawnSync(
        process.execPath,
        [
          join(process.cwd(), 'scripts/audit-dependencies.mjs'),
          ...(args.includes('--artifact') ? [] : ['--locked-only']),
          '--out',
          'report',
          ...args,
        ],
        {
          cwd,
          encoding: 'utf8',
          env: { ...process.env, ...env, PATH: bin + delimiter + process.env['PATH'] },
        },
      );
      return {
        ...result,
        report: JSON.parse(readFileSync(join(cwd, 'report/report.json'), 'utf8')),
      };
    },
  };
}

for (const [name, input, expected] of [
  ['clean', {}, 0],
  ['scanner error', { trivyStatus: 17 }, 2],
  ['empty scan', { trivy: { SchemaVersion: 2, Results: [] } }, 2],
  [
    'omitted runtime dependency edges',
    (() => {
      const trivy = cleanTrivy();
      delete trivy.Results[0].Packages[0].DependsOn;
      return { trivy };
    })(),
    2,
  ],
  [
    'fixable vulnerability',
    (() => {
      const pnpm = cleanPnpm();
      pnpm.advisories['123'] = advisory();
      pnpm.metadata.vulnerabilities.high = 1;
      return { pnpm, pnpmStatus: 1 };
    })(),
    1,
  ],
]) {
  test(`CLI ${name} exits ${expected} with persistent evidence`, () => {
    const f = fixture(input);
    const result = f.run();
    expect(result.status, result.stderr + result.stdout).toBe(expected);
    expect(result.report.lanes).toHaveLength(2);
    expect(result.report.status).toBe(['PASS', 'FAIL', 'INVALID'][expected]);
    expect(readFileSync(join(f.cwd, 'report/report.md'), 'utf8')).toContain(result.report.status);
  });
}

test('pnpm HIGH counts cannot be hidden behind a LOW advisory', () => {
  const data = cleanPnpm();
  data.metadata.vulnerabilities.high = 1;
  data.advisories['123'] = advisory('low');
  expect(() => parsePnpmAudit(response(data, 1))).toThrow(/findings\/counts disagree/);
});

test('pnpm retains legitimate extra LOW meta-vulnerability counts', () => {
  const data = cleanPnpm();
  data.metadata.vulnerabilities.high = 1;
  data.metadata.vulnerabilities.low = 2;
  data.advisories['123'] = advisory('high');
  const parsed = parsePnpmAudit(response(data, 1));
  expect(parsed.severityCounts.low).toBe(2);
  expect(summarize([lane([parsed, parseTrivy(response(cleanTrivy()), roots, inventory)])])).toBe(
    'FAIL',
  );
});

test('full gate audits both independent consumers before frozen script-free installation', () => {
  const f = fixture();
  const result = f.run(['--artifact', 'artifact.tgz']);
  expect(result.status, result.stderr + result.stdout).toBe(0);
  expect(result.report.lanes.map((entry) => entry.name)).toEqual([
    'locked-runtime',
    'development-tooling',
    'minimum-runtime',
    'newest-runtime',
  ]);
  expect(result.report.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
  const installs = readFileSync(join(f.cwd, 'installed'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  expect(installs).toHaveLength(2);
  for (const args of installs)
    expect(args).toEqual(['install', '--frozen-lockfile', '--ignore-scripts', '--prod']);
  const all = readFileSync(join(f.cwd, 'calls'), 'utf8').trim().split('\n').map(JSON.parse);
  expect(all).toHaveLength(4);
  for (const args of all) expect(args).toContain('--ignore-scripts');
});

for (const status of ['1', '2']) {
  test(`failed or invalid scans (${status}) never install consumer packages`, () => {
    const pnpm = cleanPnpm();
    pnpm.advisories['123'] = advisory();
    pnpm.metadata.vulnerabilities.high = 1;
    const f = status === '1' ? fixture({ pnpm, pnpmStatus: 1 }) : fixture({ trivyStatus: 17 });
    const result = f.run(['--artifact', 'artifact.tgz']);
    expect(result.status, result.stdout + result.stderr).toBe(Number(status));
    expect(result.report.lanes).toHaveLength(4);
    expect(existsSync(join(f.cwd, 'installed'))).toBe(false);
  });
}

for (const variable of ['RESOLVE_STATUS', 'INSTALL_STATUS']) {
  test(`${variable} failure is INVALID and retained in the report`, () => {
    const f = fixture();
    const result = f.run(['--artifact', 'artifact.tgz'], { [variable]: '42' });
    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.report.lanes.filter((entry) => entry.status === 'INVALID')).toHaveLength(2);
  });
}

test('missing artifact is INVALID and cannot reach consumer installation', () => {
  const f = fixture();
  const result = f.run(['--artifact', 'missing.tgz']);
  expect(result.status).toBe(2);
  expect(existsSync(join(f.cwd, 'installed'))).toBe(false);
});

test('a tarball with mismatched version or dependencies is INVALID', () => {
  const f = fixture();
  const packed = JSON.parse(readFileSync(join(f.cwd, 'artifact-manifest.json'), 'utf8'));
  packed.version = '2.0.0';
  writeFileSync(join(f.cwd, 'artifact-manifest.json'), JSON.stringify(packed));
  const result = f.run(['--artifact', 'artifact.tgz']);
  expect(result.status, result.stdout + result.stderr).toBe(2);
  expect(result.report.lanes.at(-1).errors.join(' ')).toMatch(/does not match/);
  expect(existsSync(join(f.cwd, 'installed'))).toBe(false);
});

test('widened direct ranges require supported-range lanes instead of silently using newest', () => {
  const f = fixture();
  const manifest = JSON.parse(readFileSync(join(f.cwd, 'package.json'), 'utf8'));
  manifest.dependencies.fixture = '^1.0.0';
  writeFileSync(join(f.cwd, 'package.json'), JSON.stringify(manifest));
  const result = f.run();
  expect(result.status).toBe(2);
  expect(result.report.lanes.at(-1).errors.join(' ')).toMatch(/exact runtime pin/);
});
