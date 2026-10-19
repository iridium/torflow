// WebGL particle overlay: hundreds of thousands of points travelling along
// great-circle Bézier arcs between relay locations, animated entirely on the
// GPU (port of the original TorFlow shader).
import L from 'leaflet';
import { Config } from '../config.js';
import { loading } from '../ui/loading.js';

const VERT = `
precision highp float;
attribute vec4 aPositions;
attribute vec4 aOffsets;
uniform vec2 uOrigin;      // top-left of the view in normalized world coords
uniform float uWorld;      // world size in device pixels
uniform vec2 uViewport;    // canvas size in device pixels
uniform float uShift;      // which world copy (integer) to draw
uniform float uTime;
uniform float uPointSize;
uniform float uSpeedFactor;
uniform float uOffsetFactor;

const float PI = 3.141592654;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 xyToSphere(vec2 xy) {
  float xn = mod(xy.x, 1.0);
  vec2 ll = vec2((xn - 0.5) * PI * 2.0, (xy.y - 0.5) * PI);
  return vec3(cos(ll.x) * cos(ll.y), sin(ll.y), sin(ll.x) * cos(ll.y));
}

vec2 sphereToXY(vec3 s) {
  return vec2(0.5 + atan(s.z, s.x) / (2.0 * PI), 0.5 + asin(clamp(s.y, -1.0, 1.0)) / PI);
}

// Travels the great circle from start to end, bowed sideways into a gentle
// S-curve by the per-particle offsets (the original used a Bezier through
// the sphere, which scatters points on near-antipodal paths).
vec2 sphereInterp(vec2 startPos, vec2 endPos) {
  vec3 s1 = xyToSphere(startPos);
  vec3 s4 = xyToSphere(endPos);
  float ang = acos(clamp(dot(s1, s4), -1.0, 1.0));
  float sdist = ang / PI;
  vec3 c = cross(s1, s4);
  vec3 sperp = length(c) > 1e-6 ? normalize(c) : vec3(0.0);

  float r0 = rand(vec2(s1.x + aOffsets.y, s4.y + aOffsets.x));
  float r1 = rand(vec2(s1.y + aOffsets.w, s4.x + aOffsets.z));
  // normalize speed by distance, vary by random number
  float nSpeed = max((uSpeedFactor + uSpeedFactor * r1) * sdist, 1.0);
  float t = mod(uTime + r0 * nSpeed, nSpeed) / nSpeed;

  float sa = sin(ang);
  vec3 p = sa > 1e-4 ? (sin((1.0 - t) * ang) * s1 + sin(t * ang) * s4) / sa : mix(s1, s4, t);
  float k0 = 3.0 * t * (1.0 - t) * (1.0 - t), k1 = 3.0 * t * t * (1.0 - t);
  float bow = (k0 * aOffsets.y - k1 * aOffsets.w) * sdist * uOffsetFactor;
  return sphereToXY(normalize(p + bow * sperp));
}

void main() {
  vec2 pos = sphereInterp(aPositions.xy, aPositions.zw);
  pos.x = mod(pos.x, 1.0) + uShift;
  vec2 px = vec2(pos.x - uOrigin.x, (1.0 - pos.y) - uOrigin.y) * uWorld;
  gl_Position = vec4(px.x / uViewport.x * 2.0 - 1.0, 1.0 - px.y / uViewport.y * 2.0, 0.0, 1.0);
  gl_PointSize = uPointSize;
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColor * uOpacity, uOpacity);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

/** lng/lat -> normalized web-mercator, y up, both in [0, 1]. */
export function toNormalized(lat, lng) {
  const x = (lng + 180) / 360;
  const φ = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  const y = 0.5 + Math.log(Math.tan(Math.PI / 4 + φ / 2)) / (2 * Math.PI);
  return { x, y };
}

export const ParticleLayer = L.Layer.extend({
  initialize() {
    this.opacity = 0.8;
    this.speed = 1;
    this.pathOffset = 1;
    this.size = Config.particleSize;
    this.count = Config.particleCount;
    this.scaleByZoom = false;
    this.scaleByBandwidth = true;
    this.traffic = 'all'; // 'all' | 'onion' | 'general'
    this.bandwidthScale = 1;
    this._ready = false;
  },

  /** Whether WebGL is available; when false the layer silently draws nothing. */
  supported() {
    return !!this._gl;
  },

  onAdd(map) {
    const pane = map.getPane('particles') || map.createPane('particles');
    pane.style.zIndex = 450;
    pane.style.pointerEvents = 'none';
    this._canvas = L.DomUtil.create('canvas', 'particle-canvas', pane);
    const gl = this._canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
    this._gl = gl;
    if (!gl) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this._prog = prog;
    this._attr = { pos: gl.getAttribLocation(prog, 'aPositions'), off: gl.getAttribLocation(prog, 'aOffsets') };
    this._uni = Object.fromEntries(
      ['uOrigin', 'uWorld', 'uViewport', 'uShift', 'uTime', 'uPointSize', 'uSpeedFactor',
        'uOffsetFactor', 'uColor', 'uOpacity'].map((n) => [n, gl.getUniformLocation(prog, n)]));
    this._buffer = gl.createBuffer();

    map.on('zoomstart', this._hide, this);
    map.on('zoomend', this._show, this);
    map.on('resize', this._resize, this);
    this._resize();
    this._start = performance.now();
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this._draw();
    };
    loop();
    if (this._nodes) this._generate();
  },

  onRemove(map) {
    cancelAnimationFrame(this._raf);
    this._worker?.terminate();
    map.off('zoomstart', this._hide, this);
    map.off('zoomend', this._show, this);
    map.off('resize', this._resize, this);
    this._canvas.remove();
    this._gl = null;
  },

  setNodes(nodes, onionShare) {
    this._nodes = nodes.map((n) => ({ ...toNormalized(n.lat, n.lng), g: n.g, m: n.m, e: n.e, w: n.w }));
    this._onionShare = onionShare;
    this._generate();
  },

  setCount(count) {
    this.count = Math.round(count);
    this._generate();
  },

  setOpacity(v) {
    this.opacity = v;
  },

  _hide() { this._canvas.style.visibility = 'hidden'; },
  _show() { this._canvas.style.visibility = ''; },

  _resize() {
    const size = this._map.getSize();
    const dpr = window.devicePixelRatio || 1;
    this._dpr = dpr;
    this._canvas.width = size.x * dpr;
    this._canvas.height = size.y * dpr;
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;
  },

  _generate() {
    if (!this._gl || !this._nodes?.length) return;
    this._worker?.terminate();
    const bar = loading();
    const worker = new Worker(new URL('./particles.worker.js', import.meta.url), { type: 'module' });
    this._worker = worker;
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        bar.update(e.data.progress);
        return;
      }
      bar.done();
      worker.terminate();
      if (this._worker === worker) this._worker = null;
      const gl = this._gl;
      if (!gl) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(e.data.buffer), gl.STATIC_DRAW);
      this._total = this.count;
      this._onionCount = e.data.onionCount;
      this._ready = true;
    };
    worker.postMessage({
      type: 'start',
      nodes: this._nodes,
      count: this.count,
      onionShare: this._onionShare,
      offset: Config.particleOffset,
    });
  },

  _pointSize() {
    const size = this.scaleByZoom ? Config.particleZoomScale(this._map.getZoom(), this.size) : this.size;
    return size * this._dpr;
  },

  /** Renders a frame immediately (used to capture the canvas). */
  drawNow() {
    this._draw(true);
  },

  _draw(force = false) {
    const gl = this._gl;
    if (!gl || !this._ready || (document.hidden && !force)) return;
    const map = this._map;
    // keep the canvas pinned to the viewport while the map pane moves
    L.DomUtil.setPosition(this._canvas, map.containerPointToLayerPoint([0, 0]));

    const bounds = map.getPixelBounds();
    const world = 256 * 2 ** map.getZoom();
    const minX = bounds.min.x / world, maxX = bounds.max.x / world;
    gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    // additive: dense flows glow towards white, as in the original
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this._prog);

    const u = this._uni;
    gl.uniform2f(u.uOrigin, minX, bounds.min.y / world);
    gl.uniform1f(u.uWorld, world * this._dpr);
    gl.uniform2f(u.uViewport, this._canvas.width, this._canvas.height);
    gl.uniform1f(u.uTime, performance.now() - this._start);
    gl.uniform1f(u.uSpeedFactor, Config.particleBaseSpeedMs / this.speed);
    gl.uniform1f(u.uOffsetFactor, this.pathOffset);
    gl.uniform1f(u.uPointSize, this._pointSize());
    gl.uniform1f(u.uOpacity, this.opacity);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);
    gl.enableVertexAttribArray(this._attr.pos);
    gl.enableVertexAttribArray(this._attr.off);
    gl.vertexAttribPointer(this._attr.pos, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(this._attr.off, 4, gl.FLOAT, false, 32, 16);

    const scale = this.scaleByBandwidth ? this.bandwidthScale : 1;
    const onion = Math.floor(this._onionCount * scale);
    const general = Math.floor((this._total - this._onionCount) * scale);
    for (let shift = Math.floor(minX); shift <= Math.floor(maxX); shift++) {
      gl.uniform1f(u.uShift, shift);
      if (this.traffic !== 'onion' && general > 0) {
        gl.uniform3fv(u.uColor, Config.particleGeneralColor);
        gl.drawArrays(gl.POINTS, this._onionCount, general);
      }
      if (this.traffic !== 'general' && onion > 0) {
        gl.uniform3fv(u.uColor, Config.particleOnionColor);
        gl.drawArrays(gl.POINTS, 0, onion);
      }
    }
  },
});
