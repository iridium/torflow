// Choropleth of the countries with the most Tor users on the selected date.
// Every country is clickable and opens its drill-down panel.
import L from 'leaflet';
import * as d3 from 'd3';
import { Config, IS_MOBILE } from '../config.js';
import * as fmt from '../format.js';
import { hideTooltip, moveTooltip, showTooltip } from '../ui/tooltip.js';

export class CountryLayer {
  constructor({ onClick }) {
    this.count = Config.countryCount;
    this.opacity = 0.2;
    this.visible = true;
    this._onClick = onClick;
    this._users = {};
    this._top = new Map();
    this._color = d3.scaleLinear().range(Config.countriesRamp).domain([0, 1]);
  }

  async addTo(map) {
    this._map = map;
    this._pane = map.createPane('countries');
    this._pane.style.zIndex = 350;
    this.setOpacity(this.opacity);
    const geo = await fetch('countries.geo.json').then((r) => r.json());
    this._layer = L.geoJSON(geo, {
      pane: 'countries',
      renderer: L.canvas({ pane: 'countries', padding: 0.5 }),
      style: (f) => this._style(f),
      onEachFeature: (f, layer) => this._bind(f, layer),
    }).addTo(map);
    return this;
  }

  /** @param clients { date, users: { CC: count } } */
  set(clients) {
    this._clients = clients;
    this._users = clients?.users ?? {};
    this._rank();
  }

  setCount(n) {
    this.count = Math.round(n);
    this._rank();
  }

  setOpacity(v) {
    this.opacity = v;
    this._pane.style.opacity = v;
  }

  setVisible(on) {
    this.visible = on;
    this._pane.style.display = on ? '' : 'none';
  }

  usersFor(cc) {
    return this._users[cc];
  }

  _rank() {
    const ranked = Object.entries(this._users).sort((a, b) => b[1] - a[1]).slice(0, this.count);
    this._top = new Map(ranked.map(([cc, n], i) => [cc, { n, rank: i + 1 }]));
    this._max = ranked[0]?.[1] || 1;
    this._layer?.setStyle((f) => this._style(f));
  }

  _style(feature) {
    const top = this._top.get(feature.properties.cc);
    return {
      weight: 0,
      fillColor: top ? this._color(top.n / this._max) : '#000',
      fillOpacity: top ? 1 : 0,
    };
  }

  _bind(feature, layer) {
    const { cc, name } = feature.properties;
    layer.on('click', () => this._onClick(cc, name));
    if (IS_MOBILE) return;
    layer.on('mouseover', (e) => {
      layer.setStyle({ fillColor: '#fff', fillOpacity: 1 });
      const users = this._users[cc];
      const top = this._top.get(cc);
      const p = e.originalEvent;
      showTooltip(
        `<strong>${fmt.regionName(cc) || name}</strong><br>` +
        (users != null
          ? `${fmt.number(users)} daily Tor users${top ? ` · #${top.rank}` : ''}`
          : '<span class="muted">no user estimate</span>') +
        '<br><span class="muted">click for history</span>',
        p.clientX, p.clientY);
    });
    layer.on('mousemove', (e) => moveTooltip(e.originalEvent.clientX, e.originalEvent.clientY));
    layer.on('mouseout', () => {
      layer.setStyle(this._style(feature));
      hideTooltip();
    });
  }
}
