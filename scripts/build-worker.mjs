import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
// Ship a self-contained worker so consumers need no MapLibre-specific bundler setup.
await build({ entryPoints: ['maplibre-gl/dist/maplibre-gl-worker.mjs'], outfile: 'src/map/worker.js', bundle: true, format: 'esm', platform: 'browser', minify: true, legalComments: 'inline' });
const licenses = [
  ['MapLibre GL JS 6.9.0','node_modules/maplibre-gl/LICENSE.txt'],
  ['MapLibre style specification 26.4.2','node_modules/@maplibre/maplibre-gl-style-spec/LICENSE.txt'],
  ['PMTiles 4.5.0','third_party/pmtiles.LICENSE'],
  ['Protomaps basemap styles 5.7.2','third_party/protomaps-basemaps.LICENSE'],
  ['idb 8.0.3','node_modules/idb/LICENSE'],
  ['hash-wasm 4.12.0','node_modules/hash-wasm/LICENSE'],
];
await writeFile('src/notices.txt',(await Promise.all(licenses.map(async ([name,path])=>`${name}\n\n${await readFile(path,'utf8')}`))).join('\n\n'));
