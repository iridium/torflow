// Fetching consensuses from CollecTor (https://collector.torproject.org):
// the last ~3 days live under /recent, older months in monthly tarballs.
import { execFile } from 'node:child_process';
import { readdir, readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { download, exists, fetchText, NotFound } from './net.js';

const BASE = process.env.COLLECTOR_URL || 'https://collector.torproject.org';
const run = promisify(execFile);

// Hours tried, in order, when picking a day's representative consensus.
const HOURS = ['00', '01', '02', '03', '12'];

/** The consensus for `date` (YYYY-MM-DD) from /recent, or null if not there. */
export async function fetchRecentConsensus(date) {
  for (const hh of HOURS) {
    try {
      return await fetchText(`${BASE}/recent/relay-descriptors/consensuses/${date}-${hh}-00-00-consensus`);
    } catch (err) {
      if (!(err instanceof NotFound)) throw err;
    }
  }
  return null;
}

/**
 * Downloads one month's archive and yields [date, consensusText] for every
 * requested day found in it. `month` is YYYY-MM; `days` a Set of YYYY-MM-DD.
 */
export async function* archivedConsensuses(month, days, cacheDir) {
  const tarball = join(cacheDir, `consensuses-${month}.tar.xz`);
  if (!(await exists(tarball))) {
    console.log(`  downloading consensuses-${month}.tar.xz`);
    await download(`${BASE}/archive/relay-descriptors/consensuses/consensuses-${month}.tar.xz`, tarball);
  }
  const workDir = join(cacheDir, `consensuses-${month}`);
  await rm(workDir, { recursive: true, force: true });
  await mkdir(cacheDir, { recursive: true });
  // Only extract the early-morning consensuses; a month holds ~720 of them.
  await run('tar', ['-xJf', tarball, '-C', cacheDir, '--wildcards',
    ...HOURS.map((hh) => `*-${hh}-00-00-consensus`)], { maxBuffer: 1 << 26 });

  try {
    for (const dd of (await readdir(workDir)).sort()) {
      const date = `${month}-${dd}`;
      if (!days.has(date)) continue;
      const files = await readdir(join(workDir, dd));
      const pick = HOURS.map((hh) => `${date}-${hh}-00-00-consensus`).find((f) => files.includes(f));
      if (pick) yield [date, await readFile(join(workDir, dd, pick), 'utf8')];
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
