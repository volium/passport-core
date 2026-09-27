import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { PassportStore } from '../src/persistence.js';
import { collectionDates, collectionChanges, reconcileOrders, validateOrders } from '../src/collection.js';
import { validateBackup } from '../src/domain.js';
import type { CheckIn, PassportProgram } from '../src/models.js';

let serial = 0;
const program = () => `collection-${++serial}`;
const visit = (programId: string, airportId: string, visitedAt = '2026-09-10', id = airportId): CheckIn => ({ id, programId, airportId, visitedAt, timeKnown: false, createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z', notes: 'Preserve this', verification: { status: 'unverified' } });

describe('collection persistence', () => {
  it('upgrades v1 without rewriting visits or confirming legacy order', async () => {
    const id = program(), original = [visit(id, 'B'), visit(id, 'A')];
    const old = await openDB(`aviation-passport:${id}`, 1, { upgrade(db) { db.createObjectStore('checkIns', { keyPath: 'id' }); } });
    for (const v of original) await old.put('checkIns', v);
    old.close();
    const store = new PassportStore(id), state = await store.snapshot();
    expect(state.visits).toEqual(expect.arrayContaining(original));
    expect(state.orders).toEqual([]);
    const generated = reconcileOrders(state.visits, state.visits, state.orders);
    expect(generated).toEqual([{ date: '2026-09-10', airportIds: ['A', 'B'], confirmed: false }]);
    await store.close();
  });
  it('saves a complete order, preserves repeat history and order across reopen, appends new stamps', async () => {
    const id = program(), store = new PassportStore(id);
    await store.save(visit(id, 'A')); await store.save(visit(id, 'B')); await store.save(visit(id, 'C'));
    await store.saveOrder({ date: '2026-09-10', airportIds: ['C', 'A', 'B'], confirmed: true }, (await store.snapshot()).revision);
    await store.save(visit(id, 'A', '2026-09-12', 'repeat'));
    expect((await store.snapshot()).orders[0]).toEqual({ date: '2026-09-10', airportIds: ['C', 'A', 'B'], confirmed: true });
    await store.close(); const reopened = new PassportStore(id);
    await reopened.save(visit(id, 'D'));
    expect((await reopened.snapshot()).orders[0]).toEqual({ date: '2026-09-10', airportIds: ['C', 'A', 'B', 'D'], confirmed: false });
    expect(await reopened.list()).toHaveLength(5); await reopened.close();
  });
  it('moves earliest visits atomically and reconciles earliest/last deletion and tied dates', async () => {
    const id = program(), store = new PassportStore(id);
    await store.save(visit(id, 'A')); await store.save(visit(id, 'B'));
    await store.save(visit(id, 'A', '2026-09-10', 'tie'));
    await store.delete('A'); expect(collectionDates(await store.list()).get('A')).toBe('2026-09-10');
    await store.save(visit(id, 'A', '2026-09-08', 'early'));
    expect((await store.snapshot()).orders.map(o => [o.date, o.airportIds])).toEqual([['2026-09-08', ['A']], ['2026-09-10', ['B']]]);
    await store.delete('early'); expect((await store.snapshot()).orders[0].airportIds).toEqual(['B', 'A']);
    await store.delete('tie'); expect((await store.snapshot()).orders[0].airportIds).toEqual(['B']);
    await store.close();
  });
  it('rejects stale drafts, cross-date and duplicate orders without partial changes', async () => {
    const id = program(), store = new PassportStore(id), other = new PassportStore(id);
    await store.save(visit(id, 'A')); const old = await store.snapshot();
    await other.save(visit(id, 'B', '2026-09-11'));
    await expect(store.saveOrder({ date: '2026-09-10', airportIds: ['A'], confirmed: true }, old.revision)).rejects.toThrow('another operation');
    await expect(store.save(visit(id, 'C'), old.revision)).rejects.toThrow('another operation');
    const state = await store.snapshot();
    for (const ids of [['A', 'A'], ['A', 'B']]) await expect(store.saveOrder({ date: '2026-09-10', airportIds: ids, confirmed: true }, state.revision)).rejects.toThrow();
    await expect(store.save(visit('wrong-program', 'D'))).rejects.toThrow('Wrong program');
    expect(await store.snapshot()).toEqual(state);
    await store.close(); await other.close();
  });
  it('round-trips v2 order and keeps confirmed local order when importing conflicting or old backups', async () => {
    const id = program(), store = new PassportStore(id);
    const visits = [visit(id, 'A'), visit(id, 'B'), visit(id, 'C')];
    const orders = [{ date: '2026-09-10', airportIds: ['C', 'B', 'A'], confirmed: true }];
    expect(await store.merge(visits, orders)).toBe(3);
    expect((await store.snapshot()).orders).toEqual(orders);
    expect(await store.merge(visits, [{ ...orders[0], airportIds: ['A', 'B', 'C'] }])).toBe(0);
    expect((await store.snapshot()).orders).toEqual(orders);
    await store.merge(visits); expect((await store.snapshot()).orders).toEqual(orders);
    expect((await store.list()).every(v => v.notes === 'Preserve this')).toBe(true);
    await store.close();
  });
  it('validates versioned backups including retained airports and rejects malformed membership', () => {
    const id = program(), visits = [visit(id, 'A')];
    const p = { id, airports: [] } as unknown as PassportProgram;
    const backup = { format: 'aviation-passport', schemaVersion: 2, programId: id, exportedAt: '2026-09-15T00:00:00Z', checkIns: visits, attachments: [], orders: [{ date: '2026-09-10', airportIds: ['A'], confirmed: false }] };
    expect(validateBackup(backup, p).orders).toEqual(backup.orders);
    for (const orders of [undefined, [], [{ ...backup.orders[0], date: '2026-09-11' }], [{ ...backup.orders[0], airportIds: ['A', 'A'] }]]) expect(() => validateBackup({ ...backup, orders }, p)).toThrow();
    expect(validateOrders(backup.orders, visits)).toBe(true);
    expect(collectionChanges(visits, [visit(id, 'A', '2026-09-09')])).toEqual(['A: stamp moves from 2026-09-10 to 2026-09-09.']);
  });
});

it('reports a blocked v1 upgrade without deleting visits', async () => {
  const id = program();
  const old = await openDB('aviation-passport:' + id, 1, { upgrade(db) { db.createObjectStore('checkIns', { keyPath: 'id' }); } });
  await old.put('checkIns', visit(id, 'A'));
  const upgrading = new PassportStore(id);
  await expect(upgrading.snapshot()).rejects.toThrow('Close other tabs');
  expect(await old.getAll('checkIns')).toEqual([visit(id, 'A')]);
  old.close();
  // The pending native upgrade closes itself once the blocking connection closes.
  const reopened = new PassportStore(id);
  expect(await reopened.list()).toEqual([visit(id, 'A')]);
  await reopened.close();
});
