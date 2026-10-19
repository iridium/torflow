// View state in the URL hash, so any view can be bookmarked or shared:
//   #date=2026-10-18&map=-42.00,40.00,4&country=DE
export function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const out = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.get('date') ?? '')) out.date = p.get('date');
  const map = (p.get('map') ?? '').split(',').map(Number);
  if (map.length === 3 && map.every(Number.isFinite)) out.map = { lng: map[0], lat: map[1], zoom: map[2] };
  if (/^[A-Z]{2}$/.test(p.get('country') ?? '')) out.country = p.get('country');
  return out;
}

const current = {};
export function writeHash(patch) {
  Object.assign(current, patch);
  const p = new URLSearchParams();
  if (current.date) p.set('date', current.date);
  if (current.map) p.set('map', `${current.map.lng.toFixed(2)},${current.map.lat.toFixed(2)},${current.map.zoom}`);
  if (current.country) p.set('country', current.country);
  history.replaceState(null, '', `#${p.toString().replaceAll('%2C', ',')}`);
}
