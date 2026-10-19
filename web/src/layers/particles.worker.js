// Generates particle paths for a day's relay locations off the main thread.
//
// Each particle is one hop of a simulated circuit. General traffic alternates
// guard→middle and middle→exit hops; onion-service traffic uses
// guard→middle and middle→middle hops (rendezvous circuits never exit).
// Endpoints are sampled with the same position probabilities Tor clients use.
//
// Buffer layout per particle (8 floats):
//   startX, startY, endX, endY, seed0, bow0, seed1, bow1

// Vose's alias method: O(1) weighted sampling.
function aliasTable(weights) {
  const n = weights.length;
  const sum = weights.reduce((a, b) => a + b, 0);
  const prob = new Float64Array(n);
  const alias = new Uint32Array(n);
  if (!sum) return null;
  const scaled = weights.map((w) => (w * n) / sum);
  const small = [], large = [];
  scaled.forEach((p, i) => (p < 1 ? small : large).push(i));
  while (small.length && large.length) {
    const s = small.pop(), l = large.pop();
    prob[s] = scaled[s];
    alias[s] = l;
    scaled[l] = scaled[l] + scaled[s] - 1;
    (scaled[l] < 1 ? small : large).push(l);
  }
  for (const i of large) prob[i] = 1;
  for (const i of small) prob[i] = 1;
  return () => {
    const i = Math.floor(Math.random() * n);
    return Math.random() < prob[i] ? i : alias[i];
  };
}

function generate({ nodes, count, onionShare, offset }) {
  const pick = {
    guard: aliasTable(nodes.map((n) => n.g)),
    middle: aliasTable(nodes.map((n) => n.m)),
    exit: aliasTable(nodes.map((n) => n.e)),
  };
  // Very old consensuses may lack a position; fall back to raw weight.
  const any = aliasTable(nodes.map((n) => n.w));
  for (const k of Object.keys(pick)) pick[k] ||= any;

  const onionCount = Math.floor(count * onionShare);
  const buffer = new Float32Array(count * 8);
  const step = Math.max(1, Math.floor(count / 100));

  for (let i = 0; i < count; i++) {
    const onion = i < onionCount;
    const firstHop = Math.random() < 0.5;
    const from = firstHop ? pick.guard : pick.middle;
    const to = firstHop ? pick.middle : onion ? pick.middle : pick.exit;
    const a = from();
    let b = to();
    // Avoid zero-length hops where possible (single-location networks can't).
    for (let tries = 0; b === a && tries < 8; tries++) b = to();
    const sign = Math.random() > 0.5 ? 1 : -1;
    const o = i * 8;
    buffer[o] = nodes[a].x;
    buffer[o + 1] = nodes[a].y;
    buffer[o + 2] = nodes[b].x;
    buffer[o + 3] = nodes[b].y;
    buffer[o + 4] = Math.random() / 2;
    buffer[o + 5] = sign * Math.random() * offset;
    buffer[o + 6] = Math.random() / 2 + 0.5;
    buffer[o + 7] = sign * Math.random() * offset;
    if (i % step === 0) postMessage({ type: 'progress', progress: i / count });
  }
  postMessage({ type: 'complete', buffer: buffer.buffer, onionCount }, [buffer.buffer]);
}

addEventListener('message', (e) => {
  if (e.data.type === 'start') generate(e.data);
});
