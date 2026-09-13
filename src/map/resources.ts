import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import type { OfflineMapPackage } from './contracts.js';

/** Reject undeclared remote dependencies before promoting an offline package. */
export function validateStyleResources(style: StyleSpecification, p: OfflineMapPackage) {
  if (validateStyleMin(style).length) throw new Error('Invalid MapLibre style');
  const fail = () => { throw new Error('Style references unsupported or unlisted offline resources'); };
  const normalize = (url: string) => new URL(url, 'https://program.invalid/').href;
  const present = (url: string) => p.resources.some(r => normalize(r.url) === normalize(url));
  if (style.version !== 8 || !Array.isArray(style.layers) || !style.sources || 'imports' in style) fail();
  for (const [id, source] of Object.entries(style.sources)) {
    if (id !== 'basemap' || source.type !== 'vector' || source.url !== `pmtiles://${p.url}` || source.tiles) fail();
  }
  if (style.sprite) {
    if (typeof style.sprite !== 'string') fail();
    for (const suffix of ['.json','.png','@2x.json','@2x.png']) if (!present(`${style.sprite}${suffix}`)) fail();
  }
  const fonts = new Set<string>();
  const walkFonts = (value: unknown) => {
    if (!Array.isArray(value)) return fail();
    if (value.every(v => typeof v === 'string') && !['case','match','get','literal'].includes(value[0])) { fonts.add(value.join(',')); return; }
    if (value[0] === 'literal') { walkFonts(value[1]); return; }
    if (value[0] !== 'case') return fail();
    for (let i = 2; i < value.length - 1; i += 2) walkFonts(value[i]);
    walkFonts(value.at(-1));
  };
  for (const layer of style.layers) if (layer.type === 'symbol' && layer.layout?.['text-field']) {
    walkFonts(layer.layout['text-font'] ?? ['Open Sans Regular','Arial Unicode MS Regular']);
    // Formatted text can introduce arbitrary per-span fonts; require flattened labels.
    if (JSON.stringify(layer.layout['text-field']).includes('"text-font"')) fail();
  }
  if (fonts.size && !style.glyphs) fail();
  for (const font of fonts) for (let start = 0; start < 65536; start += 256) {
    if (!present(style.glyphs!.replace('{fontstack}', font).replace('{range}', `${start}-${start+255}`))) fail();
  }
}
