import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { Config, IS_MOBILE } from './config.js';
import { Data } from './data.js';
import * as fmt from './format.js';
import { CountryLayer } from './layers/countries.js';
import { NodeLayer } from './layers/nodes.js';
import { ParticleLayer } from './layers/particles.js';
import { readHash, writeHash } from './state.js';
import { buttonGroup, dialog, layerMenu, slider, toggle } from './ui/controls.js';
import { CountryPanel } from './ui/country-panel.js';
import { icons } from './ui/icons.js';
import { shareSheet, snapshotMap } from './ui/share.js';
import { track } from './ui/loading.js';
import { Timeline } from './ui/timeline.js';

if (IS_MOBILE) document.body.classList.add('mobile');
document.querySelector('.share-button').innerHTML = icons.share;
document.querySelector('.summary-button').innerHTML = icons.question;
document.querySelector('.github-button').innerHTML = icons.github;

const hash = readHash();
const data = new Data();
let timeline;

// ---------------------------------------------------------------- map
const map = L.map('map', {
  zoomControl: false,
  minZoom: Config.zoom.min,
  maxZoom: Config.zoom.max,
  worldCopyJump: true,
  inertia: false,
  attributionControl: true,
});
map.setView(hash.map ? [hash.map.lat, hash.map.lng] : Config.center, hash.map?.zoom ?? Config.zoom.start);
L.control.zoom({ position: 'topright' }).addTo(map);
map.attributionControl.setPrefix(false);

// MapLibre is large; load it in its own chunk so the UI isn't held up.
const basemap = import('./layers/basemap.js').then((m) => m.addBasemap(map)).catch((err) => {
  console.error('basemap failed to load', err);
  return null;
});

const particles = new ParticleLayer().addTo(map);
const nodes = new NodeLayer().addTo(map);
const countryPanel = new CountryPanel(data, (iso) => timeline.setDate(iso), () => writeHash({ country: null }));
const countries = new CountryLayer({
  onClick: (cc) => {
    summary.hide();
    countryPanel.open(cc);
    countryPanel.updateDate(timeline.date);
    writeHash({ country: cc });
  },
});
const countriesReady = countries.addTo(map);

map.on('moveend', () => {
  const c = map.getCenter().wrap();
  writeHash({ map: { lng: c.lng, lat: c.lat, zoom: map.getZoom() } });
});

// ---------------------------------------------------------------- dialogs
const summary = dialog({ className: 'summary-container' });
summary.content.innerHTML = `
  <h2>Data Flow in the Tor Network</h2>
  <p>The Tor network is a group of volunteer-operated servers (relays) that lets people improve their privacy and
    security on the Internet. Instead of connecting directly, Tor users send their traffic through a series of relays,
    so that no single relay knows both who they are and where they are going.
    <a href="https://support.torproject.org/about/" target="_blank" rel="noopener"><sup>[1]</sup></a></p>
  <p>This map shows the relay network on a given day. Each <b>circle</b> is the relays at one location, sized by
    their bandwidth; hover over it for details.</p>
  <p>The <b>particles</b> simulate circuits: each one is a hop between relays picked the way Tor clients pick them,
    weighted by the consensus. <span class="swatch onion"></span>Orange particles are the share of traffic going to
    onion services.</p>
  <p>Shaded <b>countries</b> are where the most Tor users connect from. Click any country to see its history.</p>
  <p>Use the slider, the arrow keys or <b>play</b> to move through time.</p>
  <details>
    <summary>Data sources &amp; method</summary>
    <ul>
      <li>Relays, flags, consensus weights: hourly network-status consensuses from
        <a href="https://collector.torproject.org" target="_blank" rel="noopener">Tor Project CollecTor</a>; one per day.</li>
      <li>Total bandwidth, user estimates and onion-service traffic:
        <a href="https://metrics.torproject.org" target="_blank" rel="noopener">Tor Metrics</a>. A location's bandwidth is its
        share of consensus weight × the network's total advertised bandwidth.</li>
      <li>Relay locations: <a href="https://db-ip.com" target="_blank" rel="noopener">IP Geolocation by DB-IP</a> (CC BY 4.0),
        current database, so older dates are approximate.</li>
      <li>Particles are a simulation, not observed traffic. Tor never reveals real flows.</li>
    </ul>
  </details>
  <p class="muted small">Originally created by <a href="https://uncharted.software" target="_blank" rel="noopener">Uncharted Software</a>.
    <span class="data-updated"></span></p>`;
document.querySelector('.summary-button').addEventListener('click', () => {
  countryPanel.close();
  summary.open ? summary.hide() : summary.show();
});

shareSheet({
  button: document.querySelector('.share-button'),
  getDate: () => timeline?.date ?? data.days?.at(-1),
  snapshot: () => snapshotMap(map, {
    drawParticles: () => particles.drawNow(),
    caption: [...document.querySelectorAll('.header-stats span'), { textContent: fmt.date(timeline.date) }]
      .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
      .join(' · '),
    attribution: `${Config.basemapCredit} · Data: The Tor Project, DB-IP`,
  }),
});

// ---------------------------------------------------------------- data flow
let bandwidthRange = [0, 1];
let requestId = 0;

async function showDate(iso) {
  const id = ++requestId;
  writeHash({ date: iso });
  countryPanel.updateDate(iso);
  const advbw = data.series('advbw', iso);
  const [day, clients] = await track(Promise.all([data.day(iso), data.clients(iso)]));
  if (id !== requestId || !day) return;

  const [lo, hi] = bandwidthRange;
  particles.bandwidthScale = Math.max(0.1, hi > lo ? (advbw - lo) / (hi - lo) : 1);
  particles.setNodes(day.decoded, data.series('onion', iso) ?? Config.defaultOnionShare);
  nodes.set(day.decoded, advbw);
  await countriesReady;
  countries.set(clients);
  renderStats(day, advbw, clients);

  // warm the cache for stepping through time
  const i = data.days.indexOf(iso);
  data.prefetchDay(data.days[i + 1]);
  data.prefetchDay(data.days[i - 1]);
}

function renderStats(day, advbw, clients) {
  const users = clients ? data.series('users', clients.date) : null;
  document.querySelector('.header-stats').innerHTML = `
    <span><b>${fmt.number(day.relays)}</b> relays</span>
    <span><b>${fmt.gbps(advbw)}</b> advertised</span>
    ${users ? `<span><b>${fmt.compact(users)}</b> daily users</span>` : ''}`;
}

function buildControls(tiles) {
  const $ = document.querySelector('.map-controls');
  const pct = (v) => `${Math.round(v * 100)}%`;
  if (particles.supported()) {
    const general = `rgb(${Config.particleGeneralColor.map((c) => Math.floor(c * 255 + 50)).join(',')})`;
    const onion = `rgb(${Config.particleOnionColor.map((c) => Math.floor(c * 255 + 50)).join(',')})`;
    $.append(layerMenu({
      label: 'Particles',
      onToggle: (on) => (on ? particles.addTo(map) : particles.remove()),
    }).add(
      slider({ label: 'Opacity', min: 0, max: 1, step: 0.01, value: particles.opacity, format: pct, onInput: (v) => particles.setOpacity(v) }),
      slider({ label: 'Particle Speed', min: Config.particleSpeedMin, max: Config.particleSpeedMax, step: 0.01, value: particles.speed, onChange: (v) => { particles.speed = v; } }),
      slider({ label: 'Path Width', min: Config.particleOffsetMin, max: Config.particleOffsetMax, step: 0.01, value: particles.pathOffset, onInput: (v) => { particles.pathOffset = v; } }),
      slider({ label: 'Particle Size', min: Config.particleSizeMin, max: Config.particleSizeMax, step: 1, value: particles.size, format: (v) => `${v}px`, onInput: (v) => { particles.size = v; } }),
      slider({
        label: 'Particle Count', min: Config.particleCountMin, max: Config.particleCountMax,
        step: (Config.particleCountMax - Config.particleCountMin) / 100, value: particles.count,
        format: fmt.compact, onChange: (v) => particles.setCount(v),
      }),
      toggle({ label: 'Scale Size by Zoom', value: particles.scaleByZoom, onChange: (v) => { particles.scaleByZoom = v; } }),
      toggle({ label: 'Scale Count by Bandwidth', value: particles.scaleByBandwidth, onChange: (v) => { particles.scaleByBandwidth = v; } }),
      buttonGroup({
        value: 'all',
        onChange: (v) => { particles.traffic = v; },
        buttons: [
          { label: 'All Traffic', value: 'all', swatch: [onion, general] },
          { label: 'Onion Services', value: 'onion', swatch: onion },
          { label: 'General', value: 'general', swatch: general },
        ],
      }),
    ));
  }
  $.append(layerMenu({ label: 'Relays', onToggle: (on) => nodes.setVisible(on) }).add(
    slider({ label: 'Opacity', min: 0, max: 1, step: 0.01, value: nodes.opacity, format: pct, onInput: (v) => nodes.setOpacity(v) }),
    slider({
      label: 'Locations (top n)', min: Config.nodeCountMin, max: Config.nodeCountMax,
      step: 10, value: nodes.count, format: (v) => fmt.number(Math.round(v)), onChange: (v) => nodes.setCount(v),
    }),
    toggle({ label: 'Scale by Bandwidth', value: nodes.scaleByBandwidth, onChange: (v) => nodes.setScaleByBandwidth(v) }),
  ));
  if (tiles) {
    const labelsPane = map.getPane('labels');
    $.append(layerMenu({ label: 'Labels', onToggle: (on) => { labelsPane.style.display = on ? '' : 'none'; } }).add(
      slider({
        label: 'Opacity', min: 0, max: 1, step: 0.01, value: 0.65, format: pct,
        onInput: (v) => { tiles.labels.getContainer().style.opacity = v; },
      }),
    ));
  }
  $.append(layerMenu({ label: 'Top Client Countries', onToggle: (on) => countries.setVisible(on) }).add(
    slider({ label: 'Opacity', min: 0, max: 1, step: 0.01, value: countries.opacity, format: pct, onInput: (v) => countries.setOpacity(v) }),
    slider({
      label: 'Country Count (top n)', min: Config.countryCountMin, max: Config.countryCountMax,
      step: 1, value: countries.count, format: (v) => String(Math.round(v)), onChange: (v) => countries.setCount(v),
    }),
  ));
  if (tiles) {
    $.append(layerMenu({ label: 'Base Map' }).add(
      slider({
        label: 'Brightness', min: 0.01, max: 3, step: 0.01, value: 1, format: pct,
        onInput: (v) => { tiles.base.getContainer().style.filter = `brightness(${v})`; },
      }),
    ));
  }
}

function fail(message) {
  document.querySelector('.date-controls').innerHTML = `<div class="map-control-element error">${message}</div>`;
}

// ---------------------------------------------------------------- start
try {
  await track(data.load());
  const snapAdvbw = data.days.map((d) => data.series('advbw', d)).filter((v) => v != null);
  if (snapAdvbw.length) bandwidthRange = [Math.min(...snapAdvbw), Math.max(...snapAdvbw)];
  const updated = summary.content.querySelector('.data-updated');
  if (data.index.generated) updated.textContent = `Data updated ${fmt.date(data.index.generated.slice(0, 10))}.`;

  buildControls(await basemap);
  timeline = new Timeline(document.querySelector('.date-controls'), data, (iso, commit) => {
    if (commit) showDate(iso);
    else countryPanel.updateDate(iso);
  });
  timeline.setDate(hash.date ?? data.days.at(-1));
  if (hash.country && !IS_MOBILE) {
    countryPanel.open(hash.country);
    countryPanel.updateDate(timeline.date);
  } else if (!hash.date && !hash.map && !IS_MOBILE) {
    summary.show();
  }
} catch (err) {
  console.error(err);
  fail(`Couldn't load data: ${err.message}`);
}
