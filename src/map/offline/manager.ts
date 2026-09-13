import { validateStyleResources } from '../resources.js';
import { createSHA256 } from 'hash-wasm';
import { PMTiles, type Source } from 'pmtiles';
import { packageBytes, validateMapPackage, type OfflineMapPackage } from '../contracts.js';
import { CHUNK_BYTES, type InstalledMap, type MapStorage, type MapInventory } from './storage.js';

export type MapState = 'not-downloaded' | 'checking' | 'downloading' | 'installed' | 'insufficient-storage' | 'failed' | 'integrity-failed' | 'missing';
export interface OfflineMapStatus {
  state: MapState; active?: InstalledMap; rollbackAvailable: boolean; updateAvailable: boolean; downloaded: number; total: number; reclaimedBytes: number;
  persistence: 'granted' | 'not-granted' | 'unavailable'; error?: string;
}
export interface MapEnvironment {
  fetch: typeof fetch;
  estimate?: () => Promise<{ quota?: number; usage?: number }>;
  persist?: () => Promise<boolean>;
  lock: <T>(name: string, action: () => Promise<T>) => Promise<T>;
}
export function browserMapEnvironment(): MapEnvironment {
  return {
    fetch: (...args) => fetch(...args),
    estimate: navigator.storage?.estimate ? () => navigator.storage.estimate() : undefined,
    persist: navigator.storage?.persist ? () => navigator.storage.persist() : undefined,
    lock: async (name, action) => {
      if (!navigator.locks) return Promise.reject(new Error('This browser cannot safely coordinate map downloads. Passport functions remain available.'));
      return navigator.locks.request(name, action);
    },
  };
}
class IntegrityError extends Error {}
export class OfflineMapManager {
  status: OfflineMapStatus;
  private abort?: AbortController;
  private channel?: BroadcastChannel;
  private listeners = new Set<(status: OfflineMapStatus) => void>();
  constructor(readonly programId: string, readonly advertised: OfflineMapPackage, readonly storage: MapStorage, private env: MapEnvironment) {
    validateMapPackage(advertised);
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`passport-map:${programId}:${advertised.id}`);
      this.channel.onmessage = () => void this.check();
    }
    this.status = { state: 'checking', rollbackAvailable: false, updateAvailable: false, downloaded: 0, total: packageBytes(advertised), reclaimedBytes: 0, persistence: 'unavailable' };
  }
  subscribe(fn: (status: OfflineMapStatus) => void) { this.listeners.add(fn); fn(this.status); return () => this.listeners.delete(fn); }
  private emit(value: Partial<OfflineMapStatus>) {
    this.status = { ...this.status, ...value }; this.listeners.forEach(fn => fn(this.status));
  }
  private lock<T>(action: () => Promise<T>) { return this.env.lock(`passport-map:${this.programId}:${this.advertised.id}`, action); }
  private missing(installed: InstalledMap, error: unknown) {
    if (this.status.active?.generation === installed.generation) this.emit({state:'missing',active:undefined,error:`Map storage is missing or unreadable: ${String(error)}`});
  }
  source(installed: InstalledMap): Source {
    return { getKey: () => `local-${encodeURIComponent(this.programId)}-${installed.generation}`,
      getBytes: async (offset, length, signal) => {
        signal?.throwIfAborted();
        const read = () => this.storage.read(installed.generation, 'archive', offset, Math.min(length, installed.package.sizeBytes - offset));
        const bytes = await read().catch(error => { this.missing(installed,error); throw error; });
        signal?.throwIfAborted();
        return { data: bytes.buffer as ArrayBuffer };
      } };
  }
  async resource(installed: InstalledMap, id: string) {
    const resource = installed.package.resources.find(r => r.id === id);
    if (!resource) throw new Error('Unknown map resource');
    return this.storage.read(installed.generation, id, 0, resource.sizeBytes).catch(error => { this.missing(installed,error); throw error; });
  }
  private async verify(installed: InstalledMap) {
    for (const resource of [{ id: 'archive', sizeBytes: installed.package.sizeBytes, sha256: installed.package.sha256 }, ...installed.package.resources]) {
      const hash = await createSHA256();
      for (let offset = 0; offset < resource.sizeBytes; offset += CHUNK_BYTES) {
        hash.update(await this.storage.read(installed.generation, resource.id, offset, Math.min(CHUNK_BYTES, resource.sizeBytes-offset)));
      }
      if (hash.digest() !== resource.sha256) throw new IntegrityError('Map integrity check failed');
    }
    for (const id of new Set([installed.package.lightStyleResourceId, installed.package.darkStyleResourceId])) {
      const r = installed.package.resources.find(r => r.id === id)!;
      validateStyleResources(JSON.parse(new TextDecoder().decode(await this.storage.read(installed.generation, id, 0, r.sizeBytes))), installed.package);
    }
    const header = await new PMTiles(this.source(installed)).getHeader();
    const b = installed.package.bounds;
    if (Math.abs(header.minLon-b.west)>1e-7 || Math.abs(header.maxLon-b.east)>1e-7 || Math.abs(header.minLat-b.south)>1e-7 || Math.abs(header.maxLat-b.north)>1e-7) throw new IntegrityError('Archive coverage differs from manifest');
    if (header.specVersion !== 3 || header.tileType !== 1 || header.minZoom !== (installed.package.minZoom ?? 0) || header.maxZoom !== installed.package.maxNativeZoom) throw new IntegrityError('Map archive format or zoom does not match its manifest');
  }
  async check() {
    if (this.abort) return;
    this.emit({ state: 'checking', error: undefined });
    try {
      await this.lock(async () => {
        const inventory = await this.storage.inventory();
        this.emit({rollbackAvailable:!!inventory.previous});
        if (inventory.active) {
          try { await this.verify(inventory.active); }
          catch (error) { this.emit({ state: 'missing', active: undefined, updateAvailable: false, error: String(error) }); return; }
        }
        const reclaimedBytes = await this.storage.clean([inventory.active?.generation, inventory.previous?.generation].filter((v): v is string => !!v));
        if (reclaimedBytes) this.emit({ reclaimedBytes });
        this.emit({ state: inventory.active ? 'installed' : 'not-downloaded', active: inventory.active, updateAvailable: !!inventory.active && inventory.active.package.version !== this.advertised.version });
      });
    } catch (error) { this.emit({ state: 'failed', active: undefined, error: String(error) }); }
  }
  close() { this.cancel(); this.channel?.close(); this.listeners.clear(); }
  cancel() { this.abort?.abort(); }
  async download() {
    if (this.abort) return;
    const abort = this.abort = new AbortController();
    const installed = { generation: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join(''), package: structuredClone(this.advertised) };
    this.emit({ state: 'downloading', downloaded: 0, error: undefined });
    try {
      await this.lock(async () => {
        abort.signal.throwIfAborted();
        let persistence: OfflineMapStatus['persistence'] = 'unavailable';
        if (this.env.persist) { try { persistence = await this.env.persist() ? 'granted' : 'not-granted'; } catch { persistence = 'not-granted'; } }
        this.emit({ persistence });
        const estimate = await this.env.estimate?.().catch((): { quota?: number; usage?: number } => ({}));
        if (estimate?.quota !== undefined && estimate.usage !== undefined && estimate.quota-estimate.usage < this.status.total * 1.15 + 2*CHUNK_BYTES) throw new DOMException('Not enough space for a complete replacement. Keep your current map or delete it explicitly.', 'QuotaExceededError');
        for (const resource of [{ id: 'archive', url: this.advertised.url, sizeBytes: this.advertised.sizeBytes, sha256: this.advertised.sha256 }, ...this.advertised.resources]) {
          abort.signal.throwIfAborted();
          const response = await this.env.fetch(resource.url, { signal: abort.signal, cache: 'no-store' });
          if (response.status !== 200 || !response.body) throw new Error(`Map download failed (${response.status}). Retry when connected.`);
          const reader = response.body.getReader(); const hash = await createSHA256();
          let buffer = new Uint8Array(CHUNK_BYTES); let used = 0; let index = 0; let received = 0;
          try {
            while (true) {
              const { done, value } = await reader.read(); if (done) break;
              abort.signal.throwIfAborted(); received += value.length;
              if (received > resource.sizeBytes) throw new IntegrityError('Unexpected map download size');
              hash.update(value);
              for (let offset = 0; offset < value.length;) {
                const take = Math.min(CHUNK_BYTES-used, value.length-offset);
                buffer.set(value.subarray(offset, offset+take), used); used += take; offset += take;
                if (used === CHUNK_BYTES) { await this.storage.write(installed.generation, resource.id, index++, buffer); buffer = new Uint8Array(CHUNK_BYTES); used = 0; }
              }
              this.emit({ downloaded: this.status.downloaded + value.length });
            }
          } finally { await reader.cancel().catch(() => {}); }
          if (used) await this.storage.write(installed.generation, resource.id, index, buffer.slice(0,used));
          if (received !== resource.sizeBytes || hash.digest() !== resource.sha256) throw new IntegrityError('Map integrity check failed. Retry the complete download.');
        }
        abort.signal.throwIfAborted(); await this.verify(installed); abort.signal.throwIfAborted();
        const before = await this.storage.inventory();
        await this.storage.activate(installed);
        try { await new PMTiles(this.source(installed)).getHeader(); }
        catch (error) { await this.storage.setInventory(before); throw error; }
        this.emit({ state: 'installed', active: installed, rollbackAvailable: !!before.active, updateAvailable: false });
        this.channel?.postMessage('changed');
        // Retain one rollback version; only unreferenced staging/older versions are removed.
        this.emit({ reclaimedBytes: await this.storage.clean([installed.generation, before.active?.generation].filter((v): v is string => !!v)) });
      });
    } catch (error) {
      // Never remove an activated generation if cleanup failed after the commit.
      const active = await this.storage.inventory().catch((): MapInventory => ({}));
      if (active.active?.generation !== installed.generation) await this.storage.remove(installed.generation).catch(() => {});
      let retained = active.active;
      if (retained) { try { await this.verify(retained); } catch { retained = undefined; } }
      this.emit({ state: error instanceof IntegrityError ? 'integrity-failed' : error instanceof DOMException && error.name === 'QuotaExceededError' ? 'insufficient-storage' : 'failed', active: retained, error: abort.signal.aborted ? 'Download interrupted. Retry when ready.' : String(error) });
    } finally { this.abort = undefined; }
  }
  async rollback() {
    await this.lock(async () => {
      const inventory = await this.storage.inventory();
      if (!inventory.previous) throw new Error('No retained map version is available');
      await this.verify(inventory.previous);
      await this.storage.setInventory({ active: inventory.previous, previous: inventory.active });
    }); this.channel?.postMessage('changed'); await this.check();
  }
  async delete() {
    if (this.abort) { this.cancel(); return; }
    try {
      await this.lock(async () => { await this.storage.setInventory({}); this.emit({ reclaimedBytes: await this.storage.clean([]) }); });
      this.channel?.postMessage('changed');
      this.emit({ state: 'not-downloaded', active: undefined, rollbackAvailable: false, updateAvailable: false, downloaded: 0, error: undefined });
    } catch (error) { this.emit({ state: 'failed', error: `Map deletion failed: ${String(error)}` }); }
  }
}
