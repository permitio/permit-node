import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Reports unresolved shared acceptance without treating local quality as release approval. */
export function publicationBlockers(root = process.cwd()) {
  const sources = JSON.parse(readFileSync(join(root, 'api-coverage/sources.json'), 'utf8'));
  const shared = sources.unmeasuredCapabilities?.sharedTarget;
  const blockers = [];
  if (shared?.status === 'UNAVAILABLE' && shared.owner === 'PER-16345')
    blockers.push('UNAVAILABLE: the adopted shared target is missing (PER-16345).');
  else
    blockers.push(
      'INVALID: shared-target adoption needs a reviewed acceptance contract (PER-16561).',
    );
  blockers.push(
    'BLOCKED: SDK71 validates local evidence and has no releaseReady=true contract; ' +
      'shared acceptance and Curtain Call remain unresolved (PER-16561, PER-16574).',
  );
  return blockers;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  for (const blocker of publicationBlockers()) console.error(blocker);
  process.exitCode = 2;
}
