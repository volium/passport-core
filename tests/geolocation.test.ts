import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { calendarDate, distanceMeters, evaluateLocation, usableFix, validVisitTiming } from '../src/geolocation.js';
import { validateBackup } from '../src/domain.js';
import { PassportStore } from '../src/persistence.js';
import { reconcileOrders } from '../src/collection.js';
import type { AirportDefinition, CheckIn, LocationPolicy, PassportProgram } from '../src/models.js';
const policy: LocationPolicy = { version:'test',radiusMeters:2414.016,maxAccuracyMeters:200,maxAgeMs:30000,timeoutMs:30000,timeZone:'America/Los_Angeles' };
const airport: AirportDefinition = {id:'A',name:'A',regionId:'r',description:'',location:{latitude:47,longitude:-120},participation:{participating:true}};
const now = Date.parse('2026-09-28T00:15:00Z');
const fix = {latitude:47,longitude:-120,accuracyMeters:25,timestamp:now};
const visit = (): CheckIn => ({id:'v',programId:'gps-test',airportId:'A',visitedAt:'2026-09-27',timeKnown:true,capturedAt:new Date(now).toISOString(),timeZone:policy.timeZone,notes:'',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),verification:evaluateLocation(airport,fix,policy,now)!});
describe('location evidence', () => {
  it('handles radius, uncertainty, per-airport overrides, and retirement', () => {
    expect(distanceMeters(fix,fix)).toBe(0);
    expect(evaluateLocation(airport,fix,policy,now)?.status).toBe('verified');
    expect(evaluateLocation({...airport,checkInRadiusMeters:10},fix,policy,now)).toBeUndefined();
    expect(evaluateLocation({...airport,participation:{participating:false}},fix,policy,now)).toBeUndefined();
    expect(evaluateLocation(airport,{...fix,latitude:48},policy,now)).toBeUndefined();
    const boundary = {...fix,latitude:47.02};
    expect(evaluateLocation(airport,boundary,{...policy,radiusMeters:distanceMeters(airport.location,boundary)+20},now)).toBeUndefined();
  });
  it('rejects stale, future, invalid and inaccurate readings', () => {
    for (const bad of [{...fix,timestamp:now-30001},{...fix,timestamp:now+1},{...fix,accuracyMeters:201},{...fix,accuracyMeters:NaN},{...fix,latitude:91}]) expect(usableFix(bad,policy,now)).toBe(false);
  });
  it('groups timestamps using program timezone across midnight and DST', () => {
    expect(calendarDate(now,policy.timeZone)).toBe('2026-09-27');
    expect(calendarDate(Date.parse('2026-11-01T09:30:00Z'),policy.timeZone)).toBe('2026-11-01');
  });
  it('validates portable evidence and rejects mismatched dates, targets and distances', () => {
    const v=visit(); expect(validVisitTiming(v)).toBe(true);
    expect(validVisitTiming({...v,visitedAt:'2026-09-28'})).toBe(false);
    expect(validVisitTiming({...v,airportId:'B'})).toBe(false);
    expect(validVisitTiming({...v,timeKnown:false})).toBe(false);
    const e=v.verification; if(e.status!=='verified') throw Error('fixture');
    expect(validVisitTiming({...v,verification:{...e,distanceMeters:1000}})).toBe(false);
    const backup={format:'aviation-passport',schemaVersion:4,programId:v.programId,exportedAt:v.createdAt,checkIns:[v],attachments:[],orders:[{date:v.visitedAt,airportIds:['A'],confirmed:false}]};
    const program={id:v.programId,airports:[]} as unknown as PassportProgram;
    expect(validateBackup(backup,program).checkIns[0]).toEqual(v);
    expect(()=>validateBackup({...backup,schemaVersion:3},program)).toThrow();
  });
  it('uses timed default order but preserves explicit sequence and manual dates', () => {
    const a=visit(), b={...visit(),id:'b',airportId:'B',capturedAt:'2026-09-27T23:15:00.000Z'};
    expect(reconcileOrders([], [a,b],[])[0].airportIds).toEqual(['B','A']);
    expect(reconcileOrders([a,b],[a,b],[{date:a.visitedAt,airportIds:['A','B'],confirmed:true}])[0].airportIds).toEqual(['A','B']);
    expect(reconcileOrders([a,b],[a,b],[{date:a.visitedAt,airportIds:['A','B'],confirmed:false}])[0].airportIds).toEqual(['A','B']);
    expect(reconcileOrders([a,b],[a,{...b,timeKnown:false,capturedAt:undefined}], [{date:a.visitedAt,airportIds:['A','B'],confirmed:false}])[0].airportIds).toEqual(['A','B']);
  });
  it('upgrades v3 without changing old records and preserves evidence through save/reopen/merge', async () => {
    const id='gps-migration', db=await openDB('aviation-passport:'+id,3,{upgrade(db){db.createObjectStore('checkIns',{keyPath:'id'});db.createObjectStore('orders',{keyPath:'date'});db.createObjectStore('meta');}});
    const old={...visit(),id:'old',programId:id,timeKnown:false,capturedAt:undefined,timeZone:undefined,verification:{status:'unverified' as const}};
    await db.put('checkIns',old); db.close();
    const store=new PassportStore(id); expect((await store.list())[0]).toEqual(old);
    const gps={...visit(),programId:id}; await store.save(gps); await store.close();
    const reopened=new PassportStore(id); expect(await reopened.list()).toContainEqual(gps);
    expect(await reopened.merge([gps])).toBe(0); await reopened.close();
  });
});
