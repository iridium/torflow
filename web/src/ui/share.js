// Share sheet: copy a link to the current view, hand it to the OS share
// sheet, post it to a few networks, or save the map as a PNG.
import * as fmt from '../format.js';
import { icons } from './icons.js';

const enc = encodeURIComponent;
const TARGETS = [
  { name: 'Bluesky', icon: icons.bluesky, href: (url, text) => `https://bsky.app/intent/compose?text=${enc(`${text} ${url}`)}` },
  { name: 'Mastodon', icon: icons.mastodon, href: (url, text) => `https://toot.kytta.dev/?text=${enc(`${text} ${url}`)}` },
  { name: 'X', icon: icons.x, href: (url, text) => `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}` },
  { name: 'Reddit', icon: icons.reddit, href: (url, text) => `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(text)}` },
  { name: 'Email', icon: icons.mail, href: (url, text) => `mailto:?subject=${enc(text)}&body=${enc(url)}` },
];

/**
 * @param {object} o
 * @param {HTMLElement} o.button     the toolbar button that opens the sheet
 * @param {() => string} o.getDate   currently shown date (ISO)
 * @param {() => Promise<Blob>} o.snapshot  renders the map to a PNG
 */
export function shareSheet({ button, getDate, snapshot }) {
  const sheet = document.createElement('div');
  sheet.className = 'share-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Share this view');
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="share-title">Share this view</div>
    <div class="share-subtitle"></div>
    <div class="share-link">
      <span class="share-link-icon">${icons.link}</span>
      <input type="text" readonly aria-label="Link to this view">
      <button class="share-copy" type="button">${icons.copy}<span>Copy</span></button>
    </div>
    <div class="share-targets">
      <button class="share-target share-native" type="button" hidden>${icons.upload}<span>Share…</span></button>
      ${TARGETS.map((t) => `<a class="share-target" data-name="${t.name}" target="_blank" rel="noopener">${t.icon}<span>${t.name}</span></a>`).join('')}
    </div>
    <button class="share-image" type="button">${icons.image}<span>Save map as image</span></button>`;
  document.querySelector('.main').append(sheet);

  const input = sheet.querySelector('input');
  const copyBtn = sheet.querySelector('.share-copy');
  const nativeBtn = sheet.querySelector('.share-native');
  const imageBtn = sheet.querySelector('.share-image');
  const text = () => `Data flow in the Tor network on ${fmt.date(getDate())} · TorFlow`;

  const refresh = () => {
    const url = location.href;
    input.value = url;
    sheet.querySelector('.share-subtitle').textContent = `${fmt.date(getDate())} · current map position${location.hash.includes('country=') ? ' and country' : ''}`;
    for (const a of sheet.querySelectorAll('a.share-target')) {
      a.href = TARGETS.find((t) => t.name === a.dataset.name).href(url, text());
    }
    nativeBtn.hidden = !navigator.share;
  };

  const open = () => {
    refresh();
    sheet.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    input.focus();
    input.select();
  };
  const close = () => {
    sheet.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    sheet.hidden ? open() : close();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!sheet.hidden && !sheet.contains(e.target) && !button.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.hidden) { close(); button.focus(); }
  });
  addEventListener('hashchange', () => !sheet.hidden && refresh());

  const flash = (btn, html, restore) => {
    btn.innerHTML = html;
    btn.classList.add('ok');
    setTimeout(() => { btn.innerHTML = restore; btn.classList.remove('ok'); }, 1600);
  };

  copyBtn.addEventListener('click', async () => {
    const original = copyBtn.innerHTML;
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    flash(copyBtn, `${icons.done}<span>Copied</span>`, original);
  });

  nativeBtn.addEventListener('click', async () => {
    try {
      await navigator.share({ title: 'TorFlow', text: text(), url: input.value });
      close();
    } catch { /* dismissed */ }
  });

  imageBtn.addEventListener('click', async () => {
    const original = imageBtn.innerHTML;
    imageBtn.disabled = true;
    imageBtn.innerHTML = `${icons.image}<span>Rendering…</span>`;
    try {
      const blob = await snapshot();
      const name = `torflow-${getDate()}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      // On phones, sharing the image directly beats a download.
      if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ files: [file], title: 'TorFlow', text: text() }).catch(() => {});
      } else {
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }
      imageBtn.disabled = false;
      flash(imageBtn, `${icons.done}<span>Saved</span>`, original);
    } catch (err) {
      console.error(err);
      imageBtn.disabled = false;
      flash(imageBtn, `${icons.close}<span>Couldn’t render image</span>`, original);
    }
  });
}

/**
 * Composites the map's layers (canvases + the SVG relay layer) in stacking
 * order into one PNG, with a caption.
 * @param {L.Map} map
 * @param {{ drawParticles: () => void, caption: string, attribution: string }} o
 */
export async function snapshotMap(map, { drawParticles, caption, attribution }) {
  const container = map.getContainer();
  const box = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const out = document.createElement('canvas');
  out.width = Math.round(box.width * dpr);
  out.height = Math.round(box.height * dpr);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, 0, out.width, out.height);

  const visible = (el) => {
    for (let n = el; n && n !== container; n = n.parentElement) {
      if (getComputedStyle(n).display === 'none') return false;
    }
    return true;
  };
  const opacity = (el) => {
    let a = 1;
    for (let n = el; n && n !== container; n = n.parentElement) a *= Number(getComputedStyle(n).opacity);
    return a;
  };
  const place = (el, source) => {
    const r = el.getBoundingClientRect();
    ctx.globalAlpha = opacity(el);
    ctx.filter = getComputedStyle(el.closest('.leaflet-gl-layer') ?? el).filter || 'none';
    ctx.drawImage(source, (r.left - box.left) * dpr, (r.top - box.top) * dpr, r.width * dpr, r.height * dpr);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  };
  const svgImage = (svg) => new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.removeAttribute('style'); // Leaflet's positioning transform; placement is done by drawImage
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  });

  // Panes in z-order; the particle canvas must be read in the same task it
  // is drawn, since its WebGL buffer isn't preserved.
  const panes = [...container.querySelectorAll('.leaflet-pane')]
    .filter((p) => p.querySelector('canvas, svg'))
    .sort((a, b) => (Number(getComputedStyle(a).zIndex) || 0) - (Number(getComputedStyle(b).zIndex) || 0));
  for (const pane of panes) {
    if (!visible(pane)) continue;
    for (const el of pane.querySelectorAll('canvas, svg')) {
      if (el.classList.contains('particle-canvas')) {
        if (el.style.visibility === 'hidden') continue;
        drawParticles();
        place(el, el);
      } else if (el.tagName === 'CANVAS') {
        place(el, el);
      } else if (el.parentElement === pane) {
        place(el, await svgImage(el));
      }
    }
  }

  // caption
  const pad = 14 * dpr;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4 * dpr;
  ctx.font = `bold ${26 * dpr}px "Lucida Grande", system-ui, sans-serif`;
  ctx.fillText('TorFlow', pad, pad + 24 * dpr);
  ctx.font = `${13 * dpr}px "Lucida Grande", system-ui, sans-serif`;
  ctx.fillStyle = '#ddd';
  ctx.fillText(caption, pad, pad + 44 * dpr);
  ctx.font = `${10 * dpr}px system-ui, sans-serif`;
  ctx.fillStyle = '#999';
  ctx.textAlign = 'right';
  ctx.fillText(attribution, out.width - pad, out.height - pad);

  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}
