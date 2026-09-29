import { LocationCheckIn, locationIcon } from './check-in.js';
import { calendarDate, visitLocationLabel } from './geolocation.js';
import { appearanceButton } from './header-icons.js';
import { PassportCollection } from './passport-collection.js';
import { collectionDates, collectionChanges, reconcileOrders, visitStampLabel } from './collection.js';
import { confirmCollection, chooseEarlierVisit } from './visit-ui.js';
import type { PassportSnapshot } from './persistence.js';
import { OfflineAccess, offlineCard, offlineNavigation, type InstallationGuidance } from './offline-access.js';
import { PassportMap } from './map/renderer.js';
import { OfflineMapManager, browserMapEnvironment } from './map/offline/manager.js';
import { IndexedMapStorage } from './map/offline/storage.js';
import { calculateProgress, filterAirports, isCalendarDate, validateBackup, validateProgram } from './domain.js';
import { PassportStore } from './persistence.js';
import type { AirportDefinition, AirportFilters, CheckIn, PassportBackup, PassportProgram } from './models.js';

const escape = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const airportLabel = (airport: Pick<AirportDefinition, 'id' | 'identifiers'>): string => airport.identifiers?.faa?.trim() || airport.id;
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
  private snapshot: PassportSnapshot = { visits: [], orders: [], revision: 0 };
  private collection?: PassportCollection;
  private locationCheckIn?: LocationCheckIn;
  private exploreDrafts = new Map<string, { id: string; date: string; notes: string; revision: number }>();
  private detailEditors = new Set<string>();
  private detailSections = new Map<string, Set<string>>();
  private selected?: Omit<AirportDefinition, 'location'> & { location?: AirportDefinition['location'] };
  private passportReturn?: { id: string; top: number };
  private filters: AirportFilters = { query: '', regionId: '', visited: 'all' };
  private events = new AbortController();
  private resize?: ResizeObserver;
  private lastFocus?: HTMLElement;
  private passportOpen = false;
  private followInitialMapLayout = true;
  private previewOnly = false;
  private feedbackTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  constructor(private options: { program: PassportProgram; offlineShellReady?: () => Promise<boolean>; installationGuidance?: () => InstallationGuidance }) {
    validateProgram(options.program);
    this.store = new PassportStore(options.program.id);
  }
  private get program() { return this.options.program; }
  private maxVisitDate() { return this.program.checkIn ? [localDate(), calendarDate(Date.now(), this.program.checkIn.timeZone)].sort().at(-1)! : localDate(); }
  private el<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private announce(message: string) {
    this.feedback(this.passportOpen ? '#passport-notice' : '#notice', message);
  }

  async mount(target: string): Promise<void> {
    const root = document.querySelector<HTMLElement>(target);
    if (!root) throw new Error(`Mount target not found: ${target}`);
    this.root = root;
    this.root.inert = true;
    this.root.setAttribute('aria-busy','true');
    this.root.classList.add('passport-app');
    const p = this.program;
    this.root.innerHTML = `
      <a class="skip-link" href="#airport-list">Skip to airports</a>
      <header class="app-header"><div class="brand"><span class="brand-icon" aria-hidden="true">✈</span><div><span class="eyebrow">${escape(p.branding.eyebrow)}</span><h1>${escape(p.shortName)}</h1></div></div>
      <div id="overall" class="overall"></div><div class="header-actions">${appearanceButton}${offlineNavigation}</div></header>
      <div class="workspace" data-view="map" data-section="explore"><aside class="sidebar" aria-label="Passport navigation and airport explorer">
      <div class="checkin-nav"><div class="primary-tabs" role="tablist" aria-label="Main view"><button id="explore-tab" role="tab" type="button" aria-selected="true" aria-controls="explore-panel">Explore</button><button id="passport-tab" role="tab" type="button" aria-selected="false" aria-controls="passport-panel" tabindex="-1">My passport</button></div>${p.checkIn ? `<button id="quick-checkin" class="checkin-action" type="button">${locationIcon}Check in</button>` : ''}</div>
      <p id="notice" role="status" aria-live="polite"></p>
      <section id="explore-panel" class="explore-panel" role="tabpanel" aria-labelledby="explore-tab">
      <div class="browse"><div class="section-heading"><h2>Explore airports</h2><span id="match-count" class="count"></span></div>
      <label class="search-label"><span class="sr-only">Search airports</span><input id="search" type="search" placeholder="Search airport name or identifier"></label>
      <div class="filter-row"><label>Region<select id="region"><option value="">All regions</option>${p.regions.map(r => `<option value="${escape(r.id)}">${escape(r.name)}</option>`).join('')}</select></label><label>Passport<select id="visited"><option value="all">All airports</option><option value="unvisited">Not visited</option><option value="visited">Visited</option></select></label></div>
      <div class="mobile-toggle" aria-label="Airport view"><button type="button" data-view="map" aria-pressed="true">Map</button><button type="button" data-view="list" aria-pressed="false">List</button></div>
      <div id="airport-list" tabindex="-1" class="airport-list"></div></div><section id="detail" class="detail" hidden aria-label="Airport details"></section></section>
      <section id="passport-panel" class="passport-panel" role="tabpanel" hidden aria-labelledby="passport-tab"><div class="passport-content"><p>${escape(p.description)}</p><p class="local-label">Saved on this device</p><div class="backup-actions"><button id="export" type="button" aria-describedby="export-status">Export passport</button><button id="import-button" type="button" aria-describedby="passport-notice">Import passport</button><input id="import" type="file" accept="application/json,.json" hidden></div><p id="export-status" class="export-feedback" role="status" aria-live="polite"></p><p id="passport-notice" role="status" aria-live="polite"></p><section class="passport-section"><h3>Your regional passport</h3><div id="passport-collection"></div></section><p class="data-notice">${escape(p.dataNotice)}</p><p><a href="${escape(new URL('./notices.txt',import.meta.url).href)}" target="_blank" rel="noopener">Software licenses</a></p></div></section>
      </aside><section class="map-section" aria-label="Airport map"><div id="map"></div><section id="airport-preview" class="airport-preview" hidden aria-label="Selected airport"><div><strong id="preview-name"></strong><p id="preview-meta"></p></div><div class="preview-actions"><button id="preview-details" type="button">View details</button><button id="preview-close" type="button" aria-label="Dismiss airport preview">Close</button></div></section><div class="map-caption"><div class="map-legend"><span class="map-legend-item"><span class="map-legend-marker" aria-hidden="true"></span>Not visited</span><span class="map-legend-item"><span class="map-legend-marker is-visited" aria-hidden="true"></span>Visited</span></div><button id="fit" type="button">Show all matches</button></div></section></div>
      ${offlineCard}`;
    if (p.checkIn) {
      this.locationCheckIn = new LocationCheckIn(this.root, p, {
        snapshot: () => this.snapshot, save: (visit, revision) => this.saveRecord(visit, revision),
        saved: airport => { this.feedback(this.passportOpen ? '#passport-notice' : '#notice', 'Visit saved at ' + airport.name + '.', true); if (this.selected?.id === airport.id && !this.exploreDrafts.has(airport.id) && !this.el<HTMLFormElement>('#checkin')?.dataset.editId) { this.renderDetail(); this.feedback('#visit-save-confirmation', 'Visit saved on this device.', true); this.el('#open-visit-editor').focus({preventScroll:true}); } },
      });
      this.el('#quick-checkin').addEventListener('click', () => this.locationCheckIn?.open(undefined, this.el('#quick-checkin')));
    }
    this.collection = new PassportCollection(this.el('#passport-collection'), p, {
      order: async (order, revision) => { try { await this.store.saveOrder(order, revision); } catch (error) { await this.reloadPassport(); throw error; } await this.reloadPassport(); this.render(); },
      showDetails: id => {
        const airport = p.airports.find(a => a.id === id) ?? {
          id, name: id, regionId: '', description: 'Airport information is no longer available in the program data.', participation: { participating: false },
        };
        if (!filterAirports(p, this.visits, this.filters).some(a => a.id === id)) {
          this.filters = { query: '', regionId: '', visited: 'all' };
          for (const selector of ['#search', '#region']) this.el<HTMLInputElement>(selector).value = '';
          this.el<HTMLSelectElement>('#visited').value = 'all';
        }
        this.select(airport, false, true);
      },
      explore: () => this.setPassportOpen(false),
    });
    window.addEventListener('focus', () => { void this.reloadPassport().then(() => this.render()).catch(() => {}); }, { signal: this.events.signal });
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
      if ((event.target as HTMLElement).closest('dialog[open]')) return;
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
    try { await this.reloadPassport(); this.el('#offline-visits').textContent = 'Passport storage: available on this device.'; }
    catch (error) { this.el('#offline-visits').textContent = 'Passport storage: unavailable.'; this.announce(error instanceof Error ? error.message : 'Device storage could not be opened. Check browser storage permissions before saving visits.'); }
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
    this.rememberExploreDraft();
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
    for (const selector of ['.app-header', '.offline-navigation', '#offline-card', '.map-section', '#notice', '.skip-link', '.checkin-nav']) this.el(selector).inert = modal;
    this.el('.browse').inert = this.passportOpen || (mobile && !!this.selected && !this.previewOnly);
    this.el('#detail').inert = this.passportOpen;
    const detail = this.el('#detail');
    if (modal) { detail.setAttribute('role', 'dialog'); detail.setAttribute('aria-modal', 'true'); }
    else { detail.removeAttribute('role'); detail.removeAttribute('aria-modal'); }
  }

  private setupTheme() {
    const button = this.el<HTMLButtonElement>('#appearance-trigger');
    let preference = 'system';
    try { preference = localStorage.getItem(`passport:${this.program.id}:theme`) ?? localStorage.getItem('passport:theme') ?? 'system'; } catch { /* Preference storage is optional. */ }
    if (!['system','light','dark'].includes(preference)) preference = 'system';
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference === 'dark' ? 'dark' : 'light';
      button.title = theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance';
      button.setAttribute('aria-label', button.title);
      document.documentElement.dataset.theme = theme;
      const colors = this.program.branding.themes?.[theme];
      const accent = colors?.accent ?? (theme === 'light' ? this.program.branding.accent : undefined);
      if (accent) this.root.style.setProperty('--accent', accent); else this.root.style.removeProperty('--accent');
      if (colors) this.root.style.setProperty('--on-accent', colors.onAccent); else this.root.style.removeProperty('--on-accent');
      this.updateBasemap();
    };
    apply();
    media.addEventListener('change', apply, { signal: this.events.signal });
    button.addEventListener('click', () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      apply();
      try { localStorage.setItem(`passport:${this.program.id}:theme`, preference); } catch { /* Still usable this session. */ }
    }, { signal: this.events.signal });
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
    const retired = p.airports.find(a => a.id === this.selected?.id && !a.participation.participating);
    const mapAirports = retired ? [...airports, retired] : airports;
    const markerPositions = mapAirports.map(airport => ({ id: airport.id, point: this.map.latLngToContainerPoint([airport.location.latitude, airport.location.longitude]) }));
    const candidates = mapAirports.filter(airport => {
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
    this.map.airports(mapAirports, p.regions, visited, this.selected?.id, compact, visibleLabels);
    const progress = calculateProgress(p, this.visits);
    this.el('#overall').innerHTML = `<div><strong>${progress.visited}<span> / ${progress.total}</span></strong><span>airports visited</span></div><progress aria-label="Overall progress" value="${progress.visited}" max="${progress.total || 1}"></progress>`;
  }

  private select(airport: NonNullable<PassportApp['selected']>, fromMap = false, fromPassport = false) {
    this.passportReturn = fromPassport ? { id: airport.id, top: this.el('.passport-content').scrollTop } : undefined;
    if (this.passportOpen) this.setPassportOpen(false, false);
    if (!this.selected) this.lastFocus = document.activeElement as HTMLElement;
    this.rememberExploreDraft();
    this.selected = airport;
    if (fromMap && airport.location && matchMedia('(max-width: 760px)').matches) {
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
    if (airport.location) this.map.panTo([airport.location.latitude, airport.location.longitude]);
    this.render();
    this.renderDetail();
    this.el<HTMLButtonElement>('#close-detail').focus();
  }

  private closeDetail(restoreFocus = true) {
    this.rememberExploreDraft();
    const returnTo = this.passportReturn; this.passportReturn = undefined;
    this.selected = undefined;
    this.previewOnly = false;
    this.el('#airport-preview').hidden = true;
    this.el('.map-section').classList.remove('has-preview');
    this.el('#detail').hidden = true;
    this.el('.browse').hidden = false;
    this.render();
    this.syncPanels();
    if (restoreFocus && returnTo) { this.setPassportOpen(true, false); this.collection?.restoreFocus(returnTo.id, returnTo.top); return; }
    if (!restoreFocus) this.el('#map').focus({ preventScroll: true });
    else if (this.lastFocus?.isConnected) this.lastFocus.focus(); else this.el('#search').focus();
  }

  private renderDetail(edit?: CheckIn) {
    this.previewOnly = false;
    this.el('#airport-preview').hidden = true;
    this.el('.map-section').classList.remove('has-preview');
    const airport = this.selected!;
    const region = this.program.regions.find(r => r.id === airport.regionId) ?? { name: 'Region unavailable', color: '#666666' };
    const detail = this.el('#detail');
    detail.hidden = false;
    this.syncPanels();
    this.el('.browse').hidden = true;
    const visits = this.visits.filter(v => v.airportId === airport.id).sort((a, b) => a.visitedAt.localeCompare(b.visitedAt) || (a.capturedAt ?? '').localeCompare(b.capturedAt ?? ''));
    const stampDate = collectionDates(visits).get(airport.id);
    const draft = edit ? undefined : this.exploreDrafts.get(airport.id);
    const sections = this.detailSections.get(airport.id) ?? new Set<string>();
    this.detailSections.set(airport.id, sections);
    const editorOpen = !!edit || !!draft || this.detailEditors.has(airport.id);
    if (editorOpen) this.detailEditors.add(airport.id);
    detail.innerHTML = `<button id="close-detail" type="button" class="back-button">← ${this.passportReturn ? 'Back to My Passport' : 'All airports'}</button><header class="airport-overview"><h2>${escape(airport.name)}</h2><p class="airport-identity"><span>${escape(airportLabel(airport))}</span><span class="airport-region" style="--region:${region.color}"><span class="region-dot" aria-hidden="true"></span>${escape(region.name)}</span></p><p id="airport-visit-summary" class="muted">${stampDate ? 'Visited &middot; Stamp collected ' + stampDate : visits.length ? 'Visited &middot; No stamp recorded' : 'Not visited yet'}</p></header>
    ${!airport.participation.participating ? '<p class="airport-caution participation-notice">' + (airport.location ? 'No longer part of the program. Visits remain available but do not count toward current program completion.' : 'Airport information is unavailable. Saved visits remain accessible, but no map location can be shown and they do not count toward current program completion.') + '</p>' : ''}
    ${airport.cautions?.map(c => `<p class="airport-caution">${escape(c)}</p>`).join('') ?? ''}
    <details class="airport-information detail-disclosure" data-detail-section="information" ${sections.has('information') ? 'open' : ''}><summary>Airport information</summary><p>${escape(airport.description)}</p>${airport.address ? `<p class="airport-address">${escape(airport.address)}</p>` : ''}

    ${airport.runways?.length ? `<h3>Runways</h3>${airport.runways.map(r => `<p>${escape(r.name)} · ${r.lengthFeet ? `${r.lengthFeet.toLocaleString()} ft` : 'Length unknown'} · ${escape(r.surface ?? 'Surface unknown')}${r.closed ? ' · Closed in source' : ''}</p>`).join('')}` : ''}
    ${airport.sources?.length ? `<p class="airport-sources">Sources: ${airport.sources.map(s => `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.name)}</a> (${escape(s.retrievedAt)})`).join(' · ')}</p>` : ''}
</details>
    <details class="airport-stamps detail-disclosure" data-detail-section="stamps" ${sections.has('stamps') ? 'open' : ''}><summary>Stamp locations</summary>${airport.stampLocations?.length ? airport.stampLocations.map(s => `<article class="stamp"><strong>${escape(s.name)}</strong><small>Access: ${escape(s.access.replace('-', ' '))}</small>${s.description.length > 360 ? `<p>${escape(s.description.slice(0, 180))}&hellip;</p><details class="stamp-instructions"><summary>Show full instructions</summary><p>${escape(s.description)}</p></details>` : `<p>${escape(s.description)}</p>`}</article>`).join('') : '<p>Stamp details have not been added.</p>'}
</details>
    <details class="detail-disclosure" id="visit-history" data-detail-section="history" ${sections.has('history') ? 'open' : ''}><summary id="history-heading">Visit history <span id="visit-count" class="muted">${visits.length}</span></summary><div class="history">${visits.length ? visits.map(v => `<article><strong>${escape(v.visitedAt)}</strong><small>${escape(visitLocationLabel(v))} &middot; ${visitStampLabel(v, stampDate)}</small><p>${escape(v.notes || 'No notes for this visit.')}</p><div><button type="button" data-edit="${escape(v.id)}">Edit</button><button type="button" data-delete="${escape(v.id)}">Delete</button></div></article>`).join('') : '<p class="muted">Your first visit is still ahead of you.</p>'}</div></details>
    <button type="button" id="open-visit-editor" class="primary" ${this.program.checkIn && airport.participation.participating ? 'aria-haspopup="dialog"' : `aria-controls="checkin" aria-expanded="${editorOpen}"`} ${editorOpen ? 'hidden' : ''}>${visits.length ? 'Add another visit' : 'Record a visit'}</button>
    <p id="visit-save-confirmation" role="status" class="muted"></p>
    <form id="checkin" ${editorOpen ? '' : 'hidden'} data-edit-id="${escape(edit?.id ?? draft?.id ?? '')}" data-revision="${draft?.revision ?? this.snapshot.revision}"><h3>${edit || draft?.id ? 'Edit visit' : 'Add a visit'}</h3><label>Visit date<input name="date" type="date" required max="${this.maxVisitDate()}" value="${edit?.visitedAt ?? draft?.date ?? localDate()}"></label><label>Notes <span class="muted">(optional)</span><textarea name="notes" rows="3" maxlength="10000" placeholder="A good landing, a great lunch…">${escape(edit?.notes ?? draft?.notes ?? '')}</textarea></label><p class="muted">${edit?.timeKnown ? 'Changing only notes keeps the captured location and time. Changing the date removes that evidence after confirmation.' : 'Saved locally as an unverified visit. Time is not recorded.'}</p><div class="visit-actions"><button class="primary" type="submit">${edit || draft?.id ? 'Save changes' : 'Save check-in'}</button><button type="button" id="cancel-visit-draft">Cancel draft</button></div><p id="save-status" role="status"></p></form>`;
    detail.querySelectorAll<HTMLDetailsElement>('[data-detail-section]').forEach(section => section.addEventListener('toggle', () => {
      if (!section.isConnected) return;
      if (section.open) sections.add(section.dataset.detailSection!); else sections.delete(section.dataset.detailSection!);
    }));
    const openManualVisit = () => {
      this.detailEditors.add(airport.id); this.el('#checkin').hidden = false;
      this.el('#open-visit-editor').hidden = true; this.el('#open-visit-editor').setAttribute('aria-expanded', 'true');
      this.el<HTMLInputElement>('#checkin [name="date"]').focus();
    };
    this.el('#open-visit-editor').addEventListener('click', () => {
      const target = this.program.airports.find(a => a.id === airport.id && a.participation.participating);
      if (this.locationCheckIn && target) this.locationCheckIn.open(target, this.el('#open-visit-editor'));
      else openManualVisit();
    });
    this.el('#cancel-visit-draft').addEventListener('click', () => { void (async () => {
      const button = this.el<HTMLButtonElement>('#cancel-visit-draft'); button.disabled = true;
      try {
        const form = this.el<HTMLFormElement>('#checkin'), values = new FormData(form);
        const original = this.visits.find(v => v.id === form.dataset.editId);
        const changed = String(values.get('date')) !== (original?.visitedAt ?? localDate()) || String(values.get('notes')) !== (original?.notes ?? '');
        if (changed && !await confirmCollection(this.root, 'Your unsaved visit changes will be discarded. Saved visits will stay unchanged.', 'Discard draft', 'Discard visit draft?')) return;
        this.exploreDrafts.delete(airport.id); this.detailEditors.delete(airport.id); this.renderDetail();
        this.el('#open-visit-editor').focus();
      } finally { button.disabled = false; }
    })(); });
    this.el('#checkin').addEventListener('input', () => this.rememberExploreDraft());
    this.el('#close-detail').addEventListener('click', () => this.closeDetail());
    this.el<HTMLFormElement>('#checkin').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      void this.saveVisit(form, airport, this.visits.find(visit => visit.id === form.dataset.editId));
    });
    detail.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(button => button.addEventListener('click', () => {
      const form = this.el<HTMLFormElement>('#checkin');
      const values = new FormData(form);
      const original = this.visits.find(v => v.id === form.dataset.editId);
      if (String(values.get('date')) !== (original?.visitedAt ?? localDate()) || String(values.get('notes')) !== (original?.notes ?? '')) {
        const status = this.el('#save-status'); status.classList.remove('sr-only');
        status.textContent = 'Save or cancel your current draft before editing another visit.';
        return;
      }
      this.exploreDrafts.delete(airport.id);
      this.renderDetail(this.visits.find(v => v.id === button.dataset.edit));
      this.el<HTMLInputElement>('#checkin [name="date"]').focus();
    }));
    detail.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(button => button.addEventListener('click', () => void this.deleteVisit(button.dataset.delete!)));
  }

  private async saveVisit(form: HTMLFormElement, airport: NonNullable<PassportApp['selected']>, edit?: CheckIn) {
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    if (form.hidden || button.disabled) return;
    this.el('#save-status').classList.remove('sr-only');
    const data = new FormData(form);
    const date = String(data.get('date'));
    if (!isCalendarDate(date) || date > this.maxVisitDate()) { this.el('#save-status').textContent = 'Choose a valid date today or earlier.'; return; }
    button.disabled = true;
    const now = new Date().toISOString();
    try {
      if (edit?.timeKnown && edit.visitedAt !== date && !await confirmCollection(this.root, 'Changing the visit date removes its captured time and location confirmation. The corrected visit will be manual.', 'Change date', 'Remove location evidence?')) return;
      const keepEvidence = edit?.timeKnown && edit.visitedAt === date;
      const saved = await this.saveRecord({ id: edit?.id ?? visitId(), programId: this.program.id, airportId: airport.id, visitedAt: date, timeKnown: !!keepEvidence, createdAt: edit?.createdAt ?? now, updatedAt: now, notes: String(data.get('notes')).slice(0, 10000), verification: keepEvidence ? edit.verification : { status: 'unverified' }, ...(keepEvidence ? {capturedAt:edit.capturedAt,timeZone:edit.timeZone} : {}) }, Number(form.dataset.revision));
      if (!saved) return;
      this.exploreDrafts.delete(airport.id);
      this.detailEditors.delete(airport.id);
      this.render();
      if (this.selected?.id === airport.id) {
        this.detailSections.get(airport.id)?.add('history');
        this.renderDetail();
        this.feedback('#visit-save-confirmation', 'Visit saved on this device.', true);
        this.el('#open-visit-editor').focus({ preventScroll: true });
      }
    } catch (error) { if (button.isConnected) this.el('#save-status').textContent = error instanceof Error ? error.message : 'Could not save. Your entries are still in the form; check device storage and try again.'; }
    finally { button.disabled = false; }
  }

  private async deleteVisit(id: string) {
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
      if (!await this.deleteRecord(id, this.snapshot.revision)) return;
      this.render();
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
        const stampDate = collectionDates(this.visits).get(this.selected!.id);
        this.el('#airport-visit-summary').textContent = stampDate ? 'Visited - Stamp collected ' + stampDate : count ? 'Visited - No stamp recorded' : 'Not visited yet';
        this.el('#open-visit-editor').textContent = count ? 'Add another visit' : 'Record a visit';
        detail.querySelectorAll<HTMLElement>('.history article').forEach(row => {
          const visitId = row.querySelector<HTMLElement>('[data-edit]')?.dataset.edit;
          const visit = this.visits.find(v => v.id === visitId);
          if (visit) row.querySelector('small')!.textContent = visitLocationLabel(visit) + ' - ' + visitStampLabel(visit, stampDate);
        });
        if (form.dataset.editId === id) {
          form.dataset.editId = '';
          form.querySelector('h3')!.textContent = 'Add a visit';
          form.querySelector('button[type="submit"]')!.textContent = 'Save check-in';
        }
        focusTarget?.focus({ preventScroll: true });
        form.dataset.revision = String(this.snapshot.revision);
        this.rememberExploreDraft();
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
      const state = await this.store.snapshot();
      const backup: PassportBackup = { format: 'aviation-passport', schemaVersion: 4, programId: this.program.id, exportedAt: new Date().toISOString(), checkIns: state.visits, orders: reconcileOrders(state.visits, state.visits, state.orders), attachments: [] };
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
      const state = await this.store.snapshot();
      const existing = new Set(state.visits.map(v => v.id));
      const incoming = [...state.visits, ...backup.checkIns.filter(v => !existing.has(v.id))];
      const changes = collectionChanges(state.visits, incoming);
      const conflicts = (backup.orders ?? []).filter(o => o.confirmed && state.orders.some(local => local.date === o.date && local.confirmed && JSON.stringify(local.airportIds) !== JSON.stringify(o.airportIds)));
      if ((changes.length || conflicts.length) && !await confirmCollection(this.root, [...changes, conflicts.length ? 'Conflicting imported orders will keep your confirmed local sequence. Additional stamps are appended with order unconfirmed.' : '', 'Existing visits will be kept.'].filter(Boolean).join('\n'), 'Import and keep local order')) {
        this.feedback('#passport-notice', 'Import cancelled. Your passport is unchanged.', true); return;
      }
      const count = await this.store.merge(backup.checkIns, backup.orders ?? [], state.revision);
      merged = true;
      await this.reloadPassport();
      if (this.events.signal.aborted) return;
      this.rememberExploreDraft(); this.render(); if (this.selected && !this.previewOnly) this.renderDetail();
      this.feedback('#passport-notice', `Imported ${count} visits. Existing visits were preserved.`, true);
    } catch (error) {
      const message = merged ? 'Visits were imported, but could not be displayed. Reload to try again.'
        : error instanceof DOMException ? 'Could not read the backup or save visits. Check file access and browser storage permissions, or try a regular browser tab.'
        : error instanceof SyntaxError ? 'This file is not valid JSON. Choose a passport backup.'
        : error instanceof Error ? error.message : 'Import failed. Try again with a passport backup.';
      this.feedback('#passport-notice', message);
    } finally { input.value = ''; button.disabled = false; }
  }

  private rememberExploreDraft() {
    const form = this.el<HTMLFormElement>('#checkin');
    if (!form || form.hidden || !this.selected || this.previewOnly) return;
    const values = new FormData(form);
    const original = this.visits.find(v => v.id === form.dataset.editId);
    if (!original && String(values.get('date')) === localDate() && !String(values.get('notes'))) { this.exploreDrafts.delete(this.selected.id); return; }
    this.exploreDrafts.set(this.selected.id, { id: form.dataset.editId ?? '', date: String(values.get('date')), notes: String(values.get('notes')), revision: Number(form.dataset.revision) });
  }

  private async reloadPassport() {
    const next = await this.store.snapshot();
    if (next.revision < this.snapshot.revision) return;
    for (const [id, draft] of this.exploreDrafts) {
      if (draft.revision === this.snapshot.revision && JSON.stringify(this.visits.filter(v => v.airportId === id)) === JSON.stringify(next.visits.filter(v => v.airportId === id))) draft.revision = next.revision;
    }
    const form = this.el<HTMLFormElement>('#checkin');
    if (form && this.selected && Number(form.dataset.revision) === this.snapshot.revision && JSON.stringify(this.visits.filter(v => v.airportId === this.selected!.id)) === JSON.stringify(next.visits.filter(v => v.airportId === this.selected!.id))) form.dataset.revision = String(next.revision);
    this.snapshot = next; this.visits = next.visits;
    this.collection?.update(this.snapshot);
  }

  private async saveRecord(visit: CheckIn, revision: number): Promise<boolean> {
    if (!isCalendarDate(visit.visitedAt) || visit.visitedAt > (visit.timeKnown && visit.timeZone ? calendarDate(Date.now(), visit.timeZone) : this.program.checkIn ? [localDate(), calendarDate(Date.now(), this.program.checkIn.timeZone)].sort().at(-1)! : localDate())) throw new Error('Choose a valid date today or earlier.');
    const original = this.visits.find(v => v.id === visit.id);
    if (original?.historyOnly) visit.historyOnly = true;
    const sameDay = this.visits.filter(v => v.id !== visit.id && v.airportId === visit.airportId && v.visitedAt === visit.visitedAt);
    if (sameDay.length && original?.visitedAt !== visit.visitedAt) {
      const airport = this.program.airports.find(a => a.id === visit.airportId);
      const message = `You already have ${sameDay.length} visit${sameDay.length === 1 ? '' : 's'} recorded for ${airport?.name ?? visit.airportId} on ${visit.visitedAt}. Save another only if this was a separate visit. Your existing visits will be kept.`;
      if (!await confirmCollection(this.root, message, 'Save another visit', 'Another visit on the same day?')) return false;
    }
    const currentDate = collectionDates(this.visits).get(visit.airportId);
    const next = [...this.visits.filter(v => v.id !== visit.id), visit];
    const nextDate = collectionDates(next).get(visit.airportId);
    if (currentDate && nextDate && nextDate < currentDate) {
      const airport = this.program.airports.find(a => a.id === visit.airportId);
      // Keeping a date requires an unchanged stamp-eligible visit on that date.
      // Editing the stamp-collecting visit itself is a correction, not adding prior history.
      const canKeep = this.visits.some(v => v.id !== visit.id && v.airportId === visit.airportId && !v.historyOnly && v.visitedAt === currentDate);
      if (canKeep) {
        const choice = await chooseEarlierVisit(this.root, airport?.name ?? visit.airportId, currentDate, nextDate);
        if (choice === 'cancel') return false;
        if (choice === 'visit-only') visit.historyOnly = true;
      } else if (!await confirmCollection(this.root, `Correcting this visit will move the stamp collection date for ${airport?.name ?? visit.airportId} earlier, from ${currentDate} to ${nextDate}. To record a separate earlier visit without moving the stamp, cancel and choose Add another visit.`)) return false;
    } else {
      const changes = collectionChanges(this.visits, next);
      if (changes.length && !await confirmCollection(this.root, changes.join('\n') + '\nYour other visits will be kept.')) return false;
    }
    try { await this.store.save(visit, revision); } catch (error) { await this.reloadPassport(); throw error; } await this.reloadPassport(); this.render(); return true;
  }

  private async deleteRecord(id: string, revision: number): Promise<boolean> {
    const visit = this.visits.find(v => v.id === id);
    if (!visit) throw new Error('This visit is no longer available. Reload your passport to review the latest visits.');
    const airport = this.program.airports.find(a => a.id === visit.airportId);
    const remaining = this.visits.filter(v => v.id !== id);
    const oldDate = collectionDates(this.visits).get(visit.airportId);
    const nextDate = collectionDates(remaining).get(visit.airportId);
    const hasVisits = remaining.some(v => v.airportId === visit.airportId);
    const effect = nextDate
      ? oldDate === nextDate
        ? 'The stamp collection date will stay ' + nextDate + '. Another eligible visit remains on that date.'
        : 'The stamp collection date will move from ' + oldDate + ' to ' + nextDate + ', the earliest remaining eligible visit. Collection order will update to that date.'
      : hasVisits
        ? 'No stamp collection date will remain. The remaining visits were explicitly excluded from stamp collection. They will stay in your history, and this airport will still count as visited.'
        : 'No visits will remain for this airport. It will no longer count as visited, and it will have no collected stamp.';
    const message = 'Delete the visit to ' + (airport?.name ?? visit.airportId) + ' on ' + visit.visitedAt + '? ' + effect + ' This cannot be undone.';
    if (!await confirmCollection(this.root, message, 'Delete visit', 'Delete this visit?')) return false;
    await this.store.delete(id, revision); await this.reloadPassport(); this.render(); return true;
  }

  async destroy() { this.locationCheckIn?.destroy(); this.collection?.destroy(); for (const timer of this.feedbackTimers.values()) clearTimeout(timer); this.feedbackTimers.clear(); this.events.abort(); this.resize?.disconnect(); this.unsubscribeMap?.(); this.offlineUI?.destroy(); this.offline?.close(); this.map?.remove(); await this.offline?.storage.close(); await this.store.close(); this.root.replaceChildren(); this.root.classList.remove('passport-app'); }
}
