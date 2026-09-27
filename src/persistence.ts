import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CheckIn, StampOrder } from './models.js';
import { reconcileOrders, validateOrders } from './collection.js';

export interface PassportSnapshot { visits: CheckIn[]; orders: StampOrder[]; revision: number }
interface PassportDatabase extends DBSchema {
  checkIns: { key: string; value: CheckIn };
  orders: { key: string; value: StampOrder };
  meta: { key: string; value: number };
}
export class PassportStore {
  private database: Promise<IDBPDatabase<PassportDatabase>>;
  constructor(private programId: string) {
    this.database = new Promise((resolve, reject) => {
      let blocked = false;
      void openDB<PassportDatabase>(`aviation-passport:${programId}`, 3, {
        upgrade(db, oldVersion) {
          // v3 adds visit-only semantics; the version boundary protects against older writers.
          if (oldVersion < 1) db.createObjectStore('checkIns', { keyPath: 'id' });
          if (oldVersion < 2) { db.createObjectStore('orders', { keyPath: 'date' }); db.createObjectStore('meta'); }
        },
        blocked: () => { blocked = true; reject(new Error('Close other tabs running an older passport version, then reload to upgrade passport storage. Your visits have not been deleted.')); },
        blocking: () => { void this.close(); },
      }).then(db => { if (blocked) db.close(); else resolve(db); }, reject);
    });
    // Mount handles the error after the independent map renderer initializes.
    void this.database.catch(() => {});
  }
  async snapshot(): Promise<PassportSnapshot> {
    const tx = (await this.database).transaction(['checkIns', 'orders', 'meta']);
    const [visits, orders, revision] = await Promise.all([tx.objectStore('checkIns').getAll(), tx.objectStore('orders').getAll(), tx.objectStore('meta').get('revision')]);
    await tx.done;
    return { visits: visits.sort((a, b) => b.visitedAt.localeCompare(a.visitedAt) || b.createdAt.localeCompare(a.createdAt)), orders, revision: revision ?? 0 };
  }
  async list(): Promise<CheckIn[]> { return (await this.snapshot()).visits; }
  private async change(expected: number | undefined, apply: (state: PassportSnapshot) => void): Promise<void> {
    const tx = (await this.database).transaction(['checkIns', 'orders', 'meta'], 'readwrite');
    try {
      const visits = await tx.objectStore('checkIns').getAll();
      const orders = await tx.objectStore('orders').getAll();
      const revision = (await tx.objectStore('meta').get('revision')) ?? 0;
      if (expected !== undefined && revision !== expected) throw new Error('Your passport changed in another operation or tab. Your draft is kept. Cancel and reopen it to review the latest visits before saving.');
      const state = { visits: [...visits], orders, revision };
      apply(state);
      if (state.visits.some(v => v.programId !== this.programId)) throw new Error('Wrong program');
      // Reconciliation and visits share one transaction, including deletion and imports.
      const reconciled = state.orders === orders ? reconcileOrders(visits, state.visits, orders) : state.orders;
      if (!validateOrders(reconciled, state.visits)) throw new Error('Invalid collection order');
      await tx.objectStore('checkIns').clear();
      for (const visit of state.visits) await tx.objectStore('checkIns').put(visit);
      await tx.objectStore('orders').clear();
      for (const order of reconciled) await tx.objectStore('orders').put(order);
      await tx.objectStore('meta').put(revision + 1, 'revision');
      await tx.done;
    } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await tx.done.catch(() => {}); throw error; }
  }
  async save(visit: CheckIn, expected?: number): Promise<void> {
    await this.change(expected, s => { s.visits = [...s.visits.filter(v => v.id !== visit.id), visit]; });
  }
  async delete(id: string, expected?: number): Promise<void> {
    await this.change(expected, s => { s.visits = s.visits.filter(v => v.id !== id); });
  }
  async saveOrder(order: StampOrder, expected: number): Promise<void> {
    await this.change(expected, s => {
      const next = reconcileOrders(s.visits, s.visits, s.orders).filter(o => o.date !== order.date);
      next.push(order);
      if (!validateOrders(next, s.visits)) throw new Error('The order no longer matches the visits on this date. Cancel and review the group.');
      s.orders = next;
    });
  }
  /** Add-only visits; existing confirmed local order wins over imported order. */
  async merge(visits: CheckIn[], incoming: StampOrder[] = [], expected?: number): Promise<number> {
    let added = 0;
    await this.change(expected, s => {
      if (visits.some(v => v.programId !== this.programId)) throw new Error('Wrong program');
      const before = [...s.visits];
      const ids = new Set(before.map(v => v.id));
      for (const visit of visits) if (!ids.has(visit.id)) { s.visits.push(visit); ids.add(visit.id); added++; }
      const reconciled = reconcileOrders(before, s.visits, s.orders);
      for (const order of incoming) {
        const target = reconciled.find(o => o.date === order.date);
        if (!target || s.orders.some(o => o.date === order.date && o.confirmed)) continue;
        const imported = order.airportIds.filter(id => target.airportIds.includes(id));
        target.airportIds = [...imported, ...target.airportIds.filter(id => !imported.includes(id))];
        target.confirmed = order.confirmed && imported.length === target.airportIds.length;
      }
      // The post-merge order is already reconciled, including newly imported members.
      s.orders = reconciled;
    });
    return added;
  }
  async close(): Promise<void> { (await this.database).close(); }
}
