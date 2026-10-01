import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

const marker = 'reference-source.json';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Binds the actual reference files to the checked-out commit and the uploading workflow run. */
export function bindReference({
  root,
  output,
  commit,
  repository,
  runId,
  runAttempt,
  write = false,
}) {
  if (
    repository !== 'permitio/permit-node' ||
    !/^[0-9a-f]{40}$/.test(commit ?? '') ||
    !/^[1-9]\d*$/.test(runId ?? '') ||
    !/^[1-9]\d*$/.test(runAttempt ?? '')
  )
    throw new Error(
      'Reference identity needs the trusted repository, full commit and run identity.',
    );
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
  }).trim();
  if (head !== commit)
    throw new Error(
      'Reference source differs from the intended commit; rebuild that exact commit.',
    );
  const dirty = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
  }).trim();
  if (dirty)
    throw new Error('Reference source checkout is dirty; rebuild from the clean intended commit.');

  const checkout = realpathSync(root);
  const directory = resolve(checkout, output);
  if (
    !directory.startsWith(checkout + sep) ||
    realpathSync(directory) !== directory ||
    !lstatSync(directory).isDirectory()
  )
    throw new Error('Reference output must be a real directory inside the checked-out repository.');
  const files = [];
  function visit(path) {
    const name = relative(directory, path).split(sep).join('/');
    const info = lstatSync(path);
    if (info.isSymbolicLink() || name.split('/').some((part) => ['.git', '.github'].includes(part)))
      throw new Error(`Reference artifact contains an excluded or symbolic path: ${name}.`);
    if (info.isDirectory()) {
      for (const child of readdirSync(path).sort()) visit(join(path, child));
    } else if (!info.isFile() || info.nlink !== 1) {
      throw new Error(`Reference artifact requires regular files without hard links: ${name}.`);
    } else if (name !== marker) {
      files.push({ path: name, sha256: sha256(readFileSync(path)) });
    }
  }
  visit(directory);
  if (!files.some((file) => file.path === 'index.html'))
    throw new Error('Reference artifact has no index.html; rebuild the public documentation.');
  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const identity = {
    schema: 1,
    repository,
    commit,
    runId,
    runAttempt,
    fileCount: files.length,
    contentSha256: sha256(JSON.stringify(files)),
  };
  const file = join(directory, marker);
  if (write) {
    writeFileSync(file, JSON.stringify(identity, null, 2) + '\n');
  } else {
    if (!existsSync(file))
      throw new Error('Missing reference-source.json; bind the validated reference before upload.');
    if (!isDeepStrictEqual(JSON.parse(readFileSync(file, 'utf8')), identity))
      throw new Error('Reference artifact differs from its source/content identity; rebuild it.');
  }
  return identity;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (
    args[0] !== '--out' ||
    !args[1] ||
    args[1].startsWith('--') ||
    args.length > 3 ||
    (args.length === 3 && args[2] !== '--write')
  )
    throw new Error('Usage: node scripts/reference-pages.mjs --out DIRECTORY [--write]');
  const identity = bindReference({
    root: process.cwd(),
    output: args[1],
    commit: process.env['EXPECTED_COMMIT'],
    repository: process.env['GITHUB_REPOSITORY'],
    runId: process.env['GITHUB_RUN_ID'],
    runAttempt: process.env['GITHUB_RUN_ATTEMPT'],
    write: args.includes('--write'),
  });
  console.log('Reference source/content identity PASS: ' + JSON.stringify(identity));
}
