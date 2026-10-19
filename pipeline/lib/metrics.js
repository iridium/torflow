// Network-wide daily statistics from Tor Metrics (https://metrics.torproject.org).
// All CSVs are parsed by header name so column reordering doesn't break us.
import { fetchText } from './net.js';

const BASE = process.env.METRICS_URL || 'https://metrics.torproject.org';

/** Parses a Tor Metrics CSV (with leading "#" comment lines) into row objects. */
export function parseCsv(text) {
  const lines = text.split('\n').filter((l) => l && !l.startsWith('#'));
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

const num = (v) => (v === '' || v === 'NA' || v == null ? null : Number(v));

/** date -> { advbw, bwhist } in Gbit/s. */
export function parseBandwidth(text) {
  const out = new Map();
  for (const r of parseCsv(text)) {
    if (!r.date) continue;
    out.set(r.date, { advbw: num(r.advbw), bwhist: num(r.bwhist) });
  }
  return out;
}

/**
 * Relay-connecting users per country, from userstats-relay-country.csv
 * without a country filter (columns: date,country,users,lower,upper,frac;
 * an empty country is the network total).
 * @returns {{ total: Map<string, number>, byCountry: Map<string, Map<string, number>> }}
 *   total: date -> users; byCountry: CC (upper case) -> date -> users
 */
export function parseClients(text) {
  const total = new Map();
  const byCountry = new Map();
  for (const r of parseCsv(text)) {
    const users = num(r.users);
    if (users == null || !r.date) continue;
    if (!r.country) {
      total.set(r.date, Math.round(users));
      continue;
    }
    const cc = r.country.toUpperCase();
    if (cc === '??' || cc.length !== 2) continue;
    let series = byCountry.get(cc);
    if (!series) byCountry.set(cc, (series = new Map()));
    series.set(r.date, Math.round(users));
  }
  return { total, byCountry };
}

/** date -> onion-service rendezvous traffic in Gbit/s. */
export function parseOnionTraffic(text) {
  const out = new Map();
  for (const r of parseCsv(text)) {
    const v = num(r.relayed);
    if (r.date && v != null && v >= 0) out.set(r.date, v);
  }
  return out;
}

export async function fetchMetrics() {
  const get = (path) => fetchText(`${BASE}/${path}`);
  // Graph CSVs default to the last 90 days unless given a range.
  const today = new Date().toISOString().slice(0, 10);
  const range = `start=2007-10-01&end=${today}`;
  const [bandwidth, clients, onion] = await Promise.all([
    get(`bandwidth.csv?${range}`).then(parseBandwidth),
    get(`userstats-relay-country.csv?start=2011-09-01&end=${today}`).then(parseClients),
    // Optional: onion-service traffic only tints a share of the particles.
    get(`hidserv-rend-v3-relayed-cells.csv?${range}`).then(parseOnionTraffic).catch((err) => {
      console.warn(`  onion-service stats unavailable (${err.message}); using default share`);
      return new Map();
    }),
  ]);
  return { bandwidth, clients, onion };
}
