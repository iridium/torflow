// One-off historical import from CollecTor's monthly archives.
//
//   node pipeline/backfill.js --from 2024-01-01 [--to 2024-12-31] [--every 1]
//
// --every N keeps one snapshot every N days (e.g. 7 for weekly). Existing
// days are skipped, so an interrupted run can simply be restarted.
// Run publish.js afterwards to rebuild the index.
// Note: IPs are geolocated with today's database, so locations for very old
// dates are approximate.
import { parseArgs } from 'node:util';
import { buildDay } from './lib/aggregate.js';
import { archivedConsensuses } from './lib/collector.js';
import { parseConsensus } from './lib/consensus.js';
import { CACHE_DIR, loadGeo } from './lib/geodb.js';
import { dateRange, listDays, writeJson } from './lib/store.js';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    every: { type: 'string', default: '1' },
    'keep-archives': { type: 'boolean', default: false },
  },
});
if (!values.from) {
  console.error('usage: backfill.js --from YYYY-MM-DD [--to YYYY-MM-DD] [--every N] [--keep-archives]');
  process.exit(1);
}

// /recent covers the last few days; the archive for the current month is
// only published once the month is over.
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const to = values.to && values.to < yesterday ? values.to : yesterday;
const every = Math.max(1, Number(values.every));

const have = new Set(await listDays());
const wanted = dateRange(values.from, to).filter((_, i) => i % every === 0).filter((d) => !have.has(d));

const byMonth = new Map();
for (const d of wanted) {
  const m = d.slice(0, 7);
  if (!byMonth.has(m)) byMonth.set(m, new Set());
  byMonth.get(m).add(d);
}
console.log(`${wanted.length} days to import across ${byMonth.size} months`);

const geo = await loadGeo();
const thisMonth = new Date().toISOString().slice(0, 7);
for (const [month, days] of byMonth) {
  if (month >= thisMonth) {
    console.log(`${month}: not archived yet (the daily update covers recent days)`);
    continue;
  }
  console.log(`${month}:`);
  try {
    for await (const [date, text] of archivedConsensuses(month, days, CACHE_DIR)) {
      const day = buildDay(parseConsensus(text), geo);
      await writeJson(`days/${date}.json`, day);
      have.add(date);
      console.log(`  ${date}: ${day.relays} relays at ${day.nodes.w.length} locations`);
    }
  } catch (err) {
    console.warn(`  skipped ${month}: ${err.message}`);
  }
  if (!values['keep-archives']) {
    await rm(join(CACHE_DIR, `consensuses-${month}.tar.xz`), { force: true });
  }
}
