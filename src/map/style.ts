import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';

/** Generic orientation basemap; program overlays are added separately by the renderer. */
export function defaultBasemapStyle(theme: 'light' | 'dark', archiveUrl: string, resourceBase: string, attribution: string): StyleSpecification {
  const base = resourceBase.replace(/\/$/, '');
  const defaults = layers('basemap', namedFlavor(theme), { lang: 'en' }).filter(layer =>
    !/buildings|address|pois|rail|oneway|minor_service|roads_other|tunnels_other|bridges_other|pedestrian|hospital|industrial|school|zoo/.test(layer.id));
  // Keep font dependencies finite and explicit. Program airport labels are separate.
  for (const layer of defaults) {
    if (layer.type === 'symbol' && layer.layout?.['text-field'] && !layer.id.includes('shield')) {
      layer.layout['text-field'] = ['coalesce', ['get', 'name:en'], ['get', 'name'], ''];
      layer.paint = { ...layer.paint, 'text-color': theme === 'light' ? '#465653' : '#c3d2cb', 'text-halo-color': theme === 'light' ? '#f4f3ed' : '#1b2927', 'text-halo-width': 1.5 };
    }
    if (layer.id === 'water' && layer.type === 'fill') layer.paint = { ...layer.paint, 'fill-color': theme === 'light' ? '#c7dfe5' : '#243e49' };
  }
  return {
    version: 8,
    glyphs: `${base}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${base}/sprites/${theme}`,
    sources: { basemap: { type: 'vector', url: `pmtiles://${archiveUrl}`, attribution } },
    layers: defaults,
  } as StyleSpecification;
}
