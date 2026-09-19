import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OfflineMapPackage } from '../contracts.js';

export const CHUNK_BYTES = 1024 * 1024;
export interface InstalledMap { generation: string; package: OfflineMapPackage }
export interface MapInventory { active?: InstalledMap; previous?: InstalledMap; control?: { attempt?: string; persistenceRequests?: string[] } }
interface MapDatabase extends DBSchema {
  chunks: { key: [string, string, number]; value: Uint8Array };
  inventory: { key: string; value: MapInventory };
}
export interface MapStorage {
  inventory(): Promise<MapInventory>;
  activate(next: InstalledMap): Promise<void>;
  setInventory(value: MapInventory): Promise<void>;
  write(generation: string, resource: string, index: number, bytes: Uint8Array): Promise<void>;
  /** One atomic read transaction; deletion either follows it or causes a missing-byte error. */
  read(generation: string, resource: string, offset: number, length: number): Promise<Uint8Array>;
  remove(generation: string): Promise<void>;
  /** Returns payload bytes reclaimed, excluding browser database overhead. */
  clean(keep: string[]): Promise<number>;
  close(): Promise<void>;
}
/** Separate database from irreplaceable passport records. No browser globals at import time. */
export class IndexedMapStorage implements MapStorage {
  private db?: Promise<IDBPDatabase<MapDatabase>>;
  constructor(private programId: string, private packageId: string) {}
  private open() {
    return this.db ??= openDB<MapDatabase>(`passport-maps:${encodeURIComponent(this.programId)}:${encodeURIComponent(this.packageId)}`, 1, {
      upgrade(db) { db.createObjectStore('chunks'); db.createObjectStore('inventory'); },
    });
  }
  async inventory() { return await (await this.open()).get('inventory', 'installed') ?? {}; }
  async setInventory(value: MapInventory) { await (await this.open()).put('inventory', value, 'installed'); }
  async activate(next: InstalledMap) {
    const tx = (await this.open()).transaction('inventory', 'readwrite');
    const old = await tx.store.get('installed');
    await tx.store.put({ ...old, active: next, previous: old?.active }, 'installed');
    await tx.done;
  }
  async write(generation: string, resource: string, index: number, bytes: Uint8Array) {
    await (await this.open()).put('chunks', bytes, [generation, resource, index]);
  }
  async read(generation: string, resource: string, offset: number, length: number) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || length > 32 * CHUNK_BYTES) throw new Error('Invalid map read');
    const result = new Uint8Array(length);
    const tx = (await this.open()).transaction('chunks');
    let copied = 0;
    while (copied < length) {
      const position = offset + copied; const index = Math.floor(position / CHUNK_BYTES); const start = position % CHUNK_BYTES;
      const chunk = await tx.store.get([generation, resource, index]);
      if (!chunk || start >= chunk.length) throw new Error('Map bytes are missing or evicted');
      const take = Math.min(chunk.length - start, length - copied);
      result.set(chunk.subarray(start, start + take), copied); copied += take;
    }
    await tx.done; return result;
  }
  async remove(generation: string) {
    const tx = (await this.open()).transaction('chunks', 'readwrite');
    const keys = await tx.store.getAllKeys();
    await Promise.all(keys.filter(key => key[0] === generation).map(key => tx.store.delete(key)));
    await tx.done;
  }
  async clean(keep: string[]) {
    const tx = (await this.open()).transaction('chunks', 'readwrite');
    // Inspect keys only: cloning every retained MiB chunk needlessly stalls readers.
    const keys = await tx.store.getAllKeys();
    let reclaimed = 0;
    await Promise.all(keys.filter(key => !keep.includes(key[0])).map(async key => {
      const bytes = (await tx.store.get(key))?.byteLength ?? 0;
      reclaimed += bytes;
      await tx.store.delete(key);
    }));
    await tx.done;
    return reclaimed;
  }
  async close() { if (this.db) (await this.db).close(); this.db = undefined; }
}
