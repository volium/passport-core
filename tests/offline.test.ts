import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { OfflineMapManager } from '../src/map/offline/manager.js';
import { CHUNK_BYTES, IndexedMapStorage } from '../src/map/offline/storage.js';
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

describe('offline setup policy and protection', () => {
  it('checks persistence on reopening and requests only once after a denial', async () => {
    const {p,env}=await fixture(); const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);
    let requests=0, granted=false;
    const configured={...env,persisted:async()=>granted,persist:async()=>{requests++;return false;}};
    const a=new OfflineMapManager('test',p,storage,configured);
    await a.protection(true); expect(a.status.persistence).toBe('not-granted');
    const b=new OfflineMapManager('test',p,storage,configured);
    await b.protection(true); expect(requests).toBe(1);
    granted=true;await b.protection();expect(b.status.persistence).toBe('granted');
    const rejected=new OfflineMapManager('test',p,storage,{...env,persisted:async()=>{throw Error('unavailable')}});
    await rejected.protection();expect(rejected.status.persistence).toBe('unavailable');await storage.close();
  });
  it('requires browser action, defers offline standalone setup, and reuses a verified map', async () => {
    const {p,env}=await fixture(); const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);let requests=0;
    const manager=new OfflineMapManager('test',p,storage,{...env,fetch:async(...args)=>{requests++;return env.fetch(...args)}});
    await manager.prepare(false,true);expect(requests).toBe(0);
    await manager.prepare(true,false);expect(manager.status.state).toBe('waiting');expect(requests).toBe(0);
    const states:string[]=[];manager.subscribe(s=>states.push(s.state));await manager.prepare(true,true);
    expect(manager.status.state).toBe('installed');expect(states).toContain('verifying');const count=requests;
    await manager.prepare(true,true);expect(requests).toBe(count);await storage.close();
  });
  it.each(['cancelled','deleted','interrupted','installed'])('never automatically redownloads when retained control says %s', async attempt => {
    const {p,env}=await fixture();const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);let requests=0;
    await storage.setInventory({control:{attempt}});
    const manager=new OfflineMapManager('test',p,storage,{...env,fetch:async(...args)=>{requests++;return env.fetch(...args)}});
    await manager.prepare(true,true);expect(requests).toBe(0);await manager.download();expect(manager.status.state).toBe('installed');await storage.close();
  });
  it('remembers cancellation while waiting and prevents automatic retry after a failed transfer', async () => {
    const {p,env}=await fixture();const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);
    // Use real serialization to exercise cancellation/foreground ordering.
    let tail=Promise.resolve();const lock:typeof env.lock=(_name,action)=>{const result=tail.then(action);tail=result.then(()=>{},()=>{});return result;};
    let requests=0;const configured={...env,lock,fetch:async()=>{requests++;throw Error('offline')}};
    const a=new OfflineMapManager('test',p,storage,configured);await a.prepare(true,false);a.cancel();await a.prepare(true,true);expect(requests).toBe(0);
    await a.download();expect(requests).toBe(1);await a.prepare(true,true);expect(requests).toBe(1);await storage.close();
  });
  it('does not transfer automatically when suppression metadata cannot be written',async()=>{
    const {p,env}=await fixture();const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);let requests=0;
    storage.setInventory=async()=>{throw Error('storage denied')};
    const a=new OfflineMapManager('test',p,storage,{...env,fetch:async(...args)=>{requests++;return env.fetch(...args)}});
    await a.prepare(true,true);expect(requests).toBe(0);expect(a.status.error).toContain('remembered');await storage.close();
  });
});


it('closing an offline waiting app does not count as an explicit cancellation',async()=>{
  const {p,env}=await fixture();const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);
  const a=new OfflineMapManager('test',p,storage,env);await a.prepare(true,false);a.close();
  const b=new OfflineMapManager('test',p,storage,env);await b.prepare(true,true);expect(b.status.state).toBe('installed');await storage.close();
});

it('serializes simultaneous automatic launches and downloads a package only once',async()=>{
  const {p,env}=await fixture();const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);let tail=Promise.resolve(),requests=0;
  const lock:typeof env.lock=(_name,action)=>{const result=tail.then(action);tail=result.then(()=>{},()=>{});return result;};
  const configured={...env,lock,fetch:async(...args:Parameters<typeof fetch>)=>{requests++;return env.fetch(...args)}};
  const a=new OfflineMapManager('test',p,storage,configured),b=new OfflineMapManager('test',p,storage,configured);
  await Promise.all([a.prepare(true,true),b.prepare(true,true)]);expect(requests).toBe(p.resources.length+1);expect(a.status.active).toBeDefined();expect(b.status.active).toBeDefined();await storage.close();
});


it('makes one fresh protection request after switching from browser to standalone in shared storage',async()=>{
  const {p,env}=await fixture();const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);let context:'browser'|'standalone'='browser',requests=0;
  const manager=new OfflineMapManager('test',p,storage,{...env,persistenceContext:()=>context,persisted:async()=>false,persist:async()=>{requests++;return false;}});
  await manager.protection(true);await manager.protection(true);expect(requests).toBe(1);
  context='standalone';await manager.protection(true);await manager.protection(true);expect(requests).toBe(2);await storage.close();
});


describe('lightweight saved-map reopening', () => {
  async function largeFixture() {
    const f = await fixture();
    const archive = new Uint8Array(3 * CHUNK_BYTES); archive.set(f.archive);
    const {createSHA256} = await import('hash-wasm');
    const p = {...f.p,sizeBytes:archive.length,sha256:(await createSHA256()).update(archive).digest()};
    const env = {...f.env,fetch:async (input: RequestInfo | URL) => String(input) === p.url ? new Response(archive) : f.env.fetch(input)};
    const program = crypto.randomUUID();
    const storage = new IndexedMapStorage(program,p.id);
    const manager = new OfflineMapManager(program,p,storage,env);
    await manager.download(); expect(manager.status.state).toBe('installed');
    return {p,env,program,storage,manager};
  }
  it('reopens and refreshes without network or full payload scans, including older installed versions', async () => {
    const {p,env,storage,manager} = await largeFixture();
    const read = vi.spyOn(storage,'read');
    const next = new OfflineMapManager('test',{...p,version:'new'},storage,{...env,fetch:async()=>{throw Error('offline')}});
    await next.check(); await next.check();
    expect(next.status.state).toBe('installed'); expect(next.status.updateAvailable).toBe(true);
    expect(read.mock.calls.reduce((sum,args)=>sum+args[3],0)).toBeLessThan(CHUNK_BYTES);
    expect(read.mock.calls.filter(args=>args[1]==='archive').every(args=>args[2]===0)).toBe(true);
    // Bytes outside the initial view are still available on demand offline.
    expect((await next.source(next.status.active!).getBytes(2*CHUNK_BYTES,100)).data.byteLength).toBe(100);
    manager.close(); next.close(); await storage.close();
  });
  it.each(['archive','style'])('detects missing %s records by key without scanning payloads', async resource => {
    const {p,env,program,storage,manager} = await largeFixture();
    const {openDB} = await import('idb');
    const db = await openDB('passport-maps:'+encodeURIComponent(program)+':'+encodeURIComponent(p.id));
    await db.delete('chunks',[manager.status.active!.generation,resource,resource==='archive'?2:0]); db.close();
    await manager.check(); expect(manager.status.state).toBe('missing'); expect(manager.status.active).toBeUndefined();
    const next = new OfflineMapManager(program,p,storage,env); await next.check(); expect(next.status.state).toBe('missing');
    manager.close(); next.close(); await storage.close();
  });
  it('defers unread tail corruption, but full rollback verification rejects it and truncated reads invalidate availability', async () => {
    const {p,env,storage,manager} = await largeFixture();
    const old = manager.status.active!;
    const tail = new Uint8Array(CHUNK_BYTES); tail[0]=42;
    await storage.write(old.generation,'archive',2,tail);
    await manager.check(); expect(manager.status.state).toBe('installed');
    const next = new OfflineMapManager('test',{...p,version:'2'},storage,env); await next.download();
    await expect(next.rollback()).rejects.toThrow('integrity');
    expect((await storage.inventory()).active!.package.version).toBe('2');
    const active = next.status.active!;
    await storage.write(active.generation,'archive',2,new Uint8Array(1));
    await expect(next.source(active).getBytes(2*CHUNK_BYTES,100)).rejects.toThrow('missing');
    expect(next.status.state).toBe('missing');
    manager.close(); next.close(); await storage.close();
  });
  it('still rejects corrupted stored bytes before activating a download', async () => {
    const {p,env}=await fixture();const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);
    const write=storage.write.bind(storage);
    vi.spyOn(storage,'write').mockImplementation(async(g,r,i,bytes)=>{const copy=bytes.slice();if(r==='archive')copy[127]^=1;await write(g,r,i,copy);});
    const manager=new OfflineMapManager('test',p,storage,env);await manager.download();
    expect(manager.status.state).toBe('integrity-failed');expect((await storage.inventory()).active).toBeUndefined();
    manager.close();await storage.close();
  });
});


it('silently reconciles a settled map without rereading payloads, but reports eviction', async () => {
  const {p,env}=await fixture();const storage=new IndexedMapStorage(crypto.randomUUID(),p.id);
  const installed=new OfflineMapManager('test',p,storage,env);await installed.download();
  const reopened=new OfflineMapManager('test',p,storage,env);await reopened.check();
  const states:string[]=[];reopened.subscribe(s=>states.push(s.state));
  const reads=vi.spyOn(storage,'read');await reopened.check();await reopened.check();
  expect(states.every(state=>state==='installed')).toBe(true);expect(reads).not.toHaveBeenCalled();
  await storage.remove(reopened.status.active!.generation);await reopened.check();
  expect(reopened.status.state).toBe('missing');expect(reopened.status.active).toBeUndefined();
  installed.close();reopened.close();await storage.close();
});
