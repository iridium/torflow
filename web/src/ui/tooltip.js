// The floating hover label used by markers and countries.
let el;

export function showTooltip(html, x, y) {
  el ||= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'hover-label' });
  el.innerHTML = html;
  el.style.display = 'block';
  moveTooltip(x, y);
}

export function moveTooltip(x, y) {
  if (!el) return;
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.min(Math.max(4, x - w / 2), innerWidth - w - 4);
  const top = y - h - 14 < 4 ? y + 18 : y - h - 14;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

export function hideTooltip() {
  if (el) el.style.display = 'none';
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
