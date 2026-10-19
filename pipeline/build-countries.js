// Builds web/public/countries.geo.json, the country outlines used by the
// choropleth, from a Natural Earth admin-0 GeoJSON file (1:50m works well):
//
//   node pipeline/build-countries.js ne_50m_admin_0_countries.geojson
//
// Only ISO 3166-1 alpha-2 codes and names are kept; coordinates are rounded
// to 0.01° and Antarctica is dropped.
import { readFile, writeFile } from 'node:fs/promises';

const src = process.argv[2];
if (!src) {
  console.error('usage: build-countries.js <natural-earth-admin0.geojson>');
  process.exit(1);
}

const FALLBACK = { KOS: 'XK' }; // Natural Earth uses -99 for a few territories
const round = (c) => (typeof c[0] === 'number'
  ? [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100]
  : c.map(round));
// Drop consecutive duplicate points created by rounding.
const dedupe = (ring) => ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);
const clean = (geom) => {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const out = polys
    .map((poly) => poly.map((ring) => dedupe(round(ring))).filter((ring) => ring.length >= 4))
    .filter((poly) => poly.length);
  return { type: 'MultiPolygon', coordinates: out };
};

const world = JSON.parse(await readFile(src, 'utf8'));
const features = [];
for (const f of world.features) {
  const p = f.properties;
  const a3 = p.ADM0_A3 ?? p.adm0_a3;
  const a2 = p.ISO_A2_EH ?? p.ISO_A2 ?? p.iso_a2;
  const cc = a2 && a2.length === 2 ? a2 : FALLBACK[a3];
  if (!cc || cc === 'AQ') continue;
  features.push({
    type: 'Feature',
    properties: { cc, name: p.NAME ?? p.name },
    geometry: clean(f.geometry),
  });
}
await writeFile('web/public/countries.geo.json', JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`${features.length} countries written`);
