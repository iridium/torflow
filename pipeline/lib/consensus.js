// Parser for Tor network-status consensus documents (dir-spec §3.4.1) and the
// position weighting clients use when building circuits (dir-spec §3.8.3).

/**
 * @typedef {object} Relay
 * @property {string} nickname
 * @property {string} fingerprint  hex, uppercase
 * @property {string} address      IPv4 address from the "r" line
 * @property {Set<string>} flags
 * @property {number} weight       consensus weight ("w Bandwidth=")
 */

/**
 * @param {string} text  raw consensus document
 * @returns {{ validAfter: string, relays: Relay[], weights: Record<string, number> }}
 */
export function parseConsensus(text) {
  const relays = [];
  const weights = {};
  let validAfter = null;
  let current = null;

  for (const line of text.split('\n')) {
    const sp = line.indexOf(' ');
    const keyword = sp === -1 ? line : line.slice(0, sp);
    const rest = sp === -1 ? '' : line.slice(sp + 1);
    switch (keyword) {
      case 'valid-after':
        validAfter = rest.trim();
        break;
      case 'r': {
        // r <nickname> <identity> <digest> <date> <time> <IP> <ORPort> <DirPort>
        const parts = rest.split(' ');
        current = {
          nickname: parts[0],
          fingerprint: Buffer.from(parts[1], 'base64').toString('hex').toUpperCase(),
          address: parts[5],
          flags: new Set(),
          weight: 0,
        };
        relays.push(current);
        break;
      }
      case 's':
        if (current) current.flags = new Set(rest.trim().split(/\s+/));
        break;
      case 'w':
        if (current) {
          const m = /Bandwidth=(\d+)/.exec(rest);
          if (m) current.weight = Number(m[1]);
        }
        break;
      case 'directory-footer':
        current = null;
        break;
      case 'bandwidth-weights':
        for (const kv of rest.trim().split(/\s+/)) {
          const [k, v] = kv.split('=');
          weights[k] = Number(v);
        }
        break;
    }
  }

  if (!validAfter) throw new Error('not a consensus: missing valid-after');
  return { validAfter, relays, weights };
}

// Default bandwidth-weights for very old consensuses that predate them:
// every position weighted equally.
const UNIFORM = { Wgg: 10000, Wgd: 10000, Wmg: 10000, Wme: 10000, Wmm: 10000, Wmd: 10000, Wee: 10000, Wed: 10000 };

/**
 * Probability-proportional weight of a relay being chosen for each circuit
 * position, following the client path-selection rules.
 * @param {Relay} relay
 * @param {Record<string, number>} bw  bandwidth-weights from the consensus
 * @returns {{ guard: number, middle: number, exit: number }}
 */
export function positionWeights(relay, bw) {
  const w = { ...UNIFORM, ...bw };
  const f = relay.flags;
  if (!f.has('Running') || !f.has('Valid')) return { guard: 0, middle: 0, exit: 0 };
  const isGuard = f.has('Guard');
  const isExit = f.has('Exit') && !f.has('BadExit');
  const b = relay.weight;
  let guard = 0, middle, exit = 0;
  if (isGuard && isExit) {
    guard = b * w.Wgd; middle = b * w.Wmd; exit = b * w.Wed;
  } else if (isGuard) {
    guard = b * w.Wgg; middle = b * w.Wmg;
  } else if (isExit) {
    middle = b * w.Wme; exit = b * w.Wee;
  } else {
    middle = b * w.Wmm;
  }
  return { guard, middle, exit };
}
