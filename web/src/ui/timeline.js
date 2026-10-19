// Bottom date controls: a bandwidth-over-time bar chart above a date slider
// with step buttons and playback. Both only land on dates that have a relay
// snapshot.
import * as d3 from 'd3';
import { Config } from '../config.js';
import * as fmt from '../format.js';
import { icons } from './icons.js';
import { hideTooltip, showTooltip } from './tooltip.js';

const parse = (iso) => new Date(`${iso}T00:00:00Z`);

export class Timeline {
  /**
   * @param {HTMLElement} container
   * @param {import('../data.js').Data} data
   * @param {(iso: string, commit: boolean) => void} onSelect  commit=false while dragging
   */
  constructor(container, data, onSelect) {
    this.data = data;
    this.days = data.days;
    this.onSelect = onSelect;
    this.index = this.days.length - 1;

    container.innerHTML = `
      <div class="date-chart"><svg></svg></div>
      <div class="map-control-element date-slider-container">
        <button class="small-button play" aria-label="Play">${icons.play}</button>
        <button class="small-button prev" aria-label="Previous date">${icons.minus}</button>
        <input class="range" type="range" min="0" max="${this.days.length - 1}" step="1" aria-label="Date">
        <button class="small-button next" aria-label="Next date">${icons.plus}</button>
        <div class="date-label"></div>
      </div>`;
    this.svg = d3.select(container).select('svg');
    this.input = container.querySelector('input');
    this.label = container.querySelector('.date-label');
    this.playBtn = container.querySelector('.play');

    this.input.addEventListener('input', () => this._set(Number(this.input.value), false));
    this.input.addEventListener('change', () => this._set(Number(this.input.value), true));
    container.querySelector('.prev').addEventListener('click', () => this.step(-1));
    container.querySelector('.next').addEventListener('click', () => this.step(1));
    this.playBtn.addEventListener('click', () => this.toggle());
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') this.step(-1);
      if (e.key === 'ArrowRight') this.step(1);
    });
    new ResizeObserver(() => this._drawChart()).observe(container.querySelector('.date-chart'));
  }

  get date() {
    return this.days[this.index];
  }

  setDate(iso, commit = true) {
    const i = this.days.indexOf(iso);
    this._set(i === -1 ? this.days.indexOf(this.data.nearestDay(iso)) : i, commit);
  }

  step(delta) {
    const i = Math.min(Math.max(0, this.index + delta), this.days.length - 1);
    if (i !== this.index) this._set(i, true);
  }

  toggle(force) {
    const play = force ?? !this._timer;
    clearInterval(this._timer);
    this._timer = null;
    if (play) {
      if (this.index === this.days.length - 1) this._set(0, true);
      this._timer = setInterval(() => {
        if (this.index >= this.days.length - 1) this.toggle(false);
        else this.step(1);
      }, 2500);
    }
    this.playBtn.innerHTML = play ? icons.pause : icons.play;
    this.playBtn.setAttribute('aria-label', play ? 'Pause' : 'Play');
  }

  _set(i, commit) {
    this.index = i;
    this.input.value = i;
    this.input.style.setProperty('--fill', `${(i / Math.max(1, this.days.length - 1)) * 100}%`);
    this.label.textContent = fmt.date(this.date);
    this._highlight();
    this.onSelect(this.date, commit);
  }

  _drawChart() {
    const svg = this.svg;
    const node = svg.node().parentNode;
    const width = node.clientWidth, height = node.clientHeight;
    svg.attr('width', width).attr('height', height).selectAll('*').remove();
    if (width < 120 || height < 30 || this.days.length < 2) return;

    const margin = { top: 18, right: 4, bottom: 16, left: 4 };
    const w = width - margin.left - margin.right, h = height - margin.top - margin.bottom;
    const first = parse(this.days[0]), last = parse(this.days.at(-1));
    const points = this.data.seriesPoints('advbw').filter((p) => p.date >= first && p.date <= last);

    // Bucket the daily series into bars a few pixels wide.
    const nBars = Math.max(1, Math.min(Math.floor(w / 5), this.days.length));
    const x = d3.scaleTime().domain([first, d3.timeDay.offset(last, 1)]).range([0, w]);
    const span = (x.domain()[1] - x.domain()[0]) / nBars;
    const buckets = d3.range(nBars).map((i) => {
      const from = new Date(+first + i * span), to = new Date(+first + (i + 1) * span);
      const inBucket = points.filter((p) => p.date >= from && p.date < to);
      const days = this.days.filter((d) => parse(d) >= from && parse(d) < to);
      return { from, to, value: d3.mean(inBucket, (p) => p.value), days };
    }).filter((b) => b.days.length);
    this._buckets = buckets;

    const max = d3.max(buckets, (b) => b.value) || 1;
    const min = d3.min(buckets, (b) => b.value) || 0;
    const y = d3.scaleLinear().domain([0, max]).range([h, 0]);
    const color = d3.scaleSqrt().domain([0, 1]).range(Config.bandwidthRamp);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    svg.append('text').attr('class', 'chart-title').attr('x', width / 2).attr('y', 12)
      .attr('text-anchor', 'middle').text('Advertised Bandwidth Over Time');

    const bw = Math.max(1, w / nBars - 1);
    const bars = g.selectAll('.bar').data(buckets).join('g').attr('class', 'bar clickable')
      .attr('transform', (b) => `translate(${x(b.from)},0)`);
    bars.append('rect').attr('class', 'background-bar').attr('width', bw).attr('height', h);
    bars.append('rect').attr('class', 'foreground-bar')
      .attr('width', bw)
      .attr('y', (b) => (b.value == null ? h - 1 : y(b.value)))
      .attr('height', (b) => (b.value == null ? 1 : h - y(b.value)))
      .attr('fill', (b) => color(b.value == null ? 0 : (b.value - min) / ((max - min) || 1)));
    bars
      .on('click', (_, b) => this.setDate(b.days[Math.floor(b.days.length / 2)]))
      .on('mousemove', (e, b) => showTooltip(
        `${fmt.date(b.days[0])}${b.days.length > 1 ? ` – ${fmt.date(b.days.at(-1))}` : ''}<br>${fmt.gbps(b.value)}`,
        e.clientX, e.clientY))
      .on('mouseleave', hideTooltip);

    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(w / 90))).tickSizeOuter(0));
    this._highlight();
  }

  _highlight() {
    if (!this._buckets) return;
    const t = parse(this.date);
    this.svg.selectAll('.bar').classed('active', (b) => t >= b.from && t < b.to);
  }
}
