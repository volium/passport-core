import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { OfflineMapManager } from '../src/map/offline/manager.js';
import { IndexedMapStorage } from '../src/map/offline/storage.js';
import { validateMapPackage } from '../src/map/contracts.js';

import { fixture } from './map-fixture.js';
describe('independent offline map lifecycle', () => {
  it('validates manifest identity, sizes, schemas, zooms and resource references', async () => {
    const {p}=await fixture(); expect(()=>validateMapPackage(p)).not.toThrow();
    for(const patch of [{version:''},{sizeBytes:1},{maxNativeZoom:-1},{sha256:'bad'},{basemapSchemaVersion:'unknown'},{resources:[]},{url:'javascript:bad()'}]) expect(()=>validateMapPackage({...p,...patch})).toThrow();
  });
  it('installs verified bytes, reopens without network, detects eviction, deletes and redownloads', async () => {
    const {p,env}=await fixture(); const program=crypto.randomUUID(); const storage=new IndexedMapStorage(program,p.id);const manager=new OfflineMapManager(program,p,storage,env);
    await manager.download();expect(manager.status.state).toBe('installed');expect(manager.status.persistence).toBe('granted');
    await storage.close();const reopened=new IndexedMapStorage(program,p.id);const next=new OfflineMapManager(program,p,reopened,{...env,fetch:async()=>{throw Error('offline')}});
    await next.check();expect(next.status.state).toBe('installed');
    await reopened.remove(next.status.active!.generation);await next.check();expect(next.status.state).toBe('missing');
    await manager.delete();await manager.download();expect(manager.status.state).toBe('installed');await manager.delete();expect((await storage.inventory()).active).toBeUndefined();await storage.close();await reopened.close();
  });
  it('keeps the active version on corrupt, failed and quota-limited replacements; supports rollback',async()=>{
    const {p,env}=await fixture();const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);const a=new OfflineMapManager('test',p,storage,env);await a.download();const generation=a.status.active!.generation;
    const replacement={...p,version:'2'};
    for(const failure of [
      {...env,fetch:async()=>new Response(new Uint8Array([1]))},
      {...env,fetch:async()=>{throw Error('network failed')}},
      {...env,estimate:async()=>({quota:1,usage:0})},
    ]) {const b=new OfflineMapManager('test',replacement,storage,failure);await b.check();expect(b.status.updateAvailable).toBe(true);await b.download();expect(b.status.state).not.toBe('installed');expect((await storage.inventory()).active!.generation).toBe(generation);}
    const b=new OfflineMapManager('test',replacement,storage,env);await b.download();expect(b.status.active!.package.version).toBe('2');await b.rollback();expect(b.status.active!.package.version).toBe('1');await storage.close();
  });
  it.each([false,undefined])('degrades honestly for persistence %s',async persistence=>{
    const {p,env}=await fixture();const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);const manager=new OfflineMapManager('test',p,storage,{...env,persist:persistence===undefined?undefined:async()=>persistence});await manager.download();expect(manager.status.state).toBe('installed');expect(manager.status.persistence).toBe(persistence===undefined?'unavailable':'not-granted');await storage.close();
  });
  it('retains one rollback generation and reports only obsolete payload bytes reclaimed', async () => {
    const {p,env}=await fixture(); const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);
    const managers=[1,2,3].map(version=>new OfflineMapManager('test',{...p,version:String(version)},storage,env));
    for (const manager of managers) await manager.download();
    expect((await storage.inventory()).previous!.package.version).toBe('2');
    expect(managers[2].status.reclaimedBytes).toBe(p.sizeBytes+p.resources.reduce((sum,r)=>sum+r.sizeBytes,0));
    await expect(managers[0].source(managers[0].status.active!).getBytes(0,7)).rejects.toThrow('missing');
    await managers[2].rollback(); expect(managers[2].status.active!.package.version).toBe('2');
    await storage.close();
  });
  it('never installs interrupted or partial range responses',async()=>{
    const {p,env,archive}=await fixture();const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);const manager=new OfflineMapManager('test',p,storage,{...env,fetch:async()=>new Response(archive,{status:206})});await manager.download();expect(manager.status.state).toBe('failed');expect((await storage.inventory()).active).toBeUndefined();await storage.close();
  });
  it('cancels a staged replacement while the prior archive remains readable', async () => {
    const {p,env}=await fixture(); const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);
    const first=new OfflineMapManager('test',p,storage,env); await first.download();
    let started!:()=>void;const pending=new Promise<void>(resolve=>{started=resolve;});
    const next=new OfflineMapManager('test',{...p,version:'2'},storage,{...env,fetch:async (_input,options)=>{
      started(); return new Promise<Response>((_resolve,reject)=>options!.signal!.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError'))));
    }});
    const download=next.download();await pending;
    expect((await first.source(first.status.active!).getBytes(0,7)).data.byteLength).toBe(7);
    next.cancel();await download;
    expect((await storage.inventory()).active!.package.version).toBe('1');
    expect(next.status.error).toContain('interrupted');await storage.close();
  });
  it('rejects a style with unlisted glyphs and preserves the installed version', async () => {
    const {p,env,archive}=await fixture(); const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);
    const first=new OfflineMapManager('test',p,storage,env);await first.download();
    const bytes=new TextEncoder().encode(JSON.stringify({version:8,sources:{},layers:[{id:'label',type:'symbol',layout:{'text-field':'Name','text-font':['Missing font']}}],glyphs:'https://external.invalid/{fontstack}/{range}.pbf'}));
    const {createSHA256}=await import('hash-wasm');
    const replacement={...p,version:'2',resources:p.resources.map(r=>r.id==='style'?{...r,sizeBytes:bytes.length,sha256:r.sha256}:r)};
    replacement.resources[0].sha256=(await createSHA256()).update(bytes).digest();
    const next=new OfflineMapManager('test',replacement,storage,{...env,fetch:async input=>new Response(String(input)===p.url?archive:String(input).endsWith('/style')?bytes:new Uint8Array())});
    await next.download();expect(next.status.state).toBe('failed');expect((await storage.inventory()).active!.package.version).toBe('1');await storage.close();
  });
});
