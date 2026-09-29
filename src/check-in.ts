import type { AirportDefinition, CheckIn, LocationEvidence, PassportProgram } from './models.js';
import { acquireLocation, calendarDate, evaluateLocation, distanceMeters, type LocationFix } from './geolocation.js';
import { html, confirmCollection, today } from './visit-ui.js';
import type { PassportSnapshot } from './persistence.js';

export const locationIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
export class LocationCheckIn {
  private dialog = document.createElement('dialog');
  private request?: AbortController;
  private opener?: HTMLElement;
  private selected?: AirportDefinition;
  private fixedAirport?: AirportDefinition;
  private evidence?: LocationEvidence;
  private notes = '';
  private date = '';
  private revision = 0;
  private saving = false;
  private closing = false;
  private id = '';
  constructor(private root: HTMLElement, private program: PassportProgram, private callbacks: {
    snapshot: () => PassportSnapshot; save: (visit: CheckIn, revision: number) => Promise<boolean>; saved: (airport: AirportDefinition) => void;
  }) {
    this.dialog.className = 'gps-checkin';
    this.dialog.setAttribute('aria-labelledby', 'gps-title');
    root.append(this.dialog);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); void this.close(); });
  }
  private get policy() { return this.program.checkIn!; }
  private get introKey() { return `passport:${this.program.id}:location-introduction`; }
  open(airport?: AirportDefinition, opener?: HTMLElement) {
    if (this.dialog.open) return;
    this.opener = opener ?? document.activeElement as HTMLElement;
    this.fixedAirport = airport; this.selected = airport; this.evidence = undefined; this.notes = ''; this.date = calendarDate(Date.now(), this.policy.timeZone);
    this.revision = this.callbacks.snapshot().revision;
    this.id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('');
    this.dialog.showModal();
    let explained = false;
    try { explained = localStorage.getItem(this.introKey) === 'seen'; } catch { /* Explain again if preferences are unavailable. */ }
    if (airport) this.airportChoice(airport); else if (explained) void this.locate(); else this.intro();
  }
  private airportChoice(airport: AirportDefinition) {
    this.shell('Record a visit', `<div class="gps-airport">${this.identity(airport)}</div><p>Are you here now, or recording a past visit?</p><button class="primary gps-primary" data-here>Check in here</button><p class="gps-muted">Use your location and capture the current date and time. Location evidence stays with your saved visit and passport exports.</p><button class="gps-secondary" data-manual>Add a manual visit</button><p class="gps-muted">Choose a visit date without requesting location.</p>`);
    this.action('[data-here]', () => { try { localStorage.setItem(this.introKey, 'seen'); } catch { /* Optional preference. */ } void this.locate(); });
    this.action('[data-manual]', () => this.manual());
  }
  private shell(title: string, content: string) {
    this.dialog.innerHTML = `<header><div><span class="gps-kicker">YOUR PASSPORT</span><h2 id="gps-title" tabindex="-1">${html(title)}</h2></div><button type="button" data-close>Close</button></header><div class="gps-content">${content}</div>`;
    this.dialog.querySelector('[data-close]')!.addEventListener('click', () => void this.close());
    this.dialog.querySelector<HTMLElement>('h2')!.focus();
  }
  private action(selector: string, fn: () => void) { this.dialog.querySelector(selector)?.addEventListener('click', fn); }
  private manual() { this.request?.abort(); this.request = undefined; this.evidence = undefined; if (this.fixedAirport) this.form(this.fixedAirport); else this.search(); }
  private intro() {
    this.shell('Check in', `<div class="gps-symbol">${locationIcon}</div><p>Find your airport using your current location.</p><p class="gps-muted">Location is requested only for this check-in. If you save, its coordinates, accuracy and time stay with your visit on this device and in passport exports. We do not track you while you browse.</p><p class="gps-muted">Proximity does not prove a landing or physical stamp collection.</p><button class="primary gps-primary" data-locate>Use my location</button><button class="gps-secondary" data-manual>Choose airport manually</button>`);
    this.action('[data-locate]', () => { try { localStorage.setItem(this.introKey, 'seen'); } catch { /* Optional preference. */ } void this.locate(); });
    this.action('[data-manual]', () => this.manual());
  }
  private async locate() {
    this.request?.abort(); const request = new AbortController(); this.request = request;
    this.evidence = undefined;
    this.shell('Finding your airport', '<p role="status" id="gps-acquiring">Getting a fresh location…</p><p class="gps-muted">This may take a moment. You can cancel or record a manual visit.</p><button class="gps-secondary" data-manual>Save manually</button>');
    this.action('[data-manual]', () => this.manual());
    try {
      const fix = await acquireLocation(this.policy, request.signal, meters => {
        const status = this.dialog.querySelector('#gps-acquiring');
        if (status && Number.isFinite(meters)) status.textContent = `Waiting for a fresh, accurate location (reported accuracy ${Math.round(meters)} m)…`;
      });
      if (this.request !== request || !this.dialog.open) return;
      this.request = undefined; this.matches(fix);
    } catch (error) {
      if (this.request !== request || !this.dialog.open) return;
      this.request = undefined;
      this.failure(error instanceof Error ? error.message : 'Location could not be determined.');
    }
  }
  private failure(message: string) {
    this.shell('Location not confirmed', `<p role="status">${html(message)}</p><button class="primary gps-primary" data-retry>Retry location</button><button class="gps-secondary" data-manual>Save manually</button>`);
    this.action('[data-retry]', () => void this.locate()); this.action('[data-manual]', () => this.manual());
  }
  private matches(fix: LocationFix) {
    const candidates = (this.fixedAirport ? [this.fixedAirport] : this.program.airports).map(airport => ({ airport, evidence:evaluateLocation(airport, fix, this.policy) }))
      .filter((match): match is { airport: AirportDefinition; evidence: LocationEvidence } => !!match.evidence)
      .sort((a,b) => a.evidence.distanceMeters - b.evidence.distanceMeters || a.airport.name.localeCompare(b.airport.name));
    if (!candidates.length) {
      const participating = (this.fixedAirport ? [this.fixedAirport] : this.program.airports).filter(a => a.participation.participating);
      const nearBoundary = participating.some(a => distanceMeters(a.location,fix) - fix.accuracyMeters <= (a.checkInRadiusMeters ?? this.policy.radiusMeters));
      this.failure(nearBoundary ? 'Your location is too close to the check-in boundary to confirm with this accuracy. Retry closer to the airport or save manually.' : this.fixedAirport ? 'You appear to be outside this airport’s check-in range. Retry or save manually.' : 'No participating airport was found within check-in range. Retry or choose an airport manually.'); return;
    }
    this.shell(candidates.length === 1 ? 'Is this your airport?' : 'Choose your airport', `<p class="gps-muted">${candidates.length} airport${candidates.length === 1 ? '' : 's'} within check-in range. Confirm where you are.</p><div class="gps-results">${candidates.map(({airport,evidence},i) => `<button class="gps-airport" data-match="${i}">${this.identity(airport)}<span class="gps-distance">${(evidence.distanceMeters/1609.344).toFixed(1)} statute miles away</span><span class="gps-muted">Accuracy ±${Math.round(fix.accuracyMeters)} m · Radius ${(evidence.policy.radiusMeters/1609.344).toFixed(1)} mi</span><span class="gps-distance">Check in at ${html(airport.name)}</span></button>`).join('')}</div><button class="gps-secondary" data-manual>Choose airport manually</button>`);
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-match]').forEach(button => button.onclick = () => {
      const match = candidates[Number(button.dataset.match)]; this.evidence = match.evidence; this.form(match.airport);
    });
    this.action('[data-manual]', () => this.manual());
  }
  private identity(airport: AirportDefinition) {
    return `<strong>${html(airport.name)}</strong><span>${html(airport.identifiers?.faa ?? airport.id)} · ${html(this.program.regions.find(r => r.id === airport.regionId)?.name ?? '')}</span>`;
  }
  private search() {
    this.shell('Choose an airport', '<label>Airport name or code<input type="search" id="gps-search" placeholder="Search airports"></label><div class="gps-results" id="gps-results"></div>');
    const input = this.dialog.querySelector<HTMLInputElement>('#gps-search')!;
    const update = () => {
      const query = input.value.trim().toLowerCase();
      const airports = this.program.airports.filter(a => a.participation.participating && `${a.name} ${a.id} ${Object.values(a.identifiers ?? {}).join(' ')}`.toLowerCase().includes(query)).sort((a,b) => a.name.localeCompare(b.name));
      this.dialog.querySelector('#gps-results')!.innerHTML = airports.length ? airports.map((a,i) => `<button class="gps-airport" data-index="${i}">${this.identity(a)}</button>`).join('') : '<p role="status">No matching airports.</p>';
      this.dialog.querySelectorAll<HTMLButtonElement>('[data-index]').forEach(button => button.onclick = () => this.form(airports[Number(button.dataset.index)]));
    };
    input.oninput = update; update(); input.focus();
  }
  private form(airport: AirportDefinition) {
    this.selected = airport;
    const evidence = this.evidence;
    if (evidence) this.date = calendarDate(Date.parse(evidence.capturedAt), evidence.policy.timeZone);
    const stamped = this.callbacks.snapshot().visits.some(v => v.airportId === airport.id && !v.historyOnly);
    this.shell('Your visit', `<div class="gps-airport">${this.identity(airport)}${evidence ? `<span class="gps-distance">Location confirmed nearby</span><span class="gps-muted">${Math.round(evidence.distanceMeters)} m from airport reference point · Accuracy ±${Math.round(evidence.accuracyMeters)} m</span>` : '<span class="gps-muted">Manual visit · Location not confirmed</span>'}</div>${stamped ? '<p class="gps-muted">Stamp already recorded. This adds another visit.</p>' : ''}<form id="gps-form">${evidence ? `<p>${html(this.date)} · ${html(new Intl.DateTimeFormat(undefined,{timeZone:this.policy.timeZone,hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(evidence.capturedAt)))}</p><p class="gps-muted">Captured at the location check. Choose manual entry to record a different date.</p>` : `<label>Visit date<input name="date" type="date" required max="${this.maxDate()}" value="${html(this.date)}"></label>`}<label>Notes <span class="gps-muted">(optional)</span><textarea name="notes" rows="3" maxlength="10000" placeholder="A memorable stop, a great lunch…">${html(this.notes)}</textarea></label><p class="gps-muted">${evidence ? 'Location evidence is saved locally with this visit and included in exports.' : 'Saved locally without a recorded time or location.'}</p><button type="submit" class="primary gps-primary">Save check-in</button><p id="gps-save-status" role="status"></p></form><button class="gps-secondary" data-location>${evidence ? 'Use manual entry instead' : 'Check in with GPS'}</button>`);
    const form = this.dialog.querySelector<HTMLFormElement>('#gps-form')!;
    form.oninput = () => { this.notes = (form.elements.namedItem('notes') as HTMLTextAreaElement).value; if (!evidence) this.date = (form.elements.namedItem('date') as HTMLInputElement).value; };
    this.action('[data-location]', () => { if (evidence) { this.evidence = undefined; this.form(airport); } else { this.fixedAirport = airport; void this.locate(); } });
    form.onsubmit = event => { event.preventDefault(); void this.save(); };
  }
  private maxDate() { return calendarDate(Date.now(), this.policy.timeZone) > today() ? calendarDate(Date.now(), this.policy.timeZone) : today(); }
  private async save() {
    if (this.saving || !this.selected) return;
    this.saving = true;
    const airport = this.selected, evidence = this.evidence, now = new Date().toISOString();
    this.dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = true);
    try {
      const visit: CheckIn = { id:this.id, programId:this.program.id, airportId:airport.id, visitedAt:this.date, notes:this.notes,
        createdAt:now, updatedAt:now, timeKnown:!!evidence, verification:evidence ?? {status:'unverified'},
        ...(evidence ? {capturedAt:evidence.capturedAt,timeZone:evidence.policy.timeZone} : {}) };
      if (!await this.callbacks.save(visit, this.revision)) return;
      this.notes = ''; this.dismiss(); this.callbacks.saved(airport);
    } catch (error) { this.dialog.querySelector('#gps-save-status')!.textContent = error instanceof Error ? error.message : 'Could not save. Your draft is kept. Check device storage and retry.'; }
    finally { this.saving = false; this.dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = false); }
  }
  private async close() {
    if (this.saving || this.closing) return;
    this.closing = true;
    try {
      if (this.notes.trim() && !await confirmCollection(this.root,'Discard the notes in this unsaved check-in? Your saved visits will stay unchanged.','Discard draft','Discard check-in?')) return;
      this.dismiss();
    } finally { this.closing = false; }
  }
  private dismiss() { const request = this.request; this.request = undefined; request?.abort(); this.dialog.close(); this.opener?.focus({preventScroll:true}); this.evidence = undefined; }
  destroy() { this.dismiss(); this.dialog.remove(); }
}
