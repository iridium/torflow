// Daily job: snapshot the most recent consensuses into days/*.json. Safe to
// run repeatedly; fills any gaps within CollecTor's /recent window (~3 days).
// Run publish.js afterwards to rebuild the index.
//
//   node pipeline/update.js [--days 3]
import { parseArgs } from 'node:util';
import { buildDay } from './lib/aggregate.js';
import { fetchRecentConsensus } from './lib/collector.js';
import { parseConsensus } from './lib/consensus.js';
import { loadGeo } from './lib/geodb.js';
import { listDays, writeJson } from './lib/store.js';

const { values } = parseArgs({ options: { days: { type: 'string', default: '3' } } });

const have = new Set(await listDays());
const geo = await loadGeo();

const today = new Date();
for (let back = Number(values.days) - 1; back >= 0; back--) {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - back);
  const date = d.toISOString().slice(0, 10);
  if (have.has(date)) continue;
  const text = await fetchRecentConsensus(date);
  if (!text) { console.log(`${date}: no consensus in /recent`); continue; }
  const day = buildDay(parseConsensus(text), geo);
  await writeJson(`days/${date}.json`, day);
  console.log(`${date}: ${day.relays} relays at ${day.nodes.w.length} locations`);
}
