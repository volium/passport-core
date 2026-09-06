import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { calculateProgress, filterAirports, validateBackup, validateProgram } from '../src/domain.js';
import { PassportStore } from '../src/persistence.js';
import type { CheckIn, PassportProgram } from '../src/models.js';

const program: PassportProgram = {
  id: 'test-program', name: 'Test program', shortName: 'Test', description: '', dataNotice: '', branding: { accent: '#123456', eyebrow: '' },
  map: { center: { latitude: 45, longitude: -120 }, zoom: 7, tileUrl: '', attribution: '' },
  regions: [
    { id: 'a', name: 'Region A', color: '#123456', completion: { type: 'all' } },
    { id: 'b', name: 'Region B', color: '#654321', completion: { type: 'count', required: 1 } },
    { id: 'c', name: 'Region C', color: '#654321', completion: { type: 'percentage', required: 50 } },
    { id: 'empty', name: 'Empty', color: '#654321', completion: { type: 'all' } },
  ],
  airports: ['a', 'a', 'b', 'b', 'c', 'c'].map((regionId, index) => ({ id: `A${index}`, name: `Airport ${index}`, regionId, location: { latitude: 45, longitude: -120 }, description: '', participation: { participating: true } })),
};
const visit = (airportId: string, id = airportId): CheckIn => ({ id, programId: program.id, airportId, visitedAt: '2026-08-10', timeKnown: false, createdAt: '2026-08-11T12:00:00Z', updatedAt: '2026-08-11T12:00:00Z', notes: '', verification: { status: 'unverified' } });

describe('program-independent progress and filtering', () => {
  it('validates selectable map styles while keeping legacy map configurations compatible', () => {
    expect(() => validateProgram(program)).not.toThrow();
    const configured = structuredClone(program);
    configured.map.styles = [{ id: 'streets', name: 'Streets', tileUrl: 'https://example.com/{z}/{x}/{y}.png', darkTileUrl: 'https://example.com/dark/{z}/{x}/{y}.png', attribution: 'Example' }];
    expect(() => validateProgram(configured)).not.toThrow();
    for (const mutate of [
      (p: PassportProgram) => { p.map.styles = []; },
      (p: PassportProgram) => { p.map.styles!.push({ ...p.map.styles![0] }); },
      (p: PassportProgram) => { p.map.styles![0].id = ' '; },
      (p: PassportProgram) => { p.map.styles![0].name = ''; },
      (p: PassportProgram) => { p.map.styles![0].attribution = ''; },
      (p: PassportProgram) => { p.map.styles![0].tileUrl = 'javascript:alert(1)'; },
      (p: PassportProgram) => { p.map.styles![0].darkTileUrl = 'https://example.com/missing-coordinates'; },
    ]) { const invalid = structuredClone(configured); mutate(invalid); expect(() => validateProgram(invalid)).toThrow(); }
  });
  it('counts unique participating airports, isolates programs, and supports three completion rules', () => {
    const result = calculateProgress(program, [visit('A0'), visit('A0', 'repeat'), visit('A2'), visit('A4'), visit('unknown'), { ...visit('A1'), programId: 'other' }]);
    expect(result.visited).toBe(3);
    expect(result.percentage).toBe(50);
    expect(result.regions.map(r => r.complete)).toEqual([false, true, true, false]);
    const withdrawn = structuredClone(program); withdrawn.airports[0].participation.participating = false;
    expect(calculateProgress(withdrawn, [visit('A0')]).visited).toBe(0);
  });
  it('combines search, region, and visit filters', () => {
    expect(filterAirports(program, [visit('A0')], { query: ' AIRPORT ', regionId: 'a', visited: 'unvisited' }).map(a => a.id)).toEqual(['A1']);
  });
  it('searches airport aliases and validates optional reference data', () => {
    const enriched=structuredClone(program);
    enriched.airports[0].identifiers={faa:'XYZ',icao:'KXYZ'};
    enriched.airports[0].runways=[{id:'r',name:'01 / 19',lengthFeet:2500}];
    enriched.airports[0].sources=[{name:'Source',url:'https://example.com/data',retrievedAt:'2026-09-06'}];
    expect(filterAirports(enriched,[],{query:'xyz',regionId:'',visited:'all'}).map(a=>a.id)).toEqual(['A0']);
    expect(()=>validateProgram(enriched)).not.toThrow();
    enriched.airports[0].runways[0].lengthFeet=-1;
    expect(()=>validateProgram(enriched)).toThrow('Invalid runway dimension');
    enriched.airports[0].runways[0].lengthFeet=2500;
    enriched.airports[0].sources[0].url='javascript:alert(1)';
    expect(()=>validateProgram(enriched)).toThrow('Invalid source reference');
  });
  it('rejects malformed program relationships, coordinates, and thresholds', () => {
    expect(() => validateProgram(program)).not.toThrow();
    for (const mutate of [
      (p: PassportProgram) => { p.airports[0].regionId = 'missing'; },
      (p: PassportProgram) => { p.airports[0].location.latitude = 91; },
      (p: PassportProgram) => { p.airports[1].id = p.airports[0].id; },
      (p: PassportProgram) => { p.regions[0].completion = { type: 'percentage', required: 101 }; },
      (p: PassportProgram) => { p.airports[0].stampLocations = [{ id: 's', airportId: 'wrong', name: '', description: '', access: 'unknown' }]; },
    ]) { const invalid = structuredClone(program); mutate(invalid); expect(() => validateProgram(invalid)).toThrow(); }
  });
});

describe('backup validation', () => {
  const backup = () => ({ format: 'aviation-passport', schemaVersion: 1, programId: program.id, exportedAt: '2026-08-12T12:00:00Z', checkIns: [visit('A0')], attachments: [] });
  it('accepts date-only visits and rejects invalid or incompatible records before writes', () => {
    expect(validateBackup(backup(), program).checkIns).toHaveLength(1);
    for (const invalid of [null, {}, { ...backup(), programId: 'other' }, { ...backup(), schemaVersion: 2 }, { ...backup(), checkIns: [visit('unknown')] }, { ...backup(), checkIns: [{ ...visit('A0'), visitedAt: '2026-02-30' }] }, { ...backup(), checkIns: [visit('A0'), visit('A0')] }, { ...backup(), attachments: ['photo'] }]) expect(() => validateBackup(invalid, program)).toThrow();
  });
});

describe('IndexedDB integration', () => {
  it('persists across reopen, updates, merges without overwrites, deletes, and isolates programs', async () => {
    const store = new PassportStore(program.id);
    await store.save(visit('A0'));
    await store.close();
    const reopened = new PassportStore(program.id);
    expect(await reopened.list()).toEqual([visit('A0')]);
    await reopened.save({ ...visit('A0'), notes: 'updated' });
    expect(await reopened.merge([visit('A0'), visit('A1')])).toBe(1);
    expect((await reopened.list()).find(v => v.id === 'A0')?.notes).toBe('updated');
    await expect(reopened.merge([{ ...visit('A2'), programId: 'wrong' }])).rejects.toThrow();
    expect(await reopened.list()).toHaveLength(2);
    const other = new PassportStore('other'); expect(await other.list()).toEqual([]);
    await reopened.delete('A0'); expect(await reopened.list()).toEqual([visit('A1')]);
    await reopened.close(); await other.close();
  });
});
