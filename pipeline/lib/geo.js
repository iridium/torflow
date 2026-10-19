// IP -> location lookup backed by an MMDB city database (DB-IP "IP to City
// Lite" by default, CC BY 4.0; a MaxMind GeoLite2-City file works too).
import { open } from 'maxmind';

/**
 * @param {string} dbPath  path to a .mmdb city database
 * @returns {Promise<(ip: string) => { lat: number, lng: number, cc: string, city: string } | null>}
 */
export async function openGeo(dbPath) {
  const reader = await open(dbPath);
  return (ip) => {
    const rec = reader.get(ip);
    const loc = rec?.location;
    if (!loc || loc.latitude == null || loc.longitude == null) return null;
    return {
      lat: loc.latitude,
      lng: loc.longitude,
      cc: rec.country?.iso_code ?? '',
      city: rec.city?.names?.en ?? '',
    };
  };
}
