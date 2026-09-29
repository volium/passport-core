import type { AirportDefinition, CheckIn, Coordinates, LocationPolicy, LocationEvidence } from './models.js';

export interface LocationFix extends Coordinates { accuracyMeters: number; timestamp: number }
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180, lat = (b.latitude - a.latitude) * rad, lon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(lon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function calendarDate(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const coordinate = (p: Coordinates) => !!p && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
export function validLocationPolicy(p: LocationPolicy): boolean {
  try {
    return !!p && typeof p.version === 'string' && p.version.length > 0 && p.version.length <= 200 &&
      typeof p.timeZone === 'string' && !!calendarDate(0, p.timeZone) &&
      positive(p.radiusMeters) && positive(p.maxAccuracyMeters) && positive(p.maxAgeMs) && positive(p.timeoutMs);
  } catch { return false; }
}
export function usableFix(fix: LocationFix, policy: LocationPolicy, now = Date.now()): boolean {
  return coordinate(fix) && Number.isFinite(fix.accuracyMeters) && fix.accuracyMeters >= 0 && fix.accuracyMeters <= policy.maxAccuracyMeters &&
    Number.isFinite(fix.timestamp) && fix.timestamp <= now && now - fix.timestamp <= policy.maxAgeMs;
}
export function evaluateLocation(airport: AirportDefinition, fix: LocationFix, policy: LocationPolicy, now = Date.now()): LocationEvidence | undefined {
  const radius = airport.checkInRadiusMeters ?? policy.radiusMeters;
  const distance = distanceMeters(fix, airport.location);
  if (!airport.participation.participating || !usableFix(fix, policy, now) || distance + fix.accuracyMeters > radius) return;
  return { status: 'verified', method: 'geolocation', targetId: airport.id, target: { ...airport.location },
    latitude: fix.latitude, longitude: fix.longitude, accuracyMeters: fix.accuracyMeters,
    capturedAt: new Date(fix.timestamp).toISOString(), checkedAt: new Date(now).toISOString(), distanceMeters: distance,
    policy: { ...policy, radiusMeters: radius } };
}
/** Validate against the saved policy/target, not today's mutable program data. Not authentication. */
export function validVisitTiming(v: CheckIn): boolean {
  if (v.timeKnown === false) return v.capturedAt === undefined && v.timeZone === undefined && v.verification?.status === 'unverified';
  if (v.timeKnown !== true || typeof v.capturedAt !== 'string' || typeof v.timeZone !== 'string') return false;
  const e = v.verification;
  if (!e || e.status !== 'verified' || e.method !== 'geolocation' || e.targetId !== v.airportId || !coordinate(e.target) || !validLocationPolicy(e.policy)) return false;
  if (e.capturedAt !== v.capturedAt || e.policy.timeZone !== v.timeZone || typeof e.checkedAt !== 'string') return false;
  const captured = Date.parse(e.capturedAt), checked = Date.parse(e.checkedAt);
  if (!Number.isFinite(captured) || !Number.isFinite(checked) || !usableFix({ ...e, timestamp: captured }, e.policy, checked)) return false;
  return calendarDate(captured, v.timeZone) === v.visitedAt && Number.isFinite(e.distanceMeters) &&
    Math.abs(distanceMeters(e, e.target) - e.distanceMeters) < 0.1 && e.distanceMeters + e.accuracyMeters <= e.policy.radiusMeters;
}
export function visitLocationLabel(v: CheckIn): string {
  return v.timeKnown && v.capturedAt && v.timeZone ? `Location confirmed nearby - ${new Intl.DateTimeFormat(undefined, { timeZone:v.timeZone, hour:'numeric', minute:'2-digit', timeZoneName:'short' }).format(new Date(v.capturedAt))}` : 'Unverified';
}

/** Short foreground acquisition only. Cancellation also ignores late browser callbacks. */
export function acquireLocation(policy: LocationPolicy, signal: AbortSignal, onAccuracy: (meters: number) => void): Promise<LocationFix> {
  return new Promise((resolve, reject) => {
    if (!globalThis.isSecureContext || !navigator.geolocation) { reject(new Error('Location needs a secure HTTPS connection and a browser with location support. You can still save a manual visit.')); return; }
    let watch: number | undefined, finished = false;
    const stop = () => { if (watch !== undefined) navigator.geolocation.clearWatch(watch); clearTimeout(timer); signal.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', hidden); };
    const fail = (message: string) => { if (finished) return; finished = true; stop(); reject(new Error(message)); };
    const abort = () => fail('Location request cancelled.');
    const hidden = () => { if (document.hidden) fail('Location request stopped when the app was hidden. Retry when you are ready.'); };
    const timer = setTimeout(() => fail('A sufficiently accurate location was not available in time. Retry outdoors or save manually.'), policy.timeoutMs);
    signal.addEventListener('abort', abort, { once:true });
    document.addEventListener('visibilitychange', hidden);
    if (signal.aborted) { abort(); return; }
    if (document.hidden) { hidden(); return; }
    try {
      watch = navigator.geolocation.watchPosition(position => {
        if (finished) return;
        const fix = { latitude:position.coords.latitude, longitude:position.coords.longitude, accuracyMeters:position.coords.accuracy, timestamp:position.timestamp };
        if (!usableFix(fix, policy)) { onAccuracy(fix.accuracyMeters); return; }
        finished = true; stop(); resolve(fix);
      }, error => {
        fail(error.code === 1 ? 'Location permission was not granted. Allow location for this app in browser/device settings, then retry, or save manually.' : error.code === 3 ? 'Location timed out. Retry or save manually.' : 'Your location is unavailable. Check device Location Services, retry outdoors, or save manually.');
      }, { enableHighAccuracy:true, maximumAge:0, timeout:policy.timeoutMs });
      if (finished) stop();
    } catch { fail('Location could not be requested. Retry or save manually.'); }
  });
}
