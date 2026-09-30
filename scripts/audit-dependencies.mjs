import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';

export const TRIVY_VERSION = '0.74.0';
const severities = ['info', 'low', 'moderate', 'high', 'critical', 'unknown'];
const blocked = (finding) => ['high', 'critical'].includes(finding.severity) && finding.fixable;
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireValid(condition, message) {
  if (!condition) throw new Error(message);
}

/** Validates scanner process and JSON evidence before interpreting its findings. */
export function parsePnpmAudit(result) {
  requireValid(!result.error && [0, 1].includes(result.status), 'pnpm audit did not complete.');
  const data = JSON.parse(result.stdout);
  requireValid(!data.error && object(data.advisories), 'pnpm audit returned no advisory report.');
  const count = data.metadata?.totalDependencies;
  requireValid(Number.isSafeInteger(count) && count > 0, 'pnpm audit scanned no packages.');
  const counts = data.metadata?.vulnerabilities;
  requireValid(object(counts), 'pnpm audit omitted severity counts.');
  for (const severity of severities.slice(0, 5)) {
    requireValid(
      Number.isSafeInteger(counts[severity]) && counts[severity] >= 0,
      `pnpm audit has an invalid ${severity} count.`,
    );
  }
  const findings = Object.values(data.advisories).map((advisory) => {
    requireValid(
      nonempty(advisory.module_name) &&
        nonempty(advisory.url) &&
        nonempty(advisory.patched_versions) &&
        severities.includes(advisory.severity) &&
        Array.isArray(advisory.findings) &&
        advisory.findings.length > 0,
      'pnpm audit returned an incomplete advisory.',
    );
    for (const occurrence of advisory.findings) {
      requireValid(
        nonempty(occurrence.version) &&
          Array.isArray(occurrence.paths) &&
          occurrence.paths.length > 0 &&
          occurrence.paths.every(nonempty),
        'pnpm audit returned an advisory without affected versions or paths.',
      );
    }
    return {
      id: advisory.github_advisory_id ?? String(advisory.id),
      package: advisory.module_name,
      versions: [...new Set(advisory.findings.map((finding) => finding.version))],
      severity: advisory.severity,
      fixedVersions: advisory.patched_versions,
      fixable: advisory.patched_versions !== '<0.0.0',
      paths: advisory.findings.flatMap((finding) => finding.paths),
      url: advisory.url,
    };
  });
  for (const severity of severities.slice(0, 5)) {
    const described = findings.filter((finding) => finding.severity === severity).length;
    const hasReported = counts[severity] > 0;
    const hasDescribed = described > 0;
    requireValid(
      counts[severity] >= described &&
        (!['high', 'critical'].includes(severity) || hasReported === hasDescribed),
      `pnpm audit ${severity} findings/counts disagree.`,
    );
  }
  const reported = severities.slice(0, 5).reduce((sum, severity) => sum + counts[severity], 0);
  const hasFindings = findings.length > 0;
  requireValid(reported > 0 === hasFindings, 'pnpm audit findings/counts disagree.');
  requireValid(result.status === (reported > 0 ? 1 : 0), 'pnpm audit exit status/report disagree.');
  return { packageCount: count, findings, severityCounts: counts };
}

/** Projects an explicit scanner graph from runtime roots; missing inventory is invalid. */
export function parseTrivy(result, roots, expectedPackages) {
  requireValid(!result.error && result.status === 0, 'Trivy did not complete.');
  const data = JSON.parse(result.stdout);
  requireValid(data.SchemaVersion === 2 && Array.isArray(data.Results), 'Trivy omitted results.');
  const reports = data.Results.filter((entry) => entry.Type === 'pnpm');
  requireValid(reports.length === 1, 'Trivy must scan exactly one pnpm lockfile.');
  const report = reports[0];
  requireValid(
    Array.isArray(report.Packages) && report.Packages.length > 0,
    'Trivy scanned no packages.',
  );
  const inventory = new Map();
  for (const pkg of report.Packages) {
    requireValid(
      nonempty(pkg.ID) && nonempty(pkg.Name) && nonempty(pkg.Version) && !inventory.has(pkg.ID),
      'Trivy returned incomplete or duplicate inventory.',
    );
    inventory.set(pkg.ID, pkg);
  }
  for (const pkg of inventory.values()) {
    requireValid(
      pkg.DependsOn === undefined || Array.isArray(pkg.DependsOn),
      'Trivy returned invalid dependency edges.',
    );
    for (const dependency of pkg.DependsOn ?? []) {
      requireValid(inventory.has(dependency), `Trivy omitted dependency ${dependency}.`);
    }
  }
  const reachable = new Set();
  const pending = [];
  if (roots) {
    for (const [name, version] of Object.entries(roots)) {
      const matches = [...inventory.values()].filter(
        (pkg) => pkg.Name === name && pkg.Version === version,
      );
      requireValid(matches.length > 0, `Trivy omitted runtime root ${name}@${version}.`);
      pending.push(...matches.map((pkg) => pkg.ID));
    }
    requireValid(pending.length > 0, 'Runtime dependencies are empty.');
  } else pending.push(...inventory.keys());
  while (pending.length) {
    const id = pending.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    pending.push(...(inventory.get(id).DependsOn ?? []));
  }
  requireValid(
    Array.isArray(expectedPackages) && expectedPackages.length > 0,
    'Independent lock inventory is empty.',
  );
  const observed = [
    ...new Set(
      [...reachable].map((id) => {
        const pkg = inventory.get(id);
        return `${pkg.Name}@${pkg.Version}`;
      }),
    ),
  ].sort();
  requireValid(
    isDeepStrictEqual(observed, [...expectedPackages].sort()),
    'Trivy graph differs from the independent pnpm lock inventory.',
  );
  requireValid(
    report.Vulnerabilities === undefined || Array.isArray(report.Vulnerabilities),
    'Trivy returned invalid vulnerabilities.',
  );
  const findings = [];
  for (const advisory of report.Vulnerabilities ?? []) {
    const pkg = inventory.get(advisory.PkgID);
    requireValid(
      pkg &&
        pkg.Name === advisory.PkgName &&
        pkg.Version === advisory.InstalledVersion &&
        (advisory.FixedVersion === undefined || typeof advisory.FixedVersion === 'string') &&
        nonempty(advisory.VulnerabilityID) &&
        nonempty(advisory.PrimaryURL) &&
        nonempty(advisory.InstalledVersion) &&
        ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(advisory.Severity),
      'Trivy advisory has no inventory entry or required evidence.',
    );
    if (!reachable.has(advisory.PkgID)) continue;
    const severity = advisory.Severity === 'MEDIUM' ? 'moderate' : advisory.Severity.toLowerCase();
    findings.push({
      id: advisory.VulnerabilityID,
      package: advisory.PkgName,
      versions: [advisory.InstalledVersion],
      severity,
      fixedVersions: advisory.FixedVersion ?? '',
      fixable: nonempty(advisory.FixedVersion),
      paths: [advisory.PkgID],
      url: advisory.PrimaryURL,
    });
  }
  return { packageCount: reachable.size, findings };
}

/** Classifies all lanes without allowing an incomplete scanner to report a clean gate. */
export function summarize(lanes) {
  const invalid =
    lanes.length === 0 ||
    lanes.some(
      (lane) =>
        lane.status === 'INVALID' ||
        lane.scans.length !== 2 ||
        lane.scans.some(
          (scan) => !Number.isSafeInteger(scan.packageCount) || scan.packageCount < 1,
        ),
    );
  const fail = lanes.some((lane) => lane.scans.some((scan) => scan.findings.some(blocked)));
  return invalid ? 'INVALID' : fail ? 'FAIL' : 'PASS';
}

function command(binary, args, cwd) {
  // Caller-level scanner filters must not turn missing findings into a clean report.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('TRIVY_')),
  );
  return spawnSync(binary, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function checked(binary, args, cwd) {
  const result = command(binary, args, cwd);
  const detail = result.error?.message ?? result.stderr ?? result.stdout;
  requireValid(
    !result.error && result.status === 0,
    `${binary} ${args[0]} did not complete: ${detail}`,
  );
  return result.stdout;
}

function exactDependencies(manifest) {
  const dependencies = { ...manifest.dependencies, ...manifest.optionalDependencies };
  requireValid(Object.keys(dependencies).length > 0, 'Published runtime dependencies are empty.');
  for (const [name, version] of Object.entries(dependencies)) {
    requireValid(
      typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version),
      `${name} needs an exact runtime pin; add supported-range lanes before widening it.`,
    );
  }
  requireValid(
    !manifest.peerDependencies || Object.keys(manifest.peerDependencies).length === 0,
    'Peer dependencies need explicit consumer audit lanes.',
  );
  return dependencies;
}

/** Reads registry package identities from pnpm's lockfile-only dependency walk. */
export function parseInventory(result) {
  requireValid(!result.error && result.status === 0, 'pnpm lock inventory did not complete.');
  const projects = JSON.parse(result.stdout);
  requireValid(Array.isArray(projects) && projects.length > 0, 'pnpm lock inventory is empty.');
  const packages = new Set();
  function visit(node) {
    for (const field of ['dependencies', 'optionalDependencies', 'devDependencies']) {
      if (node[field] === undefined) continue;
      requireValid(object(node[field]), `Invalid ${field} in pnpm lock inventory.`);
      for (const [name, pkg] of Object.entries(node[field])) {
        requireValid(
          object(pkg) && nonempty(pkg.version),
          'Lock inventory package has no version.',
        );
        if (!/^(?:link:|file:|workspace:)/.test(pkg.version)) {
          requireValid(
            /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version),
            `Unsupported lock inventory version ${name}@${pkg.version}.`,
          );
          packages.add(`${name}@${pkg.version}`);
        }
        visit(pkg);
      }
    }
  }
  projects.forEach(visit);
  requireValid(packages.size > 0, 'pnpm lock inventory scanned no registry packages.');
  return [...packages].sort();
}

function scanLane({ name, cwd, roots, prod, filter, out, scratch }) {
  const lane = { name, status: 'PASS', scans: [], errors: [], expectedPackages: [] };
  const list = command(
    'pnpm',
    [
      ...(filter ? ['--filter', filter] : ['-r']),
      'list',
      '--lockfile-only',
      '--depth',
      'Infinity',
      '--json',
      ...(prod ? ['--prod'] : []),
    ],
    cwd,
  );
  try {
    lane.expectedPackages = parseInventory(list);
  } catch (error) {
    lane.errors.push(error.message);
  }
  writeFileSync(
    join(out, `${name}-inventory.json`),
    JSON.stringify(lane.expectedPackages, null, 2),
  );
  const args = [
    ...(filter ? ['--filter', filter] : []),
    'audit',
    '--json',
    '--audit-level',
    'info',
    ...(prod ? ['--prod'] : []),
  ];
  const trivyDir = join(scratch, name);
  mkdirSync(trivyDir, { recursive: true });
  copyFileSync(join(cwd, 'pnpm-lock.yaml'), join(trivyDir, 'pnpm-lock.yaml'));
  writeFileSync(join(trivyDir, 'empty-ignore'), '');
  writeFileSync(join(trivyDir, 'empty-config.yaml'), '{}\n');
  const scanners = [
    ['pnpm', args, () => cwd, parsePnpmAudit],
    [
      'trivy',
      [
        'fs',
        '--scanners',
        'vuln',
        '--pkg-types',
        'library',
        '--list-all-pkgs',
        '--include-dev-deps',
        '--format',
        'json',
        '--exit-code',
        '0',
        '--ignorefile',
        join(trivyDir, 'empty-ignore'),
        '--config',
        join(trivyDir, 'empty-config.yaml'),
        '--ignore-unfixed=false',
        '--severity',
        'UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL',
        trivyDir,
      ],
      () => trivyDir,
      (result) => parseTrivy(result, roots, lane.expectedPackages),
    ],
  ];
  for (const [scanner, options, directory, parse] of scanners) {
    const result = command(scanner, options, directory());
    writeFileSync(join(out, `${name}-${scanner}.json`), result.stdout ?? '');
    writeFileSync(join(out, `${name}-${scanner}.log`), result.stderr ?? '');
    try {
      const scan = { scanner, ...parse(result) };
      requireValid(
        scan.packageCount >= lane.expectedPackages.length,
        `${scanner} package count is below the independent inventory count.`,
      );
      lane.scans.push(scan);
      if (scan.findings.some(blocked)) lane.status = 'FAIL';
    } catch (error) {
      lane.errors.push(`${scanner}: ${error.message}`);
    }
  }
  if (lane.errors.length) lane.status = 'INVALID';
  return lane;
}

function markdown(report) {
  const lines = [
    `# Dependency security: ${report.status}`,
    '',
    'FAIL blocks fixable HIGH/CRITICAL findings. INVALID means the scan did not complete.',
    '',
    `Node ${report.node}; pnpm ${report.pnpm}; Trivy ${TRIVY_VERSION}.`,
    '',
    'Minimum/newest refer to exact declared direct pins, not the lowest transitive versions.',
    'Each fresh consumer resolves independently, without development dependencies.',
    '',
  ];
  if (report.artifact) lines.push(`Artifact SHA256: ${report.artifact.sha256}`, '');
  for (const lane of report.lanes) {
    lines.push(`## ${lane.name}: ${lane.status}`, '');
    for (const error of lane.errors) lines.push(`- INVALID: ${error}`);
    for (const scan of lane.scans) {
      lines.push(
        `- ${scan.scanner}: ${scan.packageCount} packages, ${scan.findings.length} findings.`,
      );
      if (scan.severityCounts)
        lines.push(
          `  - Registry totals (including meta-vulnerabilities): ` +
            JSON.stringify(scan.severityCounts),
        );
      for (const finding of scan.findings) {
        lines.push(
          `  - ${finding.severity.toUpperCase()} ${finding.package}@` +
            `${finding.versions.join(', ')}: ` +
            `${finding.id}; fix: ${finding.fixedVersions || 'not available'}; ${finding.url}`,
        );
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Runs audits before dependency installation, retaining each scanner's raw evidence. */
export function runSecurityGate({ root = process.cwd(), out, artifact, lockedOnly = false }) {
  out = resolve(out);
  mkdirSync(out, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), 'permit-security-'));
  const report = { status: 'INVALID', node: process.version, pnpm: '', lanes: [], artifact: null };
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const roots = exactDependencies(manifest);
    report.pnpm = checked('pnpm', ['--version'], root).trim();
    requireValid(
      manifest.packageManager === `pnpm@${report.pnpm}`,
      'pnpm version differs from packageManager.',
    );
    const trivy = JSON.parse(checked('trivy', ['version', '--format', 'json'], root));
    requireValid(
      trivy.Version === TRIVY_VERSION,
      `Install Trivy ${TRIVY_VERSION} before scanning.`,
    );
    for (const [name, prod] of [
      ['locked-runtime', true],
      ['development-tooling', false],
    ]) {
      report.lanes.push(
        scanLane({
          name,
          cwd: root,
          roots: prod ? roots : undefined,
          filter: prod ? manifest.name : undefined,
          prod,
          out,
          scratch,
        }),
      );
    }
    if (!lockedOnly) {
      requireValid(nonempty(artifact), 'Pass --artifact with the exact built npm tarball.');
      artifact = resolve(artifact);
      const bytes = readFileSync(artifact);
      report.artifact = {
        name: artifact.split(/[\\/]/).pop(),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      const packed = JSON.parse(checked('tar', ['-xOf', artifact, 'package/package.json'], root));
      const packedRoots = exactDependencies(packed);
      requireValid(
        packed.name === manifest.name &&
          packed.version === manifest.version &&
          isDeepStrictEqual(packedRoots, roots),
        'Packed artifact does not match the current package version/runtime dependencies.',
      );
      for (const [name, resolution] of [
        ['minimum-runtime', 'lowest-direct'],
        ['newest-runtime', 'highest'],
      ]) {
        const cwd = join(scratch, `${name}-consumer`);
        mkdirSync(cwd);
        writeFileSync(
          join(cwd, 'package.json'),
          JSON.stringify({
            private: true,
            name: `permit-security-${name}`,
            version: '1.0.0',
            packageManager: manifest.packageManager,
            dependencies: { [packed.name]: `file:${artifact}` },
          }),
        );
        writeFileSync(
          join(cwd, 'pnpm-workspace.yaml'),
          'packages: []\nignoreScripts: true\nminimumReleaseAge: 1440\n' +
            `autoInstallPeers: false\nresolutionMode: ${resolution}\n`,
        );
        try {
          // Resolve a lockfile without installing packages or running lifecycle scripts.
          checked(
            'pnpm',
            ['install', '--lockfile-only', '--ignore-scripts', '--prod', '--no-frozen-lockfile'],
            cwd,
          );
          copyFileSync(join(cwd, 'pnpm-lock.yaml'), join(out, `${name}-pnpm-lock.yaml`));
          const lane = scanLane({
            name,
            cwd,
            roots: { [packed.name]: packed.version },
            prod: true,
            out,
            scratch,
          });
          report.lanes.push(lane);
          if (lane.status === 'PASS')
            checked('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts', '--prod'], cwd);
        } catch (error) {
          const lane = report.lanes.find((entry) => entry.name === name);
          if (lane) {
            lane.status = 'INVALID';
            lane.errors.push(error.message);
          } else report.lanes.push({ name, status: 'INVALID', scans: [], errors: [error.message] });
        }
      }
    }
    requireValid(report.lanes.length === (lockedOnly ? 2 : 4), 'Not every required lane ran.');
    report.status = summarize(report.lanes);
  } catch (error) {
    report.lanes.push({ name: 'setup', status: 'INVALID', scans: [], errors: [error.message] });
  }
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const summary = markdown(report);
  writeFileSync(join(out, 'report.md'), summary);
  if (process.env['GITHUB_STEP_SUMMARY'])
    appendFileSync(process.env['GITHUB_STEP_SUMMARY'], summary);
  console.log(summary);
  rmSync(scratch, { recursive: true, force: true });
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        out: { type: 'string', default: 'security-report' },
        artifact: { type: 'string' },
        'locked-only': { type: 'boolean', default: false },
      },
    });
    const report = runSecurityGate({
      out: values.out,
      artifact: values.artifact,
      lockedOnly: values['locked-only'],
    });
    process.exitCode = { PASS: 0, FAIL: 1, INVALID: 2 }[report.status];
  } catch (error) {
    console.error(`Dependency security INVALID: ${error.message}`);
    process.exitCode = 2;
  }
}
