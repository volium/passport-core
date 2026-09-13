export interface Bounds { west: number; south: number; east: number; north: number }
export interface MapResource {
  id: string; url: string; kind: 'style' | 'sprite' | 'glyph' | 'font' | 'license' | 'other';
  sizeBytes: number; sha256: string;
}
export interface OfflineMapPackage {
  id: string; name: string; url: string; version: string; sizeBytes: number; sha256: string;
  bounds: Bounds; minZoom?: number; maxNativeZoom: number; attribution: string;
  sourceBuild: string; basemapSchemaVersion: string;
  licenses: { name: string; url: string; resourceId: string }[];
  resources: MapResource[];
  lightStyleResourceId: string; darkStyleResourceId: string;
}
export function validateMapPackage(p: OfflineMapPackage): void {
  const fail = () => { throw new Error('Invalid offline map package configuration'); };
  const id = (s: string) => typeof s === 'string' && /^[a-zA-Z0-9._-]+$/.test(s);
  const url = (s: string) => { try { if (typeof s !== 'string' || !s.trim()) return false; const u = new URL(s, 'https://program.invalid/'); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && !u.hash && !/[{}]/.test(s); } catch { return false; } };
  const hash = (s: string) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
  if (!p || !id(p.id) || !id(p.version) || !p.name?.trim() || !p.attribution?.trim() || !p.sourceBuild?.trim() || p.basemapSchemaVersion !== '4') fail();
  if (!url(p.url) || !hash(p.sha256) || !Number.isSafeInteger(p.sizeBytes) || p.sizeBytes < 127) fail();
  const b = p.bounds;
  if (!b || ![b.west,b.south,b.east,b.north].every(Number.isFinite) || b.west < -180 || b.east > 180 || b.south < -90 || b.north > 90 || b.west >= b.east || b.south >= b.north) fail();
  if (!Number.isInteger(p.minZoom ?? 0) || !Number.isInteger(p.maxNativeZoom) || (p.minZoom ?? 0) < 0 || p.maxNativeZoom > 24 || (p.minZoom ?? 0) > p.maxNativeZoom) fail();
  if (!Array.isArray(p.resources) || !Array.isArray(p.licenses) || !p.licenses.length) fail();
  const ids = new Set<string>(['archive']); const urls = new Set<string>([p.url]);
  for (const r of p.resources) {
    if (!id(r.id) || ids.has(r.id) || urls.has(r.url) || !url(r.url) || !hash(r.sha256) || !Number.isSafeInteger(r.sizeBytes) || r.sizeBytes < 0 || r.sizeBytes > 32*1024*1024 || !['style','sprite','glyph','font','license','other'].includes(r.kind)) fail();
    ids.add(r.id); urls.add(r.url);
  }
  for (const style of [p.lightStyleResourceId, p.darkStyleResourceId]) if (!p.resources.some(r => r.id === style && r.kind === 'style')) fail();
  for (const license of p.licenses) if (!license.name?.trim() || !url(license.url) || !p.resources.some(r => r.id === license.resourceId && r.kind === 'license')) fail();
}
export const packageBytes = (p: OfflineMapPackage): number => p.sizeBytes + p.resources.reduce((sum, r) => sum + r.sizeBytes, 0);
