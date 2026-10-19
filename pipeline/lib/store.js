// The output tree, published as-is under /data on the static site:
//
//   days/YYYY-MM-DD.json        relay locations for one day (see aggregate.js);
//                               the only files kept between runs (data branch)
//   index.json                  dates with relay snapshots + daily network series
//   clients/month/YYYY-MM.json  users per country for every day of a month
//   clients/country/CC.json     full daily user series for one country
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const OUT_DIR = process.env.OUT_DIR || 'out';

export async function writeJson(rel, data) {
  const path = join(OUT_DIR, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
}

export async function readJson(rel, fallback = null) {
  try {
    return JSON.parse(await readFile(join(OUT_DIR, rel), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

/** Dates that already have a days/*.json snapshot. */
export async function listDays() {
  try {
    return (await readdir(join(OUT_DIR, 'days')))
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/** Every YYYY-MM-DD from `start` to `end` inclusive. */
export function dateRange(start, end) {
  const out = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const minKey = (...maps) => maps.flatMap((m) => [...m.keys()]).sort()[0];
const maxKey = (...maps) => maps.flatMap((m) => [...m.keys()]).sort().at(-1);

/**
 * Rewrites index.json and the client files from fresh Tor Metrics data.
 * @param {string[]} days  dates that have a days/*.json snapshot
 */
export async function writeIndex(days, metrics, sources) {
  const { bandwidth, clients, onion } = metrics;
  const sorted = [...new Set(days)].sort();
  const start = [minKey(bandwidth, clients.total), sorted[0]].filter(Boolean).sort()[0];
  const end = [maxKey(bandwidth, clients.total), sorted.at(-1)].filter(Boolean).sort().at(-1);
  const dates = start ? dateRange(start, end) : [];

  const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  const series = {
    start,
    // Gbit/s, from Tor Metrics
    advbw: dates.map((d) => r3(bandwidth.get(d)?.advbw)),
    bwhist: dates.map((d) => r3(bandwidth.get(d)?.bwhist)),
    // Share of consumed bandwidth that is onion-service rendezvous traffic.
    onion: dates.map((d) => {
      const o = onion.get(d), b = bandwidth.get(d)?.bwhist;
      return o != null && b ? Math.round(Math.min(o / b, 0.5) * 1e4) / 1e4 : null;
    }),
    users: dates.map((d) => clients.total.get(d) ?? null),
  };
  await writeJson('index.json', { generated: new Date().toISOString(), sources, days: sorted, series });

  // Per-country series.
  const clientDates = [...clients.total.keys()].sort();
  if (!clientDates.length) return;
  const cStart = clientDates[0];
  const cDates = dateRange(cStart, clientDates.at(-1));
  for (const [cc, s] of clients.byCountry) {
    await writeJson(`clients/country/${cc}.json`, { cc, start: cStart, users: cDates.map((d) => s.get(d) ?? null) });
  }
  // Per-month snapshots for the choropleth.
  const months = new Map();
  for (const d of cDates) {
    const m = d.slice(0, 7);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(d);
  }
  for (const [m, mDates] of months) {
    const countries = {};
    for (const [cc, s] of clients.byCountry) {
      const vals = mDates.map((d) => s.get(d) ?? null);
      if (vals.some((v) => v != null)) countries[cc] = vals;
    }
    await writeJson(`clients/month/${m}.json`, { month: m, dates: mDates, countries });
  }
}
