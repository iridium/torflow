const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const cf = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const number = (v) => (v == null ? '—' : nf.format(v));
export const compact = (v) => (v == null ? '—' : cf.format(v));
export const percent = (v, digits = 1) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`);

/** Gbit/s -> human readable */
export function gbps(v) {
  if (v == null) return '—';
  if (v >= 1000) return `${nf.format(v / 1000)} Tbit/s`;
  if (v >= 1) return `${nf.format(v)} Gbit/s`;
  return `${nf.format(v * 1000)} Mbit/s`;
}

const df = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const date = (iso) => df.format(new Date(`${iso}T00:00:00Z`));

export const regionName = (() => {
  let names;
  try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* old browsers */ }
  return (cc) => {
    try { return names?.of(cc) ?? cc; } catch { return cc; }
  };
})();
