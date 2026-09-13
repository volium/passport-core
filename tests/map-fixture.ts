import { createSHA256 } from 'hash-wasm';
import type { MapEnvironment } from '../src/map/offline/manager.js';
import type { OfflineMapPackage } from '../src/map/contracts.js';
const hash = async (data: Uint8Array) => (await createSHA256()).update(data).digest();
export async function fixture(version = '1') {
  const archive = new Uint8Array(128); archive.set(new TextEncoder().encode('PMTiles')); archive[7] = 3;
  const view = new DataView(archive.buffer); view.setBigUint64(8,127n,true); view.setBigUint64(16,1n,true);
  view.setInt32(102, -1250000000, true); view.setInt32(106, 450000000, true); view.setInt32(110, -1160000000, true); view.setInt32(114, 500000000, true);
  archive[97] = 1; archive[98] = 1; archive[99] = 1; archive[100] = 0; archive[101] = 12;
  const style = new TextEncoder().encode(JSON.stringify({ version: 8, sources: {}, layers: [] }));
  const p: OfflineMapPackage = { id:'fixture',name:'Fixture',url:'https://fixture.invalid/map.pmtiles',version,sizeBytes:archive.length,sha256:await hash(archive),bounds:{west:-125,south:45,east:-116,north:50},maxNativeZoom:12,attribution:'Fixture',sourceBuild:'fixture',basemapSchemaVersion:'4',licenses:[{name:'Fixture',url:'https://fixture.invalid/license',resourceId:'license'}],lightStyleResourceId:'style',darkStyleResourceId:'style',resources:[{id:'style',kind:'style',url:'https://fixture.invalid/style',sizeBytes:style.length,sha256:await hash(style)},{id:'license',kind:'license',url:'https://fixture.invalid/license',sizeBytes:0,sha256:await hash(new Uint8Array())}] };
  const env: MapEnvironment = { fetch: async input => new Response(String(input) === p.url ? archive : String(input).endsWith('/style') ? style : new Uint8Array()), lock: async (_name, action) => action(), persist: async () => true, estimate: async () => ({quota:10000000,usage:0}) };
  return {p,env,archive};
}
