import type { OfflineMapPackage } from './map/contracts.js';
export interface LocationPolicy { version: string; radiusMeters: number; maxAccuracyMeters: number; maxAgeMs: number; timeoutMs: number; timeZone: string }
export interface LocationEvidence extends Coordinates {
  status: 'verified'; method: 'geolocation'; targetId: string; target: Coordinates;
  accuracyMeters: number; distanceMeters: number; capturedAt: string; checkedAt: string; policy: LocationPolicy;
}
export interface Coordinates { latitude: number; longitude: number }
export type CompletionRule = { type: 'all' } | { type: 'count'; required: number } | { type: 'percentage'; required: number };
export interface RegionDefinition { id: string; name: string; color: string; completion: CompletionRule }
export interface StampLocationDefinition {
  id: string; airportId: string; name: string; description: string;
  location?: Coordinates;
  access: 'always' | 'business-hours' | 'restricted' | 'unknown';
}
export interface AirportDefinition {
  id: string; name: string; regionId: string; location: Coordinates;
  checkInRadiusMeters?: number;
  identifiers?: { faa?: string; icao?: string; local?: string };
  address?: string;
  runways?: { id: string; name: string; lengthFeet?: number; widthFeet?: number; surface?: string; lighted?: boolean; closed?: boolean }[];
  cautions?: string[];
  sources?: { name: string; url: string; retrievedAt: string }[];
  participation: { participating: boolean };
  description: string;
  stampLocations?: StampLocationDefinition[];
}
export interface PassportProgram {
  id: string; name: string; shortName: string; description: string;
  dataNotice: string;
  checkIn?: LocationPolicy;
  branding: { accent: string; eyebrow: string; themes?: Partial<Record<'light' | 'dark', { accent: string; onAccent: string }>> };
  map: { center: Coordinates; zoom: number; package: OfflineMapPackage; markerDetailZoom?: number };
  regions: RegionDefinition[]; airports: AirportDefinition[];
}
export interface CheckIn {
  id: string; programId: string; airportId: string;
  /** ISO calendar date, with no invented visit time. */
  visitedAt: string; timeKnown: boolean;
  capturedAt?: string; timeZone?: string;
  /** An explicitly saved historical visit that does not establish a stamp date. */
  historyOnly?: true;
  createdAt: string; updatedAt: string; notes: string;
  verification: { status: 'unverified' } | LocationEvidence;
}
export interface AirportFilters { query: string; regionId: string; visited: 'all' | 'visited' | 'unvisited' }
export interface StampOrder { date: string; airportIds: string[]; confirmed: boolean }
export interface PassportBackup {
  format: 'aviation-passport'; schemaVersion: 1 | 2 | 3 | 4; orders?: StampOrder[]; programId: string;
  exportedAt: string; checkIns: CheckIn[]; attachments: never[];
}
