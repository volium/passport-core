import type { AirportFilters, CheckIn, Coordinates, PassportBackup, PassportProgram } from './models.js';

export function validateProgram(program: PassportProgram): void {
  const unique = (ids: string[], label: string) => {
    if (ids.some(id => !id.trim()) || new Set(ids).size !== ids.length) throw new Error(`Invalid or duplicate ${label} IDs`);
  };
  const coordinate = (point: Coordinates) => {
    if (!Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180) throw new Error('Invalid coordinates');
  };
  if (!program.id.trim() || !program.name.trim()) throw new Error('Program identity required');
  unique(program.regions.map(r => r.id), 'region');
  unique(program.airports.map(a => a.id), 'airport');
  unique(program.airports.flatMap(a => a.stampLocations?.map(s => s.id) ?? []), 'stamp');
  coordinate(program.map.center);
  for (const region of program.regions) {
    const rule = region.completion;
    if (!/^#[0-9a-f]{6}$/i.test(region.color)) throw new Error('Region color must be a six-digit hex value');
    if (rule.type !== 'all' && (!Number.isFinite(rule.required) || rule.required <= 0 || (rule.type === 'percentage' ? rule.required > 100 : !Number.isInteger(rule.required)))) throw new Error('Invalid completion threshold');
  }
  for (const airport of program.airports) {
    if (!program.regions.some(r => r.id === airport.regionId)) throw new Error('Unknown region');
    coordinate(airport.location);
    for (const stamp of airport.stampLocations ?? []) {
      if (stamp.airportId !== airport.id) throw new Error('Invalid stamp airport reference');
      if (stamp.location) coordinate(stamp.location);
    }
  }
}

export function calculateProgress(program: PassportProgram, visits: CheckIn[]) {
  const visitedIds = new Set(visits.filter(v => v.programId === program.id).map(v => v.airportId));
  const airports = program.airports.filter(a => a.participation.participating);
  const regions = program.regions.map(region => {
    const members = airports.filter(a => a.regionId === region.id);
    const visited = members.filter(a => visitedIds.has(a.id)).length;
    const required = region.completion.type === 'all' ? members.length : region.completion.type === 'count' ? region.completion.required : Math.ceil(members.length * region.completion.required / 100);
    return { ...region, total: members.length, visited, required, complete: members.length > 0 && visited >= required };
  });
  const visited = airports.filter(a => visitedIds.has(a.id)).length;
  return { total: airports.length, visited, percentage: airports.length ? Math.round(visited / airports.length * 100) : 0, regions };
}

export function filterAirports(program: PassportProgram, visits: CheckIn[], filters: AirportFilters) {
  const visitedIds = new Set(visits.filter(v => v.programId === program.id).map(v => v.airportId));
  return program.airports.filter(a => a.participation.participating &&
    `${a.name} ${a.id}`.toLowerCase().includes(filters.query.trim().toLowerCase()) &&
    (!filters.regionId || a.regionId === filters.regionId) &&
    (filters.visited === 'all' || visitedIds.has(a.id) === (filters.visited === 'visited')));
}

export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function validateBackup(value: unknown, program: PassportProgram): PassportBackup {
  const fail = (): never => { throw new Error('This is not a compatible passport backup. Check its program, version, and visit data.'); };
  if (!value || typeof value !== 'object') return fail();
  const backup = value as Partial<PassportBackup>;
  if (backup.format !== 'aviation-passport' || backup.schemaVersion !== 1 || backup.programId !== program.id || !Array.isArray(backup.checkIns) || backup.checkIns.length > 10000 || !Array.isArray(backup.attachments) || backup.attachments.length || typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))) return fail();
  const ids = new Set<string>();
  for (const visit of backup.checkIns) {
    if (!visit || typeof visit.id !== 'string' || !visit.id.trim() || ids.has(visit.id) || visit.programId !== program.id || !program.airports.some(a => a.id === visit.airportId) || typeof visit.visitedAt !== 'string' || !isCalendarDate(visit.visitedAt) || visit.timeKnown !== false || typeof visit.notes !== 'string' || visit.notes.length > 10000 || typeof visit.createdAt !== 'string' || !Number.isFinite(Date.parse(visit.createdAt)) || typeof visit.updatedAt !== 'string' || !Number.isFinite(Date.parse(visit.updatedAt)) || visit.verification?.status !== 'unverified') return fail();
    ids.add(visit.id);
  }
  return backup as PassportBackup;
}
