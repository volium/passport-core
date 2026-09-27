import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { PassportStore } from '../src/persistence.js';
import { collectionSequence, collectionDates, collectionChanges, reconcileOrders, validateOrders, visitStampLabel } from '../src/collection.js';
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


it('preserves visit-only history and confirmed stamp order through reload and v3 restore', async () => {
  const id = program(), store = new PassportStore(id);
  const a = visit(id, 'A'), b = visit(id, 'B'), early: CheckIn = { ...visit(id, 'A', '2026-09-08', 'history'), historyOnly: true };
  await store.save(a); await store.save(b);
  const orders = [{ date: '2026-09-10', airportIds: ['B', 'A'], confirmed: true }];
  await store.saveOrder(orders[0], (await store.snapshot()).revision);
  await store.save(early); await store.close();
  const reopened = new PassportStore(id), state = await reopened.snapshot();
  expect(collectionDates(state.visits).get('A')).toBe('2026-09-10'); expect(state.orders).toEqual(orders);
  const backup = { format: 'aviation-passport', schemaVersion: 3, programId: id, exportedAt: '2026-09-15T00:00:00Z', checkIns: state.visits, attachments: [], orders };
  const parsed = validateBackup(backup, { id, airports: [] } as unknown as PassportProgram);
  const restored = new PassportStore(id + '-restore');
  await restored.merge(parsed.checkIns.map(v => ({ ...v, programId: id + '-restore' })), parsed.orders);
  expect(collectionDates(await restored.list()).get('A')).toBe('2026-09-10'); expect((await restored.snapshot()).orders).toEqual(orders);
  for (const value of [false, 'true']) expect(() => validateBackup({ ...backup, checkIns: [a, b, { ...early, historyOnly: value }] }, { id } as PassportProgram)).toThrow();
  expect(() => validateBackup({ ...backup, schemaVersion: 2 }, { id } as PassportProgram)).toThrow();
  await reopened.delete(a.id);
  expect(collectionDates(await reopened.list()).has('A')).toBe(false);
  expect(await reopened.list()).toContainEqual(early);
  expect((await reopened.snapshot()).orders).toEqual([{ ...orders[0], airportIds: ['B'] }]);
  await reopened.close(); await restored.close();
});

it('upgrades v2 without changing existing visits, saved order or revision', async () => {
  const id = program(), original = visit(id, 'A'), order = { date: '2026-09-10', airportIds: ['A'], confirmed: true };
  const old = await openDB('aviation-passport:' + id, 2, { upgrade(db) { db.createObjectStore('checkIns', { keyPath: 'id' }); db.createObjectStore('orders', { keyPath: 'date' }); db.createObjectStore('meta'); } });
  await old.put('checkIns', original); await old.put('orders', order); await old.put('meta', 7, 'revision'); old.close();
  const store = new PassportStore(id);
  expect(await store.snapshot()).toEqual({ visits: [original], orders: [order], revision: 7 }); await store.close();
});


it('history labels follow the current stamp date without rewriting visit eligibility', () => {
  const original = visit('test', 'A'), earlier = visit('test', 'A', '2026-09-08', 'early');
  expect(visitStampLabel(original, '2026-09-10')).toBe('Stamp collection date');
  expect(visitStampLabel(original, '2026-09-08')).toBe('Repeat visit');
  expect(visitStampLabel(earlier, '2026-09-08')).toBe('Stamp collection date');
  expect(visitStampLabel({ ...original, historyOnly: true }, '2026-09-10')).toBe('Visit only - excluded from stamp collection');
  expect(visitStampLabel(original, undefined)).toBe('Repeat visit');
  expect(original.historyOnly).toBeUndefined();
});


describe('collection numbers', () => {
  it('renumbers after earlier stamps, date edits, deletion, and reorder without counting repeat/history-only visits', async () => {
    const id = program(), store = new PassportStore(id);
    const positions = async () => { const s = await store.snapshot(); return collectionSequence(s.visits, s.orders).map(v => [v.airportId, v.number]); };
    await store.save(visit(id, 'A')); await store.save(visit(id, 'B'));
    await store.saveOrder({ date: '2026-09-10', airportIds: ['B', 'A'], confirmed: true }, (await store.snapshot()).revision);
    expect(await positions()).toEqual([['B', 1], ['A', 2]]);
    await store.save(visit(id, 'C', '2026-09-09'));
    expect(await positions()).toEqual([['C', 1], ['B', 2], ['A', 3]]);
    await store.save(visit(id, 'A', '2026-09-12', 'repeat'));
    await store.save({ ...visit(id, 'D', '2026-09-08'), historyOnly: true });
    expect(await positions()).toEqual([['C', 1], ['B', 2], ['A', 3]]);
    await store.save(visit(id, 'C', '2026-09-11'));
    expect(await positions()).toEqual([['B', 1], ['A', 2], ['C', 3]]);
    await store.delete('B');
    expect(await positions()).toEqual([['A', 1], ['C', 2]]);
    await store.close(); const reopened = new PassportStore(id), state = await reopened.snapshot();
    expect(collectionSequence(state.visits, state.orders).map(v => [v.airportId, v.number])).toEqual([['A', 1], ['C', 2]]);
    await reopened.close();
  });
  it('marks legacy same-day order provisional without inventing visit times', () => {
    const visits = [visit('p', 'B'), visit('p', 'A'), visit('p', 'C', '2026-09-11')];
    expect(collectionSequence(visits, []).map(v => [v.airportId, v.number, v.provisional])).toEqual([['A', 1, true], ['B', 2, true], ['C', 3, false]]);
  });
});
