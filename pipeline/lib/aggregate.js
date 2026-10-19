// Turns a parsed consensus into the per-location "day" document the web app
// renders: relays are grouped by geolocated coordinates and carry their share
// of total consensus weight plus their share of each circuit position.
import { positionWeights } from './consensus.js';

const round = (v, digits) => Number(v.toFixed(digits));
// Probabilities are small numbers; keep 4 significant figures.
const sig = (v) => (v === 0 ? 0 : Number(v.toPrecision(4)));

/**
 * @param {{ validAfter: string, relays: import('./consensus.js').Relay[], weights: Record<string, number> }} consensus
 * @param {(ip: string) => ({ lat: number, lng: number, cc: string, city: string } | null)} geo
 */
export function buildDay(consensus, geo) {
  const buckets = new Map();
  let totalWeight = 0, unlocated = 0;
  const pos = { guard: 0, middle: 0, exit: 0 };
  const flagCounts = { Guard: 0, Exit: 0, Running: 0 };

  for (const relay of consensus.relays) {
    if (!relay.flags.has('Running')) continue;
    for (const f of Object.keys(flagCounts)) if (relay.flags.has(f)) flagCounts[f]++;
    const p = positionWeights(relay, consensus.weights);
    pos.guard += p.guard; pos.middle += p.middle; pos.exit += p.exit;
    totalWeight += relay.weight;

    const loc = geo(relay.address);
    if (!loc) { unlocated++; continue; }
    const lat = round(loc.lat, 2), lng = round(loc.lng, 2);
    const key = `${lat},${lng}`;
    let b = buckets.get(key);
    if (!b) {
      b = { lat, lng, cc: loc.cc, city: loc.city, weight: 0, guard: 0, middle: 0, exit: 0, relays: 0, top: null };
      buckets.set(key, b);
    }
    b.weight += relay.weight;
    b.guard += p.guard; b.middle += p.middle; b.exit += p.exit;
    b.relays++;
    if (!b.top || relay.weight > b.top.weight) b.top = relay;
  }

  const nodes = [...buckets.values()]
    .filter((b) => b.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const label = (b) => {
    const place = [b.city, b.cc].filter(Boolean).join(', ');
    return b.relays === 1
      ? `${b.top.nickname}${place ? ` · ${place}` : ''}`
      : `${b.relays} relays${place ? ` · ${place}` : ''}`;
  };

  return {
    date: consensus.validAfter.slice(0, 10),
    validAfter: consensus.validAfter,
    relays: flagCounts.Running,
    guards: flagCounts.Guard,
    exits: flagCounts.Exit,
    unlocated,
    // Columnar arrays, sorted by weight (descending). `w` is each location's
    // share of total consensus weight; `g`/`m`/`e` its probability of being
    // chosen as guard / middle / exit for a circuit.
    nodes: {
      lat: nodes.map((b) => b.lat),
      lng: nodes.map((b) => b.lng),
      w: nodes.map((b) => sig(b.weight / totalWeight)),
      g: nodes.map((b) => sig(pos.guard ? b.guard / pos.guard : 0)),
      m: nodes.map((b) => sig(pos.middle ? b.middle / pos.middle : 0)),
      e: nodes.map((b) => sig(pos.exit ? b.exit / pos.exit : 0)),
      n: nodes.map((b) => b.relays),
      cc: nodes.map((b) => b.cc),
      label: nodes.map(label),
    },
  };
}
