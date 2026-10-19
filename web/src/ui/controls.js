// Layer menus and their controls: collapsible panels with a visibility
// checkbox, labelled sliders, toggles and a segmented button group.
import { icons } from './icons.js';

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

export function layerMenu({ label, visible = true, onToggle, minimized = true }) {
  const root = h('section', 'map-control-element layer-menu');
  const head = h('div', 'layer-control-head');
  const toggle = h('button', 'layer-toggle');
  toggle.setAttribute('aria-label', `Show ${label}`);
  const title = h('button', 'layer-title', `<span>${label}</span><span class="minimize-toggle"></span>`);
  const body = h('div', 'layer-control-body');
  head.append(toggle, title);
  root.append(head, body);

  let isVisible = visible, isMin = minimized;
  const render = () => {
    toggle.innerHTML = isVisible ? icons.check : icons.box;
    toggle.setAttribute('aria-pressed', String(isVisible));
    title.querySelector('.minimize-toggle').innerHTML = isMin ? icons.plus : icons.minus;
    title.setAttribute('aria-expanded', String(!isMin));
    body.hidden = isMin;
    root.classList.toggle('layer-hidden', !isVisible);
  };
  if (onToggle) {
    toggle.addEventListener('click', () => { isVisible = !isVisible; onToggle(isVisible); render(); });
  } else {
    toggle.disabled = true;
  }
  title.addEventListener('click', () => { isMin = !isMin; render(); });
  render();
  return { el: root, body, add: (...controls) => { body.append(...controls); return root; } };
}

/**
 * @param {object} o
 * @param {(v: number) => void} [o.onInput]   fires continuously while dragging
 * @param {(v: number) => void} [o.onChange]  fires once on release (for expensive updates)
 */
export function slider({ label, min, max, step, value, format = (v) => v.toFixed(2), onInput, onChange }) {
  const root = h('label', 'layer-control');
  const input = Object.assign(h('input', 'range'), { type: 'range', min, max, step, value });
  const out = h('output', 'control-value-label', format(Number(value)));
  root.append(h('span', 'layer-control-label', label), input, out);
  const fill = () => input.style.setProperty('--fill', `${((input.value - min) / (max - min)) * 100}%`);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    fill();
    onInput?.(v);
  });
  input.addEventListener('change', () => onChange?.(Number(input.value)));
  fill();
  return root;
}

export function toggle({ label, value, onChange }) {
  const root = h('label', 'layer-control toggle-control');
  const input = Object.assign(h('input'), { type: 'checkbox', checked: value });
  const box = h('span', 'toggle-box', value ? icons.check : icons.box);
  input.addEventListener('change', () => {
    box.innerHTML = input.checked ? icons.check : icons.box;
    onChange(input.checked);
  });
  root.append(input, box, h('span', 'layer-control-label', label));
  return root;
}

/** buttons: [{ label, value, swatch: css color | [left, right] }] */
export function buttonGroup({ buttons, value, onChange }) {
  const root = h('div', 'btn-group');
  root.setAttribute('role', 'radiogroup');
  const els = buttons.map((b) => {
    const btn = h('button', 'btn');
    btn.setAttribute('role', 'radio');
    const sw = Array.isArray(b.swatch)
      ? `<span class="half-circle left" style="background:${b.swatch[0]}"></span><span class="half-circle right" style="background:${b.swatch[1]}"></span>`
      : `<span class="half-circle left" style="background:${b.swatch}"></span><span class="half-circle right" style="background:${b.swatch}"></span>`;
    btn.innerHTML = `${sw}${b.label}`;
    btn.addEventListener('click', () => { select(b.value); onChange(b.value); });
    root.append(btn);
    return [b.value, btn];
  });
  const select = (v) => els.forEach(([bv, btn]) => {
    btn.classList.toggle('active', bv === v);
    btn.setAttribute('aria-checked', String(bv === v));
  });
  select(value);
  return root;
}

/** A draggable floating panel with a close button. */
export function dialog({ className = '', onClose } = {}) {
  const root = h('div', `chart-container ${className}`);
  root.setAttribute('role', 'dialog');
  const close = h('button', 'large-button chart-close-button', icons.close);
  close.setAttribute('aria-label', 'Close');
  const content = h('div', 'chart-content');
  root.append(close, content);
  document.querySelector('.main').append(root);

  const hide = () => { root.hidden = true; onClose?.(); };
  close.addEventListener('click', hide);
  root.hidden = true;

  // drag anywhere except on interactive elements
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, a, input, svg .clickable')) return;
    if (matchMedia('(max-width: 768px)').matches) return;
    const r = root.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    root.setPointerCapture(e.pointerId);
    root.classList.add('dragging');
    const move = (ev) => {
      root.style.left = `${Math.min(Math.max(0, ev.clientX - dx), innerWidth - 60)}px`;
      root.style.top = `${Math.min(Math.max(0, ev.clientY - dy), innerHeight - 40)}px`;
      root.style.right = 'auto';
      root.style.transform = 'none';
    };
    const up = () => {
      root.classList.remove('dragging');
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
    };
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
  });

  return { el: root, content, show: () => { root.hidden = false; }, hide, get open() { return !root.hidden; } };
}
