import { OfflineAccess, offlineCard, offlineNavigation, type InstallationGuidance } from './offline-access.js';
import { PassportMap } from './map/renderer.js';
import { OfflineMapManager, browserMapEnvironment } from './map/offline/manager.js';
import { IndexedMapStorage } from './map/offline/storage.js';
import { calculateProgress, filterAirports, isCalendarDate, validateBackup, validateProgram } from './domain.js';
import { PassportStore } from './persistence.js';
import type { AirportDefinition, AirportFilters, CheckIn, PassportBackup, PassportProgram } from './models.js';

const escape = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const airportLabel = (airport: AirportDefinition): string => airport.identifiers?.faa?.trim() || airport.id;
const localDate = (): string => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const visitId = (): string => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

/** Mount one program per page. Call destroy before replacing the app. */
export class PassportApp {
  private root!: HTMLElement;
  private map!: Awaited<ReturnType<typeof PassportMap.create>>;
  private offline!: OfflineMapManager;
  private unsubscribeMap?: () => void;
  private offlineUI?: OfflineAccess;
  private rendererMessage = '';
  private store: PassportStore;
  private visits: CheckIn[] = [];
  private selected?: AirportDefinition;
  private filters: AirportFilters = { query: '', regionId: '', visited: 'all' };
  private events = new AbortController();
  private resize?: ResizeObserver;
  private lastFocus?: HTMLElement;
  private passportOpen = false;
  private followInitialMapLayout = true;
  private previewOnly = false;
  private saveNoticeTimer?: ReturnType<typeof setTimeout>;
  private feedbackTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  constructor(private options: { program: PassportProgram; offlineShellReady?: () => Promise<boolean>; installationGuidance?: () => InstallationGuidance }) {
    validateProgram(options.program);
    this.store = new PassportStore(options.program.id);
  }
  private get program() { return this.options.program; }
  private el<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private announce(message: string) {
    this.feedback(this.passportOpen ? '#passport-notice' : '#notice', message);
  }

  private confirmVisit(message: string) {
    clearTimeout(this.saveNoticeTimer);
    const status = this.el('#save-status');
    if (!status) return;
    const button = this.el<HTMLButtonElement>('#checkin button[type="submit"]');
    const label = button.textContent;
    button.textContent = 'Visit saved';
    button.disabled = true;
    button.classList.add('is-saved');
    status.classList.add('sr-only');
    status.textContent = message;
    this.saveNoticeTimer = setTimeout(() => {
      if (!button.isConnected) return;
      button.textContent = label;
      button.disabled = false;
      button.classList.remove('is-saved');
      if (status.textContent === message) status.textContent = '';
      status.classList.remove('sr-only');
    }, 4000);
  }

  async mount(target: string): Promise<void> {
    const root = document.querySelector<HTMLElement>(target);
    if (!root) throw new Error(`Mount target not found: ${target}`);
    this.root = root;
    this.root.inert = true;
    this.root.setAttribute('aria-busy','true');
    this.root.classList.add('passport-app');
    const p = this.program;
    this.root.style.setProperty('--accent', p.branding.accent);
    this.root.innerHTML = `
      <a class="skip-link" href="#airport-list">Skip to airports</a>
      <header class="app-header"><div class="brand"><span class="brand-icon" aria-hidden="true">✈</span><div><span class="eyebrow">${escape(p.branding.eyebrow)}</span><h1>${escape(p.shortName)}</h1></div></div>
      <div id="overall" class="overall"></div><div class="header-actions"><label class="theme-label">Appearance<select id="theme" aria-label="Appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div></header>${offlineNavigation}
      <div class="workspace" data-view="map" data-section="explore"><aside class="sidebar" aria-label="Passport navigation and airport explorer">
      <div class="primary-tabs" role="tablist" aria-label="Main view"><button id="explore-tab" role="tab" type="button" aria-selected="true" aria-controls="explore-panel">Explore</button><button id="passport-tab" role="tab" type="button" aria-selected="false" aria-controls="passport-panel" tabindex="-1">My passport</button></div>
      <p id="notice" role="status" aria-live="polite"></p>
      <section id="explore-panel" class="explore-panel" role="tabpanel" aria-labelledby="explore-tab">
      <div class="browse"><div class="section-heading"><h2>Explore airports</h2><span id="match-count" class="count"></span></div>
      <label class="search-label"><span class="sr-only">Search airports</span><input id="search" type="search" placeholder="Search airport name or identifier"></label>
      <div class="filter-row"><label>Region<select id="region"><option value="">All regions</option>${p.regions.map(r => `<option value="${escape(r.id)}">${escape(r.name)}</option>`).join('')}</select></label><label>Passport<select id="visited"><option value="all">All airports</option><option value="unvisited">Not visited</option><option value="visited">Visited</option></select></label></div>
      <div class="mobile-toggle" aria-label="Airport view"><button type="button" data-view="map" aria-pressed="true">Map</button><button type="button" data-view="list" aria-pressed="false">List</button></div>
      <div id="airport-list" tabindex="-1" class="airport-list"></div></div><section id="detail" class="detail" hidden aria-label="Airport details"></section></section>
      <section id="passport-panel" class="passport-panel" role="tabpanel" hidden aria-labelledby="passport-tab"><div class="passport-content"><p>${escape(p.description)}</p><p class="local-label">Saved on this device</p><div class="backup-actions"><button id="export" type="button" aria-describedby="export-status">Export passport</button><button id="import-button" type="button" aria-describedby="passport-notice">Import passport</button><input id="import" type="file" accept="application/json,.json" hidden></div><p id="export-status" class="export-feedback" role="status" aria-live="polite"></p><p id="passport-notice" role="status" aria-live="polite"></p><section class="passport-section"><h3>Your regional passport</h3><div id="regions" class="region-cards"></div></section><p class="data-notice">${escape(p.dataNotice)}</p><p><a href="${escape(new URL('./notices.txt',import.meta.url).href)}" target="_blank" rel="noopener">Software licenses</a></p></div></section>
      </aside><section class="map-section" aria-label="Airport map"><div id="map"></div><section id="airport-preview" class="airport-preview" hidden aria-label="Selected airport"><div><strong id="preview-name"></strong><p id="preview-meta"></p></div><div class="preview-actions"><button id="preview-details" type="button">View details</button><button id="preview-close" type="button" aria-label="Dismiss airport preview">Close</button></div></section><div class="map-caption"><div class="map-legend"><span class="map-legend-item"><span class="map-legend-marker" aria-hidden="true"></span>Not visited</span><span class="map-legend-item"><span class="map-legend-marker is-visited" aria-hidden="true"></span>Visited</span></div><button id="fit" type="button">Show all matches</button></div></section></div>
      ${offlineCard}`;
    this.setupTheme();
    this.offline = new OfflineMapManager(p.id, p.map.package, new IndexedMapStorage(p.id, p.map.package.id), browserMapEnvironment());
    this.map = await PassportMap.create(this.el('#map'), [p.map.center.latitude, p.map.center.longitude], p.map.zoom, this.offline, airport => this.select(airport, true), message => { this.rendererMessage = message; this.offlineUI?.rendererStatus(message); });
    this.setupOfflineMap();
    this.map.on('click', () => {
      if (this.selected) this.closeDetail(false);
    });
    this.map.on('zoomend moveend', () => this.render());
    this.resize = new ResizeObserver(() => {
      if (this.el('#map').clientWidth && this.el('#map').clientHeight) {
        this.map.invalidateSize();
        if (this.followInitialMapLayout) this.fitMatchingAirports();
      }
    });
    this.resize.observe(this.el('#map'));
    for (const element of this.root.querySelectorAll<HTMLElement>('.map-caption, .maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-right')) this.resize.observe(element, {box:'border-box'});
    for (const event of ['pointerdown', 'wheel', 'keydown']) this.el('#map').addEventListener(event, () => { this.followInitialMapLayout = false; }, {capture:true,signal:this.events.signal});
    this.el<HTMLInputElement>('#search').addEventListener('input', event => { this.filters.query = (event.target as HTMLInputElement).value; this.render(); });
    this.el('#region').addEventListener('change', event => { this.filters.regionId = (event.target as HTMLSelectElement).value; this.render(); });
    this.el('#visited').addEventListener('change', event => { this.filters.visited = (event.target as HTMLSelectElement).value as AirportFilters['visited']; this.render(); });
    this.root.querySelectorAll<HTMLButtonElement>('.mobile-toggle button').forEach(button => button.addEventListener('click', () => {
      this.el('.workspace').dataset.view = button.dataset.view;
      this.root.querySelectorAll('.mobile-toggle button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      this.map.invalidateSize();
    }));
    this.el('#preview-details').addEventListener('click', () => { this.renderDetail(); this.el('#close-detail').focus(); });
    this.el('#preview-close').addEventListener('click', () => this.closeDetail(false));
    this.el('#fit').addEventListener('click', () => { this.followInitialMapLayout = false; this.fitMatchingAirports(); });
    this.el('#export').addEventListener('click', () => void this.export('#export-status', '#export'));
    this.el('#import-button').addEventListener('click', () => {
      this.feedback('#passport-notice', 'Choose a passport JSON backup. If the chooser stays closed, save unfinished visits before reloading.');
      const input = this.el<HTMLInputElement>('#import');
      // Keep activation synchronous, but do not reuse a previous picker element.
      const freshInput = input.cloneNode(false) as HTMLInputElement;
      freshInput.value = '';
      input.replaceWith(freshInput);
      try { freshInput.click(); }
      catch { this.feedback('#passport-notice', 'The file chooser could not be opened. Save unfinished visits before reloading and trying again.'); }
    });
    // Delegate so replacement inputs work and detached inputs cannot update feedback.
    this.root.addEventListener('cancel', event => {
      if (event.target === this.el('#import') && !this.el<HTMLButtonElement>('#import-button').disabled) this.noImportSelection();
    }, { signal: this.events.signal });
    this.root.addEventListener('change', event => {
      if (event.target === this.el('#import')) void this.import(event.target as HTMLInputElement);
    }, { signal: this.events.signal });
    const tabs = [this.el('#explore-tab'), this.el('#passport-tab')];
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => this.setPassportOpen(index === 1));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        this.setPassportOpen(event.key === 'Home' ? false : event.key === 'End' ? true : index === 0);
      });
    });
    const mobile = matchMedia('(max-width: 760px)');
    mobile.addEventListener('change', () => { if (!mobile.matches && this.previewOnly && this.selected) this.renderDetail(); this.syncPanels(); }, { signal: this.events.signal });
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!this.passportOpen && this.selected) { event.preventDefault(); this.closeDetail(); }
        return;
      }
      const panel = !this.passportOpen && this.selected && !this.previewOnly ? this.el('#detail') : undefined;
      if (event.key === 'Tab' && mobile.matches && panel) {
        const focusable = [...panel.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex="0"]')].filter(e => !e.hasAttribute('disabled') && e.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }, { signal: this.events.signal });
    try { this.visits = await this.store.list(); this.el('#offline-visits').textContent = 'Passport storage: available on this device.'; }
    catch { this.el('#offline-visits').textContent = 'Passport storage: unavailable.'; this.announce('Device storage could not be opened. Check browser storage permissions before saving visits.'); }
    this.render();
    if (this.followInitialMapLayout) this.fitMatchingAirports();
    this.root.inert = false;
    this.root.setAttribute('aria-busy','false');
    this.offlineUI?.start();
  }

  private fitMatchingAirports(): boolean {
    const container = this.el('#map');
    if (!container.clientWidth || !container.clientHeight) return false;
    const airports = filterAirports(this.program, this.visits, this.filters);
    if (!airports.length) return true;
    this.map.invalidateSize();
    // Keep target/label margins; reserve overlay space only where targets overlap.
    const margin = Math.min(24, container.clientWidth / 4, container.clientHeight / 4);
    const labelBottom = Math.min(40, container.clientHeight / 4);
    let top = margin, bottom = labelBottom;
    const points = airports.map(a => [a.location.latitude, a.location.longitude] as [number, number]);
    const fit = () => this.map.fitBounds(points, {
      paddingTopLeft: [margin, top], paddingBottomRight: [margin, bottom],
      maxZoom: airports.length === 1 ? 10 : 19, animate: false,
    });
    fit();
    const bounds = container.getBoundingClientRect();
    const controls = this.el('.maplibregl-ctrl-group')?.getBoundingClientRect();
    // The caption spans the map, but only its children cover map content.
    const lowerControls = [...this.root.querySelectorAll<HTMLElement>('.map-caption > *, .maplibregl-ctrl-attrib')]
      .map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
    const overlaps = (rect: DOMRect, below: number) => points.some(point => {
      const p = this.map.latLngToContainerPoint(point);
      const x = bounds.left + p.x, y = bounds.top + p.y;
      return x + margin > rect.left && x - margin < rect.right && y + below > rect.top && y - margin < rect.bottom;
    });
    // Recheck after fitting: clearing one overlay can move a target toward another.
    for (let pass = 0; pass < 3; pass++) {
      let nextTop = top, nextBottom = bottom;
      if (controls?.width && controls.height && overlaps(controls, labelBottom)) nextTop = Math.max(top, controls.bottom - bounds.top + margin);
      for (const rect of lowerControls) if (overlaps(rect, labelBottom)) nextBottom = Math.max(nextBottom, bounds.bottom - rect.top + labelBottom);
      if (nextTop === top && nextBottom === bottom) break;
      top = nextTop; bottom = nextBottom; fit();
    }
    return true;
  }

  private setPassportOpen(open: boolean, focusTab = true) {
    this.passportOpen = open;
    this.el('.workspace').dataset.section = open ? 'passport' : 'explore';
    this.el('#explore-panel').hidden = open;
    this.el('#passport-panel').hidden = !open;
    this.el('#notice').hidden = open;
    for (const [selector, active] of [['#explore-tab', !open], ['#passport-tab', open]] as const) {
      this.el(selector).setAttribute('aria-selected', String(active));
      this.el(selector).tabIndex = active ? 0 : -1;
    }
    this.syncPanels();
    if (this.el('#map').clientWidth && this.el('#map').clientHeight) this.map.invalidateSize();
    if (focusTab) this.el(!open && this.selected && !this.previewOnly && matchMedia('(max-width: 760px)').matches ? '#close-detail' : open ? '#passport-tab' : '#explore-tab').focus({ preventScroll: true });
  }

  private syncPanels() {
    const mobile = matchMedia('(max-width: 760px)').matches;
    const modal = mobile && !this.passportOpen && !!this.selected && !this.previewOnly;
    for (const selector of ['.app-header', '.offline-navigation', '#offline-card', '.map-section', '#notice', '.skip-link', '.primary-tabs']) this.el(selector).inert = modal;
    this.el('.browse').inert = this.passportOpen || (mobile && !!this.selected && !this.previewOnly);
    this.el('#detail').inert = this.passportOpen;
    const detail = this.el('#detail');
    if (modal) { detail.setAttribute('role', 'dialog'); detail.setAttribute('aria-modal', 'true'); }
    else { detail.removeAttribute('role'); detail.removeAttribute('aria-modal'); }
  }

  private setupTheme() {
    const select = this.el<HTMLSelectElement>('#theme');
    try { select.value = localStorage.getItem(`passport:${this.program.id}:theme`) ?? localStorage.getItem('passport:theme') ?? 'system'; } catch { /* Preference storage is optional. */ }
    if (!select.value) select.value = 'system';
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = select.value === 'system' ? (media.matches ? 'dark' : 'light') : select.value; this.updateBasemap(); };
    apply();
    media.addEventListener('change', apply, { signal: this.events.signal });
    select.addEventListener('change', () => { apply(); try { localStorage.setItem(`passport:${this.program.id}:theme`, select.value); } catch { /* Still usable this session. */ } });
  }

  private setupOfflineMap() {
    this.offlineUI = new OfflineAccess(this.root, this.offline, {programId:this.program.id, shellReady:this.options.offlineShellReady, guidance:this.options.installationGuidance, retry:()=>this.updateBasemap(), exportPassport:()=>{ void this.export('#offline-export-status', '#offline-export'); }});
    this.offlineUI.rendererStatus(this.rendererMessage);
    let source = '';
    this.unsubscribeMap = this.offline.subscribe(status => {
      const next = status.active?.generation ?? (status.state === 'checking' ? 'checking' : 'online');
      if (source !== next) { source = next; this.updateBasemap(); }
    });
  }

  private updateBasemap() {
    if (this.map) void this.map.basemap(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }

  private render() {
    const compact = this.map.getZoom() < (this.program.map.markerDetailZoom ?? 0);
    this.el('#map').classList.toggle('compact-markers', compact);
    const p = this.program;
    const airports = filterAirports(p, this.visits, this.filters);
    const visited = new Set(this.visits.map(v => v.airportId));
    this.el('#match-count').textContent = String(airports.length);
    this.el('#airport-list').innerHTML = airports.length ? airports.map(a => {
      const region = p.regions.find(r => r.id === a.regionId)!;
      return `<button class="airport-card" data-airport="${escape(a.id)}" aria-pressed="${this.selected?.id === a.id}"><span class="airport-code" style="--region:${region.color}">${escape(airportLabel(a))}</span><span class="airport-name"><strong>${escape(a.name)}</strong><small>${escape(region.name)}</small></span><span class="visit-state" aria-label="${visited.has(a.id) ? 'Visited' : 'Not visited'}">${visited.has(a.id) ? '✓' : '○'}</span></button>`;
    }).join('') : '<p class="empty">No airports match. Try a different search or filter.</p>';
    this.root.querySelectorAll<HTMLButtonElement>('[data-airport]').forEach(button => button.addEventListener('click', () => this.select(p.airports.find(a => a.id === button.dataset.airport)!)));
    const visibleLabels = new Set<string>();
    const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
    const size = this.map.getSize();
    const markerPositions = airports.map(airport => ({ id: airport.id, point: this.map.latLngToContainerPoint([airport.location.latitude, airport.location.longitude]) }));
    const candidates = airports.filter(airport => {
      const point = this.map.latLngToContainerPoint([airport.location.latitude, airport.location.longitude]);
      return point.x >= 0 && point.x <= size.x && point.y >= 0 && point.y <= size.y;
    });
    let labelsFit = this.map.getZoom() >= (p.map.markerDetailZoom ?? 9) - 2;
    for (const airport of candidates) {
      if (!labelsFit) break;
      const point = this.map.latLngToContainerPoint([airport.location.latitude, airport.location.longitude]);
      const width = airportLabel(airport).length * 7 + 16;
      const rect = { left: point.x - width / 2, right: point.x + width / 2, top: point.y + 20, bottom: point.y + 44 };
      if (occupied.some(other => rect.left < other.right + 6 && rect.right > other.left - 6 && rect.top < other.bottom + 6 && rect.bottom > other.top - 6)
        || markerPositions.some(marker => marker.id !== airport.id && marker.point.x + 12 > rect.left && marker.point.x - 12 < rect.right && marker.point.y + 12 > rect.top && marker.point.y - 12 < rect.bottom)) {
        labelsFit = false;
        break;
      }
      visibleLabels.add(airport.id);
      occupied.push(rect);
    }
    if (!labelsFit) visibleLabels.clear();
    this.map.airports(airports, p.regions, visited, this.selected?.id, compact, visibleLabels);
    const progress = calculateProgress(p, this.visits);
    this.el('#overall').innerHTML = `<div><strong>${progress.visited}<span> / ${progress.total}</span></strong><span>airports visited</span></div><progress aria-label="Overall progress" value="${progress.visited}" max="${progress.total || 1}"></progress>`;
    this.el('#regions').innerHTML = progress.regions.map(r => `<article class="region-card" style="--region:${r.color}"><div><span class="region-dot" aria-hidden="true"></span><h3>${escape(r.name)}</h3><span>${r.complete ? '✓ Complete' : `${r.visited} / ${r.total}`}</span></div><progress aria-label="${escape(r.name)} progress" value="${r.visited}" max="${r.total || 1}"></progress><small>${r.complete ? 'Every journey leaves a mark.' : `${r.required} airports to complete this region`}</small></article>`).join('');
  }

  private select(airport: AirportDefinition, fromMap = false) {
    if (this.passportOpen) this.setPassportOpen(false, false);
    if (!this.selected) this.lastFocus = document.activeElement as HTMLElement;
    this.selected = airport;
    if (fromMap && matchMedia('(max-width: 760px)').matches) {
      this.previewOnly = true;
      this.el('#detail').hidden = true;
      this.el('.browse').hidden = false;
      this.el('#airport-preview').hidden = false;
      this.el('.map-section').classList.add('has-preview');
      this.el('#preview-name').textContent = `${airportLabel(airport)} · ${airport.name}`;
      const region = this.program.regions.find(r => r.id === airport.regionId)!;
      this.el('#preview-meta').textContent = `${this.visits.some(v => v.airportId === airport.id) ? 'Visited' : 'Not visited'} · ${region.name}`;
      this.syncPanels();
      this.map.invalidateSize();
      const point = this.map.project([airport.location.latitude, airport.location.longitude]);
      const height = this.map.getSize().y;
      const targetY = Math.max(28, (height - this.el('#airport-preview').offsetHeight - 26) / 2 - 10);
      point.y += height / 2 - targetY;
      this.map.panTo(this.map.unproject(point));
      this.render();
      return;
    }
    this.map.panTo([airport.location.latitude, airport.location.longitude]);
    this.render();
    this.renderDetail();
    this.el<HTMLButtonElement>('#close-detail').focus();
  }

  private closeDetail(restoreFocus = true) {
    this.selected = undefined;
    this.previewOnly = false;
    this.el('#airport-preview').hidden = true;
    this.el('.map-section').classList.remove('has-preview');
    this.el('#detail').hidden = true;
    this.el('.browse').hidden = false;
    this.render();
    this.syncPanels();
    if (!restoreFocus) this.el('#map').focus({ preventScroll: true });
    else if (this.lastFocus?.isConnected) this.lastFocus.focus(); else this.el('#search').focus();
  }

  private renderDetail(edit?: CheckIn) {
    this.previewOnly = false;
    this.el('#airport-preview').hidden = true;
    this.el('.map-section').classList.remove('has-preview');
    const airport = this.selected!;
    const region = this.program.regions.find(r => r.id === airport.regionId)!;
    const detail = this.el('#detail');
    detail.hidden = false;
    this.syncPanels();
    this.el('.browse').hidden = true;
    const visits = this.visits.filter(v => v.airportId === airport.id);
    detail.innerHTML = `<button id="close-detail" type="button" class="back-button">← All airports</button><span class="eyebrow">${escape(region.name)} · ${escape(airportLabel(airport))}</span><h2>${escape(airport.name)}</h2><p>${escape(airport.description)}</p>
    ${airport.address ? `<p class="airport-address">${escape(airport.address)}</p>` : ''}
    ${airport.cautions?.map(c => `<p class="airport-caution">${escape(c)}</p>`).join('') ?? ''}
    ${airport.runways?.length ? `<h3>Runways</h3>${airport.runways.map(r => `<p>${escape(r.name)} · ${r.lengthFeet ? `${r.lengthFeet.toLocaleString()} ft` : 'Length unknown'} · ${escape(r.surface ?? 'Surface unknown')}${r.closed ? ' · Closed in source' : ''}</p>`).join('')}` : ''}
    ${airport.sources?.length ? `<p class="airport-sources">Sources: ${airport.sources.map(s => `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.name)}</a> (${escape(s.retrievedAt)})`).join(' · ')}</p>` : ''}
    <h3>Stamp locations</h3>${airport.stampLocations?.length ? airport.stampLocations.map(s => `<article class="stamp"><strong>${escape(s.name)}</strong><p>${escape(s.description)}</p><small>Access: ${escape(s.access.replace('-', ' '))}</small></article>`).join('') : '<p>Stamp details have not been added.</p>'}
    <form id="checkin" data-edit-id="${escape(edit?.id ?? '')}"><h3>${edit ? 'Edit visit' : 'Add a visit'}</h3><label>Visit date<input name="date" type="date" required max="${localDate()}" value="${edit?.visitedAt ?? localDate()}"></label><label>Notes <span class="muted">(optional)</span><textarea name="notes" rows="3" maxlength="10000" placeholder="A good landing, a great lunch…">${escape(edit?.notes ?? '')}</textarea></label><p class="muted">Saved locally as an unverified visit. Time is not recorded.</p><button class="primary" type="submit">${edit ? 'Save changes' : 'Save check-in'}</button><p id="save-status" role="status"></p></form>
    <h3 id="history-heading" tabindex="-1">Visit history <span id="visit-count" class="muted">${visits.length}</span></h3><div class="history">${visits.length ? visits.map(v => `<article><strong>${escape(v.visitedAt)}</strong><small>Unverified</small><p>${escape(v.notes || 'No notes for this visit.')}</p><div><button type="button" data-edit="${escape(v.id)}">Edit</button><button type="button" data-delete="${escape(v.id)}">Delete</button></div></article>`).join('') : '<p class="muted">Your first visit is still ahead of you.</p>'}</div>`;
    this.el('#close-detail').addEventListener('click', () => this.closeDetail());
    this.el<HTMLFormElement>('#checkin').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      void this.saveVisit(form, airport, this.visits.find(visit => visit.id === form.dataset.editId));
    });
    detail.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(button => button.addEventListener('click', () => { this.renderDetail(this.visits.find(v => v.id === button.dataset.edit)); this.el<HTMLInputElement>('[name="date"]').focus(); }));
    detail.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(button => button.addEventListener('click', () => void this.deleteVisit(button.dataset.delete!)));
  }

  private async saveVisit(form: HTMLFormElement, airport: AirportDefinition, edit?: CheckIn) {
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    if (button.disabled) return;
    this.el('#save-status').classList.remove('sr-only');
    const data = new FormData(form);
    const date = String(data.get('date'));
    if (!isCalendarDate(date) || date > localDate()) { this.el('#save-status').textContent = 'Choose a valid date today or earlier.'; return; }
    button.disabled = true;
    const now = new Date().toISOString();
    try {
      await this.store.save({ id: edit?.id ?? visitId(), programId: this.program.id, airportId: airport.id, visitedAt: date, timeKnown: false, createdAt: edit?.createdAt ?? now, updatedAt: now, notes: String(data.get('notes')).slice(0, 10000), verification: { status: 'unverified' } });
      this.visits = await this.store.list(); this.render();
      if (this.selected?.id === airport.id) {
        this.renderDetail();
        this.confirmVisit('Visit saved on this device.');
      }
    } catch { if (button.isConnected) this.el('#save-status').textContent = 'Could not save. Your browser may be out of storage. Your entries are still in the form; export existing visits and try again.'; }
    finally { button.disabled = false; }
  }

  private async deleteVisit(id: string) {
    if (!window.confirm('Delete this visit from this device? This cannot be undone.')) return;
    const form = this.el<HTMLFormElement>('#checkin');
    const detail = this.el('#detail');
    const scrollTop = detail.scrollTop;
    const deleteButton = Array.from(detail.querySelectorAll<HTMLButtonElement>('[data-delete]')).find(button => button.dataset.delete === id);
    const article = deleteButton?.closest('article');
    const articleHeight = article?.getBoundingClientRect().height ?? 0;
    const focusTarget = article?.nextElementSibling?.querySelector<HTMLButtonElement>('[data-delete]')
      ?? article?.previousElementSibling?.querySelector<HTMLButtonElement>('[data-delete]')
      ?? this.el('#history-heading');
    if (deleteButton) deleteButton.disabled = true;
    try {
      await this.store.delete(id);
      this.visits = await this.store.list(); this.render();
      if (form.isConnected) {
        if (article) {
          const confirmation = document.createElement('div');
          confirmation.className = 'deleted-visit';
          confirmation.style.height = `${articleHeight}px`;
          article.replaceWith(confirmation);
          confirmation.append(article);
          const actions = article.querySelector('div')!;
          actions.replaceChildren();
          actions.setAttribute('role', 'status');
          const message = document.createElement('button');
          message.type = 'button';
          message.disabled = true;
          actions.append(message);
          message.textContent = 'Visit deleted';
          setTimeout(() => {
            if (!confirmation.isConnected) return;
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const animation = confirmation.animate([
              { height: `${articleHeight}px`, opacity: 1 },
              { height: '0px', opacity: 0 },
            ], { duration: reducedMotion ? 0 : 250, easing: 'ease-out', fill: 'forwards' });
            void animation.finished.then(() => {
              const history = confirmation.parentElement;
              confirmation.remove();
              if (history?.isConnected && !history.children.length) history.innerHTML = '<p class="muted">Your first visit is still ahead of you.</p>';
            });
          }, 4000);
        }
        const count = this.visits.filter(visit => visit.airportId === this.selected?.id).length;
        this.el('#visit-count').textContent = String(count);
        if (form.dataset.editId === id) {
          form.dataset.editId = '';
          form.querySelector('h3')!.textContent = 'Add a visit';
          form.querySelector('button[type="submit"]')!.textContent = 'Save check-in';
        }
        focusTarget?.focus({ preventScroll: true });
        detail.scrollTop = scrollTop;
      }
    }
    catch {
      const status = this.el('#save-status');
      if (status) { status.classList.remove('sr-only'); status.textContent = 'Could not delete this visit. Please try again.'; }
      else this.announce('Could not delete this visit. Please try again.');
    }
    finally { if (deleteButton?.isConnected) deleteButton.disabled = false; }
  }

  /** Short confirmations expire; pending work and actionable errors remain visible. */
  private feedback(selector: string, message: string, transient = false) {
    if (this.events.signal.aborted) return;
    const status = this.el(selector);
    clearTimeout(this.feedbackTimers.get(status));
    this.feedbackTimers.delete(status);
    status.textContent = message;
    if (transient) this.feedbackTimers.set(status, setTimeout(() => {
      status.textContent = '';
      this.feedbackTimers.delete(status);
    }, 5000));
  }

  private async export(statusSelector: string, buttonSelector: string) {
    const button = this.el<HTMLButtonElement>(buttonSelector);
    if (button.disabled) return;
    this.feedback(statusSelector, 'Preparing backup...');
    button.disabled = true;
    try {
      const backup: PassportBackup = { format: 'aviation-passport', schemaVersion: 1, programId: this.program.id, exportedAt: new Date().toISOString(), checkIns: await this.store.list(), attachments: [] };
      if (this.events.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `${this.program.id}-passport.json`;
      try { link.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 10000); }
      this.feedback(statusSelector, 'Backup prepared. Save the file from your browser to keep a copy of your visits.', true);
    } catch { this.feedback(statusSelector, 'Could not prepare your backup. Check browser storage permissions and try again.'); }
    finally { button.disabled = false; }
  }

  private noImportSelection() {
    this.feedback('#passport-notice', 'No file selected. Try Import again. If the chooser stays closed, save unfinished visits before reloading.', true);
  }

  private async import(input: HTMLInputElement) {
    const button = this.el<HTMLButtonElement>('#import-button');
    if (button.disabled) return;
    const file = input.files?.[0];
    if (!file) { this.noImportSelection(); return; }
    this.feedback('#passport-notice', 'Importing passport...');
    button.disabled = true;
    let merged = false;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose a JSON backup smaller than 5 MB.');
      const backup = validateBackup(JSON.parse(await file.text()), this.program);
      const count = await this.store.merge(backup.checkIns);
      merged = true;
      this.visits = await this.store.list();
      if (this.events.signal.aborted) return;
      this.render(); if (this.selected) this.renderDetail();
      this.feedback('#passport-notice', `Imported ${count} visits. Existing visits were preserved.`, true);
    } catch (error) {
      const message = merged ? 'Visits were imported, but could not be displayed. Reload to try again.'
        : error instanceof DOMException ? 'Could not read the backup or save visits. Check file access and browser storage permissions, or try a regular browser tab.'
        : error instanceof SyntaxError ? 'This file is not valid JSON. Choose a passport backup.'
        : error instanceof Error ? error.message : 'Import failed. Try again with a passport backup.';
      this.feedback('#passport-notice', message);
    } finally { input.value = ''; button.disabled = false; }
  }

  async destroy() { for (const timer of this.feedbackTimers.values()) clearTimeout(timer); this.feedbackTimers.clear(); clearTimeout(this.saveNoticeTimer); this.events.abort(); this.resize?.disconnect(); this.unsubscribeMap?.(); this.offlineUI?.destroy(); this.offline?.close(); this.map?.remove(); await this.offline?.storage.close(); await this.store.close(); this.root.replaceChildren(); this.root.classList.remove('passport-app'); }
}
