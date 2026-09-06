import type * as Leaflet from 'leaflet';
import { calculateProgress, filterAirports, isCalendarDate, validateBackup, validateProgram } from './domain.js';
import { PassportStore } from './persistence.js';
import type { AirportDefinition, AirportFilters, CheckIn, PassportBackup, PassportProgram } from './models.js';

const escape = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const localDate = (): string => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const visitId = (): string => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

/** Mount one program per page. Call destroy before replacing the app. */
export class PassportApp {
  private root!: HTMLElement;
  private map!: Leaflet.Map;
  private leaflet!: typeof Leaflet.default;
  private markers!: Leaflet.LayerGroup;
  private store: PassportStore;
  private visits: CheckIn[] = [];
  private selected?: AirportDefinition;
  private filters: AirportFilters = { query: '', regionId: '', visited: 'all' };
  private events = new AbortController();
  private resize?: ResizeObserver;
  private lastFocus?: HTMLElement;
  constructor(private options: { program: PassportProgram }) {
    validateProgram(options.program);
    this.store = new PassportStore(options.program.id);
  }
  private get program() { return this.options.program; }
  private el<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private announce(message: string) { this.el('#notice').textContent = message; }

  async mount(target: string): Promise<void> {
    const root = document.querySelector<HTMLElement>(target);
    if (!root) throw new Error(`Mount target not found: ${target}`);
    this.root = root;
    const L = (await import('leaflet')).default;
    this.leaflet = L;
    this.markers = L.layerGroup();
    const p = this.program;
    this.root.style.setProperty('--accent', p.branding.accent);
    this.root.innerHTML = `
      <a class="skip-link" href="#airport-list">Skip to airports</a>
      <header class="app-header"><div class="brand"><span class="brand-icon" aria-hidden="true">✈</span><div><span class="eyebrow">${escape(p.branding.eyebrow)}</span><h1>${escape(p.shortName)}</h1></div></div>
      <div class="header-actions"><span id="connection" class="connection"></span><label class="theme-label">Appearance<select id="theme" aria-label="Appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div></header>
      <section class="journey"><div><span class="eyebrow">YOUR NEXT ADVENTURE STARTS HERE</span><h2>A little runway. A new discovery.</h2><p>${escape(p.description)}</p></div><div id="overall" class="overall"></div></section>
      <div class="workspace" data-view="map"><aside class="sidebar" aria-label="Airport explorer">
      <div class="browse"><div class="section-heading"><h2>Explore airports</h2><span id="match-count" class="count"></span></div>
      <label class="search-label"><span class="sr-only">Search airports</span><input id="search" type="search" placeholder="Search airport name or identifier"></label>
      <div class="filter-row"><label>Region<select id="region"><option value="">All regions</option>${p.regions.map(r => `<option value="${escape(r.id)}">${escape(r.name)}</option>`).join('')}</select></label><label>Passport<select id="visited"><option value="all">All airports</option><option value="unvisited">Not visited</option><option value="visited">Visited</option></select></label></div>
      <div class="mobile-toggle" aria-label="Airport view"><button type="button" data-view="map" aria-pressed="true">Map</button><button type="button" data-view="list" aria-pressed="false">List</button></div>
      <div id="airport-list" tabindex="-1" class="airport-list"></div></div><section id="detail" class="detail" hidden aria-label="Airport details"></section>
      </aside><section class="map-section" aria-label="Airport map"><div id="map"></div><div class="map-caption"><span>○ Not visited &nbsp; ✓ Visited</span><button id="fit" type="button">Show all matches</button></div></section></div>
      <section class="passport-section"><div class="section-heading"><div><span class="eyebrow">ONE AIRPORT AT A TIME</span><h2>Your regional passport</h2></div><span class="local-label">Saved on this device</span></div><div id="regions" class="region-cards"></div></section>
      <footer><p>${escape(p.dataNotice)}</p><div class="backup-actions"><button id="export" type="button">Export passport</button><label class="button">Import passport<input id="import" type="file" accept="application/json,.json" class="sr-only"></label></div><p id="notice" role="status" aria-live="polite"></p></footer>`;
    this.setupTheme();
    const connection = () => { this.el('#connection').textContent = navigator.onLine ? '● Local passport' : '○ Offline · airports & visits available'; };
    connection();
    for (const event of ['online', 'offline']) window.addEventListener(event, connection, { signal: this.events.signal });
    this.map = L.map(this.el('#map'), { zoomControl: false }).setView([p.map.center.latitude, p.map.center.longitude], p.map.zoom);
    L.control.zoom({ position: 'topright' }).addTo(this.map);
    L.tileLayer(p.map.tileUrl, { attribution: p.map.attribution, maxZoom: 19 }).on('tileerror', () => {
      this.announce('Basemap tiles are unavailable. Airport markers, the list, and your passport still work.');
    }).addTo(this.map);
    this.markers.addTo(this.map);
    this.resize = new ResizeObserver(() => this.map.invalidateSize());
    this.resize.observe(this.el('#map'));
    this.el<HTMLInputElement>('#search').addEventListener('input', event => { this.filters.query = (event.target as HTMLInputElement).value; this.render(); });
    this.el('#region').addEventListener('change', event => { this.filters.regionId = (event.target as HTMLSelectElement).value; this.render(); });
    this.el('#visited').addEventListener('change', event => { this.filters.visited = (event.target as HTMLSelectElement).value as AirportFilters['visited']; this.render(); });
    this.root.querySelectorAll<HTMLButtonElement>('.mobile-toggle button').forEach(button => button.addEventListener('click', () => {
      this.el('.workspace').dataset.view = button.dataset.view;
      this.root.querySelectorAll('.mobile-toggle button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      this.map.invalidateSize();
    }));
    this.el('#fit').addEventListener('click', () => {
      const airports = filterAirports(p, this.visits, this.filters);
      if (airports.length) this.map.fitBounds(airports.map(a => [a.location.latitude, a.location.longitude] as Leaflet.LatLngTuple), { padding: [45, 45], maxZoom: 10 });
    });
    this.el('#export').addEventListener('click', () => void this.export());
    this.el('#import').addEventListener('change', event => void this.import(event.target as HTMLInputElement));
    this.root.addEventListener('keydown', event => {
      if (!this.selected) return;
      if (event.key === 'Escape') this.closeDetail();
      if (event.key === 'Tab' && matchMedia('(max-width: 760px)').matches) {
        const focusable = [...this.el('#detail').querySelectorAll<HTMLElement>('button, input, textarea')].filter(e => !e.hasAttribute('disabled'));
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }, { signal: this.events.signal });
    try { this.visits = await this.store.list(); }
    catch { this.announce('Device storage could not be opened. Check browser storage permissions before saving visits.'); }
    this.render();
  }

  private setupTheme() {
    const select = this.el<HTMLSelectElement>('#theme');
    try { select.value = localStorage.getItem('passport:theme') || 'system'; } catch { /* Preference storage is optional. */ }
    if (!select.value) select.value = 'system';
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = select.value === 'system' ? (media.matches ? 'dark' : 'light') : select.value; };
    apply();
    media.addEventListener('change', apply, { signal: this.events.signal });
    select.addEventListener('change', () => { apply(); try { localStorage.setItem('passport:theme', select.value); } catch { /* Still usable this session. */ } });
  }

  private render() {
    const L = this.leaflet;
    const p = this.program;
    const airports = filterAirports(p, this.visits, this.filters);
    const visited = new Set(this.visits.map(v => v.airportId));
    this.el('#match-count').textContent = String(airports.length);
    this.el('#airport-list').innerHTML = airports.length ? airports.map(a => {
      const region = p.regions.find(r => r.id === a.regionId)!;
      return `<button class="airport-card" data-airport="${escape(a.id)}" aria-pressed="${this.selected?.id === a.id}"><span class="airport-code" style="--region:${region.color}">${escape(a.id)}</span><span class="airport-name"><strong>${escape(a.name)}</strong><small>${escape(region.name)}</small></span><span class="visit-state" aria-label="${visited.has(a.id) ? 'Visited' : 'Not visited'}">${visited.has(a.id) ? '✓' : '○'}</span></button>`;
    }).join('') : '<p class="empty">No airports match. Try a different search or filter.</p>';
    this.root.querySelectorAll<HTMLButtonElement>('[data-airport]').forEach(button => button.addEventListener('click', () => this.select(p.airports.find(a => a.id === button.dataset.airport)!)));
    this.markers.clearLayers();
    for (const airport of airports) {
      const region = p.regions.find(r => r.id === airport.regionId)!;
      const icon = L.divIcon({ className: 'passport-marker-wrapper', html: `<span class="passport-marker ${visited.has(airport.id) ? 'is-visited' : ''} ${this.selected?.id === airport.id ? 'is-selected' : ''}" style="--region:${region.color}">${visited.has(airport.id) ? '✓' : '✈'}</span>`, iconSize: [40, 40], iconAnchor: [20, 20] });
      const marker = L.marker([airport.location.latitude, airport.location.longitude], { icon, title: `${airport.id} ${airport.name}${visited.has(airport.id) ? ', visited' : ', not visited'}`, alt: airport.name }).addTo(this.markers).on('click', () => this.select(airport));
      marker.getElement()?.setAttribute('aria-label', `${airport.id} ${airport.name}, ${visited.has(airport.id) ? 'visited' : 'not visited'}`);
      const label = document.createElement('span'); label.textContent = airport.id;
      marker.bindTooltip(label, { permanent: true, direction: 'bottom', offset: [0, 16], className: 'airport-tooltip' });
    }
    const progress = calculateProgress(p, this.visits);
    this.el('#overall').innerHTML = `<div><strong>${progress.visited}<span> / ${progress.total}</span></strong><span>airports visited</span></div><progress aria-label="Overall progress" value="${progress.visited}" max="${progress.total || 1}"></progress>`;
    this.el('#regions').innerHTML = progress.regions.map(r => `<article class="region-card" style="--region:${r.color}"><div><span class="region-dot" aria-hidden="true"></span><h3>${escape(r.name)}</h3><span>${r.complete ? '✓ Complete' : `${r.visited} / ${r.total}`}</span></div><progress aria-label="${escape(r.name)} progress" value="${r.visited}" max="${r.total || 1}"></progress><small>${r.complete ? 'Every journey leaves a mark.' : `${r.required} airports to complete this region`}</small></article>`).join('');
  }

  private select(airport: AirportDefinition) {
    if (!this.selected) this.lastFocus = document.activeElement as HTMLElement;
    this.selected = airport;
    this.map.panTo([airport.location.latitude, airport.location.longitude]);
    this.render();
    this.renderDetail();
    this.el<HTMLButtonElement>('#close-detail').focus();
  }

  private closeDetail() {
    this.selected = undefined;
    this.el('#detail').hidden = true;
    this.el('.browse').hidden = false;
    this.render();
    if (this.lastFocus?.isConnected) this.lastFocus.focus(); else this.el('#search').focus();
  }

  private renderDetail(edit?: CheckIn) {
    const airport = this.selected!;
    const region = this.program.regions.find(r => r.id === airport.regionId)!;
    const detail = this.el('#detail');
    detail.hidden = false;
    if (matchMedia('(max-width: 760px)').matches) {
      detail.setAttribute('role', 'dialog'); detail.setAttribute('aria-modal', 'true');
    } else { detail.removeAttribute('role'); detail.removeAttribute('aria-modal'); }
    this.el('.browse').hidden = true;
    const visits = this.visits.filter(v => v.airportId === airport.id);
    detail.innerHTML = `<button id="close-detail" type="button" class="back-button">← All airports</button><span class="eyebrow">${escape(region.name)} · ${escape(airport.id)}</span><h2>${escape(airport.name)}</h2><p>${escape(airport.description)}</p>
    <h3>Stamp locations</h3>${airport.stampLocations?.length ? airport.stampLocations.map(s => `<article class="stamp"><strong>${escape(s.name)}</strong><p>${escape(s.description)}</p><small>Access: ${escape(s.access.replace('-', ' '))}</small></article>`).join('') : '<p>Stamp details have not been added.</p>'}
    <form id="checkin"><h3>${edit ? 'Edit visit' : 'Add a visit'}</h3><label>Visit date<input name="date" type="date" required max="${localDate()}" value="${edit?.visitedAt ?? localDate()}"></label><label>Notes <span class="muted">(optional)</span><textarea name="notes" rows="3" maxlength="10000" placeholder="A good landing, a great lunch…">${escape(edit?.notes ?? '')}</textarea></label><p class="muted">Saved locally as an unverified visit. Time is not recorded.</p><button class="primary" type="submit">${edit ? 'Save changes' : 'Save check-in'}</button><p id="save-status" role="status"></p></form>
    <h3>Visit history <span class="muted">${visits.length}</span></h3><div class="history">${visits.length ? visits.map(v => `<article><strong>${escape(v.visitedAt)}</strong><small>Unverified</small><p>${escape(v.notes || 'No notes for this visit.')}</p><div><button type="button" data-edit="${escape(v.id)}">Edit</button><button type="button" data-delete="${escape(v.id)}">Delete</button></div></article>`).join('') : '<p class="muted">Your first visit is still ahead of you.</p>'}</div>`;
    this.el('#close-detail').addEventListener('click', () => this.closeDetail());
    this.el<HTMLFormElement>('#checkin').addEventListener('submit', event => {
      event.preventDefault();
      void this.saveVisit(event.currentTarget as HTMLFormElement, airport, edit);
    });
    detail.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(button => button.addEventListener('click', () => { this.renderDetail(this.visits.find(v => v.id === button.dataset.edit)); this.el<HTMLInputElement>('[name="date"]').focus(); }));
    detail.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(button => button.addEventListener('click', () => void this.deleteVisit(button.dataset.delete!)));
  }

  private async saveVisit(form: HTMLFormElement, airport: AirportDefinition, edit?: CheckIn) {
    const data = new FormData(form);
    const date = String(data.get('date'));
    if (!isCalendarDate(date) || date > localDate()) { this.el('#save-status').textContent = 'Choose a valid date today or earlier.'; return; }
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true;
    const now = new Date().toISOString();
    try {
      await this.store.save({ id: edit?.id ?? visitId(), programId: this.program.id, airportId: airport.id, visitedAt: date, timeKnown: false, createdAt: edit?.createdAt ?? now, updatedAt: now, notes: String(data.get('notes')).slice(0, 10000), verification: { status: 'unverified' } });
      this.visits = await this.store.list(); this.render();
      if (this.selected?.id === airport.id) { this.renderDetail(); this.el('#save-status').textContent = 'Visit saved on this device.'; this.el<HTMLButtonElement>('#checkin button').focus(); }
      this.announce('Visit saved on this device.');
    } catch { if (button.isConnected) this.el('#save-status').textContent = 'Could not save. Your browser may be out of storage. Your entries are still in the form; export existing visits and try again.'; }
    finally { button.disabled = false; }
  }

  private async deleteVisit(id: string) {
    if (!window.confirm('Delete this visit from this device? This cannot be undone.')) return;
    try { await this.store.delete(id); this.visits = await this.store.list(); this.render(); if (this.selected) { this.renderDetail(); this.el('#close-detail').focus(); } this.announce('Visit deleted.'); }
    catch { this.announce('Could not delete this visit. Please try again.'); }
  }

  private async export() {
    try {
      const backup: PassportBackup = { format: 'aviation-passport', schemaVersion: 1, programId: this.program.id, exportedAt: new Date().toISOString(), checkIns: await this.store.list(), attachments: [] };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `${this.program.id}-passport.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      this.announce('Passport exported. Keep the file to restore or transfer your visits.');
    } catch { this.announce('Could not read your passport for export. Check browser storage permissions.'); }
  }

  private async import(input: HTMLInputElement) {
    const file = input.files?.[0]; if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose a JSON backup smaller than 5 MB.');
      const backup = validateBackup(JSON.parse(await file.text()), this.program);
      const count = await this.store.merge(backup.checkIns);
      this.visits = await this.store.list(); this.render(); if (this.selected) this.renderDetail();
      this.announce(`Imported ${count} visits. Existing visits were preserved.`);
    } catch (error) { this.announce(error instanceof Error ? error.message : 'Import failed. Existing visits were preserved.'); }
    finally { input.value = ''; }
  }

  async destroy() { this.events.abort(); this.resize?.disconnect(); this.map?.remove(); await this.store.close(); this.root.replaceChildren(); }
}
