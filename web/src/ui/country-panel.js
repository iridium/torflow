// Drill-down for one country: daily relay users over the whole history, plus
// its most extreme days relative to the average (the original "outliers").
import * as d3 from 'd3';
import { Config } from '../config.js';
import * as fmt from '../format.js';
import { dialog } from './controls.js';
import { track } from './loading.js';
import { hideTooltip, showTooltip } from './tooltip.js';

const OUTLIERS = 8;

export class CountryPanel {
  /**
   * @param {import('../data.js').Data} data
   * @param {(iso: string) => void} onJump
   * @param {() => void} onClose
   */
  constructor(data, onJump, onClose) {
    this.data = data;
    this.onJump = onJump;
    this.dialog = dialog({ className: 'country-panel', onClose });
    addEventListener('resize', () => this.dialog.open && this._series && this._draw());
  }

  get cc() {
    return this.dialog.open ? this._cc : null;
  }

  async open(cc) {
    this._cc = cc;
    this.dialog.show();
    this.dialog.content.innerHTML = `<h2>${fmt.regionName(cc)}</h2><p class="muted">Loading…</p>`;
    const series = await track(this.data.country(cc));
    if (this._cc !== cc) return;
    this._series = series;
    this._draw();
  }

  close() {
    this.dialog.hide();
  }

  updateDate(iso) {
    this._date = iso;
    if (this.dialog.open && this._series) this._draw();
  }

  _draw() {
    const { content } = this.dialog;
    const series = this._series;
    const cc = this._cc;
    if (!series.length) {
      content.innerHTML = `<h2>${fmt.regionName(cc)}</h2><p class="muted">Tor Metrics has no user estimates for this country.</p>`;
      return;
    }
    const iso = this._date;
    const current = [...series].reverse().find((d) => d.iso <= iso) ?? series[0];
    const total = this.data.series('users', current.iso);
    const avg = d3.mean(series, (d) => d.value);

    content.innerHTML = `
      <h2>${fmt.regionName(cc)}</h2>
      <div class="stat-row">
        <div><b>${fmt.number(current.value)}</b><span>daily users · ${fmt.date(current.iso)}</span></div>
        <div><b>${total ? fmt.percent(current.value / total, 2) : '—'}</b><span>of all relay users</span></div>
        <div><b>${fmt.number(Math.round(avg))}</b><span>average since ${series[0].date.getUTCFullYear()}</span></div>
      </div>
      <div class="country-chart"></div>
      <div class="outliers">
        <div><h3>Busiest days</h3><div class="outlier-list top"></div></div>
        <div><h3>Quietest days</h3><div class="outlier-list bottom"></div></div>
      </div>
      <p class="muted small">Estimated directly-connecting users per day (excludes bridge users). Source: Tor Metrics. Click the chart or a day to jump to the nearest snapshot.</p>`;

    this._drawChart(content.querySelector('.country-chart'), series, current);

    const sorted = [...series].sort((a, b) => b.value - a.value);
    const n = Math.min(OUTLIERS, Math.floor(sorted.length / 2));
    const max = sorted[0].value;
    const list = (el, items, color) => {
      for (const d of items) {
        const row = document.createElement('button');
        row.className = 'outlier';
        row.innerHTML = `<span class="date">${fmt.date(d.iso)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(d.value / max) * 100}%;background:${color}"></span></span>
          <span class="value">${fmt.compact(d.value)}</span>`;
        row.addEventListener('click', () => this.onJump(d.iso));
        el.append(row);
      }
    };
    list(content.querySelector('.top'), sorted.slice(0, n), Config.connectionsRamp[1]);
    list(content.querySelector('.bottom'), sorted.slice(-n).reverse(), Config.connectionsRamp[0]);
  }

  _drawChart(el, series, current) {
    const width = el.clientWidth || 560, height = 150;
    const m = { top: 8, right: 8, bottom: 18, left: 40 };
    const w = width - m.left - m.right, h = height - m.top - m.bottom;
    const svg = d3.select(el).append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    const x = d3.scaleTime().domain(d3.extent(series, (d) => d.date)).range([0, w]);
    const y = d3.scaleLinear().domain([0, d3.max(series, (d) => d.value)]).nice().range([h, 0]);

    const grad = `grad-${this._cc}`;
    svg.append('defs').append('linearGradient').attr('id', grad).attr('x1', 0).attr('x2', 0).attr('y1', 1).attr('y2', 0)
      .selectAll('stop').data(Config.connectionsRamp).join('stop')
      .attr('offset', (_, i) => i).attr('stop-color', (c) => c);

    g.append('path').datum(series).attr('fill', `url(#${grad})`).attr('fill-opacity', 0.85)
      .attr('d', d3.area().x((d) => x(d.date)).y0(h).y1((d) => y(d.value)).curve(d3.curveStepAfter));
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(w / 80))).tickSizeOuter(0));
    g.append('g').attr('class', 'axis')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('~s')).tickSizeOuter(0));
    g.append('line').attr('class', 'date-marker')
      .attr('x1', x(current.date)).attr('x2', x(current.date)).attr('y1', 0).attr('y2', h);

    const bisect = d3.bisector((d) => d.date).center;
    g.append('rect').attr('class', 'clickable').attr('width', w).attr('height', h).attr('fill', 'transparent')
      .on('mousemove', (e) => {
        const d = series[bisect(series, x.invert(d3.pointer(e)[0]))];
        showTooltip(`${fmt.date(d.iso)}<br>${fmt.number(d.value)} users`, e.clientX, e.clientY);
      })
      .on('mouseleave', hideTooltip)
      .on('click', (e) => {
        hideTooltip();
        this.onJump(series[bisect(series, x.invert(d3.pointer(e)[0]))].iso);
      });
  }
}
