// Dark vector basemap from OpenFreeMap (free, no API key), rendered with
// MapLibre inside Leaflet. The style is split in two so labels can sit above
// the particles and be toggled separately, as in the original's raster layers.
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Config } from '../config.js';

const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** @returns {Promise<{ base: L.Layer, labels: L.Layer }>} */
export async function addBasemap(map) {
  const style = await fetch(Config.basemapStyle).then((r) => r.json());
  const isLabel = (layer) => layer.type === 'symbol';
  // Keep the label layer sparse, like CARTO's dark_only_labels: country
  // and city names only (no roads, regions, towns or water names).
  const keepLabel = (layer) => /^place_(country|city)/.test(layer.id);

  const labelsPane = map.createPane('labels');
  labelsPane.style.zIndex = 650;
  labelsPane.style.pointerEvents = 'none';

  const base = maplibreGL({
    style: { ...style, layers: style.layers.filter((l) => !isLabel(l)) },
    attribution: ATTRIBUTION,
    pane: 'tilePane',
    preserveDrawingBuffer: true, // for "save as image"
  }).addTo(map);
  const labels = maplibreGL({
    style: { ...style, layers: style.layers.filter((l) => isLabel(l) && keepLabel(l)) },
    pane: 'labels',
    preserveDrawingBuffer: true,
  }).addTo(map);
  labels.getContainer().style.opacity = 0.65;
  return { base, labels };
}
