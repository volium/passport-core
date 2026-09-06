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
  branding: { accent: string; eyebrow: string };
  map: { center: Coordinates; zoom: number; tileUrl: string; attribution: string; markerDetailZoom?: number };
  regions: RegionDefinition[]; airports: AirportDefinition[];
}
export interface CheckIn {
  id: string; programId: string; airportId: string;
  /** ISO calendar date, with no invented visit time. */
  visitedAt: string; timeKnown: false;
  createdAt: string; updatedAt: string; notes: string;
  verification: { status: 'unverified' };
}
export interface AirportFilters { query: string; regionId: string; visited: 'all' | 'visited' | 'unvisited' }
export interface PassportBackup {
  format: 'aviation-passport'; schemaVersion: 1; programId: string;
  exportedAt: string; checkIns: CheckIn[]; attachments: never[];
}
