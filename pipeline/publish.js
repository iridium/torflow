// Rebuilds everything derived from Tor Metrics (index.json and clients/*)
// for the snapshots present in days/. Cheap enough to run on every build.
//
//   node pipeline/publish.js
import { fetchMetrics } from './lib/metrics.js';
import { SOURCES } from './lib/sources.js';
import { listDays, writeIndex } from './lib/store.js';

const days = await listDays();
console.log(`${days.length} snapshots; fetching Tor Metrics…`);
await writeIndex(days, await fetchMetrics(), SOURCES);
console.log('index.json and clients/ written');
