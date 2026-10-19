// Fetches the static JSON produced by the pipeline (see pipeline/lib/store.js).
import { Config } from './config.js';

const cache = new Map();

function get(path) {
  if (!cache.has(path)) {
    const p = fetch(`${Config.dataUrl}/${path}`).then((res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} fetching ${path}`);
      return res.json();
    });
    p.catch(() => cache.delete(path)); // let failed requests be retried
    cache.set(path, p);
  }
  return cache.get(path);
}

const DAY_MS = 864e5;
const dayIndex = (start, iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);

export class Data {
  async load() {
    this.index = await get('index.json');
    if (!this.index?.days?.length) throw new Error('No data published yet.');
    this.days = this.index.days;
    return this;
  }

  /** Value of a daily network series on `iso`, or the closest earlier value. */
  series(name, iso) {
    const s = this.index.series;
    const values = s?.[name];
    if (!values?.length) return null;
    let i = Math.min(dayIndex(s.start, iso), values.length - 1);
    for (; i >= 0; i--) if (values[i] != null) return values[i];
    return null;
  }

  /** Full daily series as [{ date, value }] (nulls dropped). */
  seriesPoints(name) {
    const s = this.index.series;
    if (!s?.[name]) return [];
    const start = Date.parse(`${s.start}T00:00:00Z`);
    return s[name]
      .map((value, i) => ({ date: new Date(start + i * DAY_MS), value }))
      .filter((d) => d.value != null);
  }

  /** Decoded relay locations for a snapshot day. */
  async day(iso) {
    const raw = await get(`days/${iso}.json`);
    if (!raw) return null;
    if (!raw.decoded) {
      const n = raw.nodes;
      raw.decoded = n.w.map((w, i) => ({
        lat: n.lat[i], lng: n.lng[i], w, g: n.g[i], m: n.m[i], e: n.e[i],
        relays: n.n[i], cc: n.cc[i], label: n.label[i],
      }));
    }
    return raw;
  }

  prefetchDay(iso) {
    if (iso) this.day(iso).catch(() => {});
  }

  /**
   * Users per country for `iso`, falling back to the most recent date with
   * data (Tor Metrics lags a few days behind the consensus).
   * @returns {Promise<{ date: string, users: Record<string, number> } | null>}
   */
  async clients(iso) {
    let [y, m] = iso.split('-').map(Number);
    for (let tries = 0; tries < 3; tries++) {
      const month = `${y}-${String(m).padStart(2, '0')}`;
      const doc = await get(`clients/month/${month}.json`);
      if (doc) {
        for (let i = doc.dates.length - 1; i >= 0; i--) {
          if (doc.dates[i] > iso) continue;
          const users = {};
          for (const [cc, vals] of Object.entries(doc.countries)) {
            if (vals[i] != null) users[cc] = vals[i];
          }
          if (Object.keys(users).length) return { date: doc.dates[i], users };
        }
      }
      if (--m === 0) { m = 12; y--; }
      iso = `${y}-${String(m).padStart(2, '0')}-31`;
    }
    return null;
  }

  /** Daily users from one country: [{ date: Date, iso, value }] */
  async country(cc) {
    const doc = await get(`clients/country/${cc}.json`);
    if (!doc) return [];
    const start = Date.parse(`${doc.start}T00:00:00Z`);
    return doc.users
      .map((value, i) => {
        const date = new Date(start + i * DAY_MS);
        return { date, iso: date.toISOString().slice(0, 10), value };
      })
      .filter((d) => d.value != null);
  }

  /** The snapshot day closest to `iso`. */
  nearestDay(iso) {
    const t = Date.parse(`${iso}T00:00:00Z`);
    let best = this.days[0], bestDiff = Infinity;
    for (const d of this.days) {
      const diff = Math.abs(Date.parse(`${d}T00:00:00Z`) - t);
      if (diff < bestDiff) { best = d; bestDiff = diff; }
    }
    return best;
  }
}
