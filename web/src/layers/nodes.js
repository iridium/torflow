// Relay locations as circles sized by bandwidth. Drawn as SVG so the empty
// parts of the layer let clicks through to the countries underneath.
import L from 'leaflet';
import { Config, IS_MOBILE } from '../config.js';
import * as fmt from '../format.js';
import { escapeHtml, hideTooltip, showTooltip } from '../ui/tooltip.js';

export class NodeLayer {
  constructor() {
    this.count = Config.nodeCount;
    this.scaleByBandwidth = true;
    this.opacity = 1;
    this.visible = true;
    this._group = L.layerGroup();
  }

  addTo(map) {
    this._map = map;
    const pane = map.createPane('nodes');
    pane.style.zIndex = 500;
    this._pane = pane;
    this._renderer = L.svg({ pane: 'nodes', padding: 0.5 });
    this._group.addTo(map);
    return this;
  }

  /** @param nodes decoded day nodes; @param advbw network bandwidth (Gbit/s) */
  set(nodes, advbw) {
    this._nodes = nodes;
    this._advbw = advbw;
    this._render();
  }

  setCount(n) {
    this.count = Math.round(n);
    this._render();
  }

  setScaleByBandwidth(on) {
    this.scaleByBandwidth = on;
    this._render();
  }

  setOpacity(v) {
    this.opacity = v;
    this._pane.style.opacity = v;
  }

  setVisible(on) {
    this.visible = on;
    this._pane.style.display = on ? '' : 'none';
  }

  _render() {
    this._group.clearLayers();
    if (!this._nodes) return;
    const top = this._nodes.slice(0, this.count);
    const maxW = top[0]?.w || 1;
    const { min, max } = Config.nodeRadius;
    for (const n of top) {
      // area proportional to bandwidth
      const radius = this.scaleByBandwidth ? min + (max - min) * Math.sqrt(n.w / maxW) : min + 1;
      const marker = L.circleMarker([n.lat, n.lng], {
        renderer: this._renderer,
        radius,
        stroke: true,
        color: '#000',
        weight: 1,
        opacity: 0.6,
        fillColor: '#fff',
        fillOpacity: 0.3,
      });
      if (!IS_MOBILE) {
        marker.on('mouseover', (e) => {
          marker.setStyle({ fillOpacity: 0.8 });
          const p = e.originalEvent;
          showTooltip(this._label(n), p.clientX, p.clientY);
        });
        marker.on('mouseout', () => {
          marker.setStyle({ fillOpacity: 0.3 });
          hideTooltip();
        });
      }
      this._group.addLayer(marker);
    }
  }

  _label(n) {
    const roles = [['guard', n.g], ['middle', n.m], ['exit', n.e]]
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${fmt.percent(v, 2)}`)
      .join(' · ');
    return `<strong>${escapeHtml(n.label)}</strong><br>` +
      `≈ ${fmt.gbps(this._advbw != null ? n.w * this._advbw : null)} · ${fmt.percent(n.w, 2)} of network weight` +
      (roles ? `<br><span class="muted">chance of being picked as ${roles}</span>` : '');
  }
}
