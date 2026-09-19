import type { OfflineMapManager, OfflineMapStatus } from './map/offline/manager.js';

export interface InstallationGuidance {
  steps: { text: string; shareIcon?: boolean }[];
  storageNote?: string;
}
export const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const share = '<svg class="share-icon" viewBox="0 0 24 28" aria-hidden="true"><path d="M5 11H3v14h18V11h-2M12 18V2m-5 5 5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const offlineNavigation = `<div class="offline-navigation"><button id="offline-access" type="button" aria-controls="offline-card" aria-expanded="false"><span><strong>Offline access</strong> · <span id="offline-summary">Checking map</span></span><progress id="offline-progress" aria-label="Map download" hidden></progress></button><button id="storage-protection" type="button" aria-label="Storage protection: Unknown" aria-controls="protection-details" hidden><svg viewBox="0 0 20 24" aria-hidden="true"><path d="M10 2 18 5v7c0 5-8 10-8 10S2 17 2 12V5Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><span id="offline-announcement" class="sr-only" role="status" aria-live="polite"></span></div>`;
export const offlineCard = `<section id="offline-card" class="offline-card" role="dialog" aria-labelledby="offline-heading" hidden>
  <header class="offline-card-heading"><h2 id="offline-heading" tabindex="-1">Offline access</h2><button id="offline-close" type="button">Close</button></header>
  <p class="offline-muted">Check your map and passport before travel.</p>
  <section id="offline-setup" class="offline-box offline-setup"><h3>Take your passport with you</h3><p id="installation-intro"></p><p id="installation-storage"></p><details class="offline-disclosure"><summary>Home Screen setup</summary><ol id="installation-steps"></ol><p>Keep the app open while your map downloads. Mobile data may be used.</p></details></section>
  <section class="offline-box"><h3 id="map-name"></h3><p id="map-size" class="offline-muted"></p><p id="map-status"></p><progress id="map-progress" aria-label="Map download" hidden></progress><p id="map-transfer-note">Includes map details, labels, and supporting files. Keep the app open; mobile data may be used.</p><p id="map-renderer-status" role="status" hidden></p><div class="backup-actions"><button id="map-download" type="button">Download map</button><button id="map-cancel" type="button" hidden>Cancel download</button><button id="map-retry" type="button" hidden>Try map again</button></div><details id="map-repair" class="offline-disclosure" hidden><summary>Repair options</summary><p>A replacement downloads the complete map again. Your visits stay unchanged; a working saved map is retained until its replacement is verified.</p><div class="backup-actions"><button id="map-replace" type="button">Download replacement</button><button id="map-rollback" type="button" hidden>Restore previous map</button></div></details></section>
  <div class="offline-row" id="offline-shell">Open app offline: not verified.</div><div class="offline-row">Airport information: loaded.</div><div class="offline-row" id="offline-visits">Passport storage: checking.</div>
  <details id="protection-details" class="offline-disclosure" hidden><summary id="protection-heading">Storage protection</summary><p id="protection-description"></p><div class="export-action"><button id="offline-export" type="button" aria-describedby="offline-export-status">Export passport</button><p id="offline-export-status" class="export-feedback" role="status" aria-live="polite"></p></div></details><p class="offline-muted">Visits are saved in this browser/app. Export a backup to transfer them. Maps are downloaded separately.</p>
</section>`;

/** Reusable presentation/orchestration; no program-specific assets or browser installation logic. */
export class OfflineAccess {
  private events = new AbortController();
  private unsubscribe: () => void;
  private opener?: HTMLElement;
  private rendererError = '';
  private refreshing?: Promise<void>;
  private closed = false;
  private announcedState = '';
  private media = matchMedia('(display-mode: standalone)');
  constructor(private root: HTMLElement, private manager: OfflineMapManager, private options: {
    programId: string; shellReady?: () => Promise<boolean>; guidance?: () => InstallationGuidance;
    retry: () => void; exportPassport: () => void;
  }) {
    this.unsubscribe = manager.subscribe(status => this.render(status));
    this.on('#offline-access', () => this.open());
    this.on('#offline-close', () => this.close());
    this.on('#storage-protection', () => this.open(true));
    this.on('#offline-export', options.exportPassport);
    this.on('#map-download', () => { void manager.download(); });
    this.on('#map-replace', () => { void manager.download(); });
    this.on('#map-cancel', () => manager.cancel());
    this.on('#map-retry', options.retry);
    this.on('#map-rollback', () => { void manager.rollback().catch(error => this.rendererStatus(String(error))); });
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !this.el('#offline-card').hidden && !this.el('#offline-card').inert) { event.preventDefault(); event.stopImmediatePropagation(); this.close(); }
    }, {capture:true,signal:this.events.signal});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.refresh(); }, {signal:this.events.signal});
    window.addEventListener('online', () => { void this.refresh(); }, {signal:this.events.signal});
    navigator.serviceWorker?.addEventListener('controllerchange', () => { void this.refresh(); }, {signal:this.events.signal});
    this.media.addEventListener('change', () => { this.guidance(); void this.manager.protection(true); void this.refresh(); }, {signal:this.events.signal});
    this.guidance();
  }
  private el<T extends HTMLElement = HTMLElement>(selector: string) { return this.root.querySelector<T>(selector)!; }
  private on(selector: string, fn: () => void) { this.el(selector).addEventListener('click', fn, {signal:this.events.signal}); }
  start() {
    const key = `passport:${this.options.programId}:offline-introduction:${standalone()?'app':'browser'}`;
    let seen = false;
    try { seen = localStorage.getItem(key) === 'seen'; localStorage.setItem(key,'seen'); } catch { /* Presentation only; transfer suppression uses the map storage abstraction. */ }
    if (!seen) this.open();
    void this.manager.protection(true);
    void this.refresh();
  }
  private refresh() {
    if (this.closed) return Promise.resolve();
    return this.refreshing ??= (async () => {
      await this.manager.protection();
      if (this.closed) return;
      await Promise.all([
        this.manager.prepare(standalone(), navigator.onLine).then(() => { if (!this.closed) this.options.retry(); }),
        (async () => {
          const ready = await this.options.shellReady?.().catch(() => false);
          if (!this.closed) this.el('#offline-shell').textContent = `Open app offline: ${ready ? 'available' : 'not verified; connect and reload'}.`;
        })(),
      ]);
    })().catch(() => { if (!this.closed) this.el('#map-status').textContent = 'Map storage could not be checked. Retry when browser storage is available.'; }).finally(() => { this.refreshing = undefined; });
  }
  open(protection = false) {
    const card = this.el('#offline-card');
    if (card.hidden) this.opener = document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement) ? document.activeElement : this.el('#offline-access');
    card.hidden = false;
    this.el('#offline-access').setAttribute('aria-expanded','true');
    this.el<HTMLDetailsElement>('#protection-details').open = protection;
    const heading = this.el(protection ? '#protection-heading' : '#offline-heading');
    heading.focus({preventScroll:true});
    if (protection) heading.scrollIntoView({block:'nearest'}); else card.scrollTop = 0;
  }
  close() {
    this.el('#offline-card').hidden = true;
    this.el('#offline-access').setAttribute('aria-expanded','false');
    (this.opener?.isConnected && this.opener.getClientRects().length ? this.opener : this.el('#offline-access')).focus({preventScroll:true});
  }
  rendererStatus(message: string) {
    if (message === this.rendererError || this.closed) return;
    this.rendererError = message;
    this.render(this.manager.status);
  }
  private guidance() {
    const installed = standalone();
    this.el('#offline-setup').hidden = installed;
    const total = (this.manager.status.total/1e6).toFixed(1);
    this.el('#installation-intro').textContent = `For the best experience, add this app to your Home Screen. Open it there and the offline map (${total} MB) should start downloading automatically.`;
    const guidance = this.options.guidance?.() ?? {steps:[{text:'Use your browser menu to install this app or add it to your Home Screen, if supported.'},{text:'Open the installed app while connected. An existing verified map is reused; otherwise the offline map should start downloading automatically.'}]};
    this.el('#installation-storage').textContent = guidance.storageNote ?? '';
    this.el('#installation-steps').replaceChildren(...guidance.steps.map(step => {
      const li = document.createElement('li'); li.textContent = step.text;
      if (step.shareIcon) li.insertAdjacentHTML('beforeend',share);
      return li;
    }));
  }
  private render(status: OfflineMapStatus) {
    const mb = (n: number) => (n/1e6).toFixed(1);
    const percent = Math.min(100,Math.floor(status.downloaded/status.total*100));
    const busy = ['checking','downloading','verifying'].includes(status.state);
    const transfer = status.state === 'downloading';
    const labels: Record<OfflineMapStatus['state'],string> = {checking:'Checking map',downloading:`Map download ${percent}%`,verifying:'Download complete - verifying map',installed:'Map available offline','not-downloaded':'Map not downloaded',waiting:'Waiting for connection',cancelled:'Download cancelled',failed:'Map needs attention','integrity-failed':'Map verification failed','insufficient-storage':'Not enough storage',missing:'Saved map is missing or unreadable'};
    const summary = !busy && status.active ? this.rendererError ? 'Saved map needs attention' : status.updateAvailable ? 'Map available offline · update available' : 'Map available offline' : labels[status.state];
    this.el('#offline-summary').textContent = summary;
    if (this.announcedState !== status.state) {
      this.announcedState = status.state;
      this.el('#offline-announcement').textContent = status.state === 'downloading' ? 'Map download started.' : labels[status.state];
    }
    this.el('#map-name').textContent = this.manager.advertised.name;
    this.el('#map-size').textContent = `Complete download: ${mb(status.total)} MB.`;
    this.el('#map-status').textContent = transfer ? `${percent}% · ${mb(status.downloaded)} / ${mb(status.total)} MB` : `${status.active?'Map available on this device. ':''}${labels[status.state]}. ${status.error ?? ''}${status.state==='cancelled'?' It will not restart automatically. Retry when ready.':''}${status.state==='waiting'?' Download will start when connected while the app is open.':''}${status.active&&status.updateAvailable?' Your saved map remains usable until an update is verified.':''}`;
    for (const id of ['#map-progress','#offline-progress']) {
      const progress = this.el<HTMLProgressElement>(id); progress.hidden = !transfer; progress.max = status.total; progress.value = status.downloaded;
    }
    const download = this.el<HTMLButtonElement>('#map-download');
    download.disabled = busy; download.hidden = !!status.active && !status.updateAvailable;
    download.textContent = status.updateAvailable ? `Update map (${mb(status.total)} MB)` : `${['failed','cancelled','missing','integrity-failed','insufficient-storage'].includes(status.state)?'Retry download':'Download map'} (${mb(status.total)} MB)`;
    this.el('#map-cancel').hidden = !['downloading','verifying','waiting'].includes(status.state);
    this.el('#map-retry').hidden = !this.rendererError || busy;
    const repair = this.el<HTMLDetailsElement>('#map-repair'); repair.hidden = busy || !(this.rendererError || status.active && status.state !== 'installed' || status.rollbackAvailable);
    if (repair.hidden) repair.open = false;
    this.el('#map-rollback').hidden = !status.rollbackAvailable;
    this.el('#map-renderer-status').hidden = !this.rendererError;
    this.el('#map-renderer-status').textContent = this.rendererError ? status.active ? 'Your map is saved, but it could not be displayed. Try opening it again before downloading a replacement.' : this.rendererError : '';
    const protection = this.el('#storage-protection'); protection.hidden = status.persistence === 'granted';
    const label = `Storage protection: ${status.persistence==='not-granted'?'Not protected':'Unknown'}`;
    protection.setAttribute('aria-label',label); protection.title = label;
    const details = this.el<HTMLDetailsElement>('#protection-details'); details.hidden = protection.hidden;
    if (details.hidden) details.open = false;
    this.el('#protection-description').textContent = status.persistence === 'not-granted' ? 'The browser has not granted storage protection. Your data is saved, but the browser may remove it to free space. Export your passport as a backup and check offline availability before travel. Installing may help; it does not guarantee approval.' : 'Storage protection could not be confirmed automatically. This does not mean your map or visits are missing. Export your passport as a backup.';
  }
  destroy() { this.closed = true; this.events.abort(); this.unsubscribe(); }
}
