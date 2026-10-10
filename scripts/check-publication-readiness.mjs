import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { main } from '#scripts/check-release-evidence.mjs';

// Publication repeats the independent archive/source/lock and complete Node evidence checks.
// Missing files, CI identity, feature proof or successful required gates keep exit code 2.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await main();
