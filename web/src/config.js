// Visual and behavioural defaults (mirrors the original TorFlow config).
export const IS_MOBILE = matchMedia('(max-width: 768px), (pointer: coarse)').matches;

const mobile = (value, factor) => (IS_MOBILE ? Math.round(value * factor) : value);

export const Config = {
  // Where the pipeline output lives: data/ next to the page by default
  // (relative, so subpath hosting works); VITE_DATA_URL points elsewhere.
  dataUrl: (import.meta.env.VITE_DATA_URL || 'data').replace(/\/$/, ''),

  accent: 'rgb(20, 155, 223)',
  bandwidthRamp: ['rgb(64,0,128)', 'rgb(30,155,223)'],
  connectionsRamp: ['rgb(64,0,128)', 'rgb(30,115,223)'],
  countriesRamp: ['rgb(64,0,128)', 'rgb(50,100,255)'],

  // particle colours (linear RGB, 0..1)
  particleOnionColor: [1.0, 0.4, 0.0],
  particleGeneralColor: [0.1, 0.3, 0.6],
  // Used when Tor Metrics has no onion-service estimate for a date.
  defaultOnionShare: 0.03,

  nodeCount: mobile(500, 0.5),
  nodeCountMin: mobile(100, 0.5),
  nodeCountMax: mobile(3000, 0.5),
  nodeRadius: { min: 2.5, max: 20 },

  countryCount: mobile(50, 0.2),
  countryCountMin: 5,
  countryCountMax: 200,

  particleCount: mobile(400000, 0.3),
  particleCountMin: mobile(100000, 0.3),
  particleCountMax: mobile(5000000, 0.3),
  particleOffset: 0.1,
  particleOffsetMin: 0.0001,
  particleOffsetMax: 4.0,
  particleSize: 1,
  particleSizeMin: 1,
  particleSizeMax: 10,
  particleZoomScale: (zoom, size) => size * Math.max(1, 2 ** (zoom - 4)),
  particleBaseSpeedMs: 60000, // ms for a particle to circle the earth
  particleSpeedMin: 0.01,
  particleSpeedMax: 4.0,

  zoom: IS_MOBILE ? { min: 2, start: 2, max: 10 } : { min: 3, start: 4, max: 10 },
  center: [40, -42],
  basemapStyle: 'https://tiles.openfreemap.org/styles/dark',
  basemapCredit: 'OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
};
