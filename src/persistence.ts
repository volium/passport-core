import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CheckIn } from './models.js';

interface PassportDatabase extends DBSchema { checkIns: { key: string; value: CheckIn } }
export class PassportStore {
  private database: Promise<IDBPDatabase<PassportDatabase>>;
  constructor(private programId: string) {
    this.database = openDB<PassportDatabase>(`aviation-passport:${programId}`, 1, {
      upgrade(db) { db.createObjectStore('checkIns', { keyPath: 'id' }); },
    });
  }
  async list(): Promise<CheckIn[]> { return (await (await this.database).getAll('checkIns')).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt) || b.createdAt.localeCompare(a.createdAt)); }
  async save(visit: CheckIn): Promise<void> {
    if (visit.programId !== this.programId) throw new Error('Wrong program');
    await (await this.database).put('checkIns', visit);
  }
  async delete(id: string): Promise<void> { await (await this.database).delete('checkIns', id); }
  /** Atomic, add-only restore: existing IDs are preserved, never overwritten. */
  async merge(visits: CheckIn[]): Promise<number> {
    if (visits.some(v => v.programId !== this.programId)) throw new Error('Wrong program');
    const tx = (await this.database).transaction('checkIns', 'readwrite');
    let added = 0;
    for (const visit of visits) {
      if (!(await tx.store.get(visit.id))) { await tx.store.add(visit); added++; }
    }
    await tx.done;
    return added;
  }
  async close(): Promise<void> { (await this.database).close(); }
}
