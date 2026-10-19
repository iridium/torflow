// Locates (or downloads) the city database used for geolocation.
import { join } from 'node:path';
import { download, exists } from './net.js';
import { openGeo } from './geo.js';

export const CACHE_DIR = process.env.CACHE_DIR || '.cache';

/**
 * GEOIP_DB may point at any MMDB city database (e.g. MaxMind GeoLite2-City).
 * Otherwise this month's free DB-IP "IP to City Lite" file is fetched
 * (falling back to last month's around the turn of the month).
 */
export async function loadGeo() {
  if (process.env.GEOIP_DB) return openGeo(process.env.GEOIP_DB);
  const now = new Date();
  const months = [0, 1].map((back) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return d.toISOString().slice(0, 7);
  });
  for (const m of months) {
    const path = join(CACHE_DIR, `dbip-city-lite-${m}.mmdb`);
    if (await exists(path)) return openGeo(path);
  }
  for (const m of months) {
    try {
      const path = join(CACHE_DIR, `dbip-city-lite-${m}.mmdb`);
      console.log(`downloading dbip-city-lite-${m}.mmdb`);
      await download(`https://download.db-ip.com/free/dbip-city-lite-${m}.mmdb.gz`, path, { gunzip: true });
      return openGeo(path);
    } catch (err) {
      console.warn(`  ${err.message}`);
    }
  }
  throw new Error('no geolocation database available; set GEOIP_DB');
}
