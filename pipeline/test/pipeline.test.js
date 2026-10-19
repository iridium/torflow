import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildDay } from '../lib/aggregate.js';
import { parseConsensus, positionWeights } from '../lib/consensus.js';
import { parseBandwidth, parseClients } from '../lib/metrics.js';

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parses consensus relays, flags, weights and bandwidth-weights', async () => {
  const c = parseConsensus(await fixture('consensus.txt'));
  assert.equal(c.validAfter, '2026-10-18 00:00:00');
  assert.equal(c.relays.length, 6);
  const [guard] = c.relays;
  assert.equal(guard.nickname, 'guardrelay');
  assert.equal(guard.fingerprint, '000A10D43011EA4928A35F610405F92B4433B4DC');
  assert.equal(guard.address, '192.0.2.1');
  assert.equal(guard.weight, 3000);
  assert.ok(guard.flags.has('Guard'));
  assert.equal(c.relays[3].weight, 4000);
  assert.equal(c.weights.Wgg, 6000);
  assert.equal(c.weights.Wmd, 0);
});

test('position weights follow path-selection rules', async () => {
  const c = parseConsensus(await fixture('consensus.txt'));
  const w = Object.fromEntries(c.relays.map((r) => [r.nickname, positionWeights(r, c.weights)]));
  assert.deepEqual(w.guardrelay, { guard: 3000 * 6000, middle: 3000 * 4000, exit: 0 });
  assert.deepEqual(w.exitrelay, { guard: 0, middle: 0, exit: 2000 * 10000 });
  assert.deepEqual(w.bothrelay, { guard: 0, middle: 0, exit: 1000 * 10000 });
  assert.deepEqual(w.middlerelay, { guard: 0, middle: 4000 * 10000, exit: 0 });
  // BadExit relays are never picked as exits.
  assert.equal(w.badexit.exit, 0);
  assert.deepEqual(w.notrunning, { guard: 0, middle: 0, exit: 0 });
});

test('buildDay groups relays by location and normalizes shares', async () => {
  const c = parseConsensus(await fixture('consensus.txt'));
  const places = {
    '192.0.2.1': { lat: 52.5200, lng: 13.4050, cc: 'DE', city: 'Berlin' },
    '192.0.2.2': { lat: 52.5201, lng: 13.4049, cc: 'DE', city: 'Berlin' },
    '198.51.100.7': { lat: 40.7128, lng: -74.006, cc: 'US', city: 'New York' },
    '198.51.100.8': { lat: 48.8566, lng: 2.3522, cc: 'FR', city: 'Paris' },
  };
  const day = buildDay(c, (ip) => places[ip] ?? null);
  assert.equal(day.date, '2026-10-18');
  assert.equal(day.relays, 5); // "notrunning" excluded
  assert.equal(day.guards, 2);
  assert.equal(day.unlocated, 1); // badexit has no location
  const n = day.nodes;
  assert.equal(n.w.length, 3);
  // Berlin (3000 + 2000) outweighs Paris (4000) and New York (1000).
  assert.equal(n.label[0], '2 relays · Berlin, DE');
  assert.equal(n.label[1], 'middlerelay · Paris, FR');
  assert.equal(n.label[2], 'bothrelay · New York, US');
  // Shares are fractions of all running relays' weight (10500), incl. unlocated.
  assert.equal(n.w[0], Number((5000 / 10500).toPrecision(4)));
  // All guard probability sits in Berlin; exit is split Berlin / New York.
  assert.deepEqual(n.g, [1, 0, 0]);
  const exitTotal = 2000 * 10000 + 1000 * 10000;
  assert.equal(n.e[0], Number((2000 * 10000 / exitTotal).toPrecision(4)));
  assert.equal(n.e[2], Number((1000 * 10000 / exitTotal).toPrecision(4)));
});

test('parses Tor Metrics client and bandwidth CSVs', async () => {
  const { total, byCountry } = parseClients(await fixture('clients.csv'));
  assert.equal(total.get('2026-09-30'), 2400000);
  assert.equal(byCountry.get('US').get('2026-09-30'), 400001);
  assert.equal(byCountry.get('US').get('2026-10-01'), 410000);
  assert.ok(!byCountry.has('??'));
  const bw = parseBandwidth(await fixture('bandwidth.csv'));
  assert.deepEqual(bw.get('2026-09-30'), { advbw: 1234.5, bwhist: 701.25 });
  assert.equal(bw.get('2026-10-01').bwhist, null);
});

test('writeIndex aligns daily series and writes client files', async () => {
  process.env.OUT_DIR = await mkdtemp(join(tmpdir(), 'torflow-'));
  const { writeIndex, readJson } = await import(`../lib/store.js?${Date.now()}`);
  const metrics = {
    bandwidth: parseBandwidth(await fixture('bandwidth.csv')),
    clients: parseClients(await fixture('clients.csv')),
    onion: new Map([['2026-09-30', 7.0125]]),
  };
  await writeIndex(['2026-10-02'], metrics, {});
  const index = await readJson('index.json');
  assert.equal(index.series.start, '2026-09-30');
  assert.deepEqual(index.days, ['2026-10-02']);
  assert.deepEqual(index.series.advbw, [1234.5, 1240.1, null]);
  assert.deepEqual(index.series.onion, [0.01, null, null]);
  assert.deepEqual(index.series.users, [2400000, 2500000, null]);
  const us = await readJson('clients/country/US.json');
  assert.deepEqual(us.users, [400001, 410000]);
  const sep = await readJson('clients/month/2026-09.json');
  assert.deepEqual(sep.countries.DE, [300000]);
});
