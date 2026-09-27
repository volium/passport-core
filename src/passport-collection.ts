import { calculateProgress } from './domain.js';
import { collectionDates, collectionSequence } from './collection.js';
import type { PassportProgram, StampOrder } from './models.js';
import type { PassportSnapshot } from './persistence.js';
import { html } from './visit-ui.js';

type OrderDraft = { date: string; ids: string[]; revision: number };
interface Actions {
  order: (order: StampOrder, revision: number) => Promise<void>;
  showDetails: (id: string) => void;
  explore: () => void;
}

/** Independent Passport view. Map redraws never rebuild this component or its drafts. */
export class PassportCollection {
  private state: PassportSnapshot = { visits: [], orders: [], revision: -1 };
  private view = 'regions';
  private sort = 'name';
  private sequence: ReturnType<typeof collectionSequence> = [];
  private opened = new Set<string>();
  private ordering?: OrderDraft;
  private lifted?: { id: string; original: string[]; pointer?: number; valid: boolean };
  private timer?: ReturnType<typeof setTimeout>;
  private events = new AbortController();
  private busy = false;
  constructor(private root: HTMLElement, private program: PassportProgram, private actions: Actions) {
    root.innerHTML = `<div class="collection-switch" aria-label="Passport view"><button type="button" data-view="regions" aria-pressed="true">By region</button><button type="button" data-view="stamps" aria-pressed="false">My stamps</button></div><label class="collection-sort" hidden>Sort stamps<select><option value="name">Airport name</option><option value="order">Collection order</option><option value="date">Date</option></select></label><p class="collection-status" role="status" aria-live="polite"></p><div class="collection-body"></div>`;
    const opts = { signal: this.events.signal };
    root.addEventListener('click', e => { void this.click(e); }, opts);
    root.addEventListener('change', e => {
      if (!(e.target instanceof HTMLSelectElement)) return;
      if (this.ordering) { e.target.value = this.sort; this.notice('Save or cancel the current order before changing views.'); return; }
      this.sort = e.target.value; this.draw();
    }, opts);
    root.addEventListener('toggle', e => {
      const details = e.target;
      if (!(details instanceof HTMLDetailsElement) || !details.dataset.key) return;
      if (details.open) this.opened.add(details.dataset.key); else this.opened.delete(details.dataset.key);
    }, { ...opts, capture: true });
    root.addEventListener('keydown', e => this.key(e), opts);
    root.addEventListener('pointerdown', e => this.pointerStart(e), opts);
    root.addEventListener('pointermove', e => this.pointerMove(e), opts);
    root.addEventListener('pointerup', e => this.pointerEnd(e), opts);
    root.addEventListener('pointercancel', () => this.drop(false), opts);
    root.addEventListener('lostpointercapture', () => { if (this.lifted?.pointer !== undefined) this.drop(false); }, opts);
  }
  update(state: PassportSnapshot) {
    if (state.revision === this.state.revision) return;
    this.state = state;
    if (this.ordering) { this.notice('Passport data changed. Your order draft is kept; cancel it to review the latest collection before saving.'); return; }
    this.draw();
  }
  private name(id: string) { return this.program.airports.find(a => a.id === id)?.name ?? id; }
  private alphabetical(ids: string[]) { return [...ids].sort((a, b) => this.name(a).localeCompare(this.name(b)) || a.localeCompare(b)); }
  private notice(message: string, transient = false) {
    clearTimeout(this.timer);
    this.root.querySelector('.collection-status')!.textContent = message;
    if (transient) this.timer = setTimeout(() => { this.root.querySelector('.collection-status')!.textContent = ''; }, 5000);
  }
  private row(id: string, handle = false): string {
    const airport = this.program.airports.find(a => a.id === id);
    const visits = this.state.visits.filter(v => v.airportId === id).sort((a, b) => a.visitedAt.localeCompare(b.visitedAt));
    const date = collectionDates(visits).get(id);
    const region = this.program.regions.find(r => r.id === airport?.regionId);
    const position = this.view === 'stamps' ? this.sequence.find(stamp => stamp.airportId === id) : undefined;
    const metadata = [
      position?.provisional && this.sort !== 'date' ? 'Same-day order unconfirmed' : '',
      this.view !== 'regions' ? region?.name ?? 'Airport no longer in program data' : '',
      airport && !airport.participation.participating ? 'No longer participating' : '',
      visits.length > 1 ? `${visits.length} visits` : '',
    ].filter(Boolean);
    const title = `${position ? '<span class="collection-number" aria-label="Collection number ' + position.number + '">#' + position.number + '</span> ' : ''}${html(this.name(id))}`;
    return `<li class="collection-row" data-stamp="${html(id)}">${handle ? '<button class="stamp-handle" type="button" data-handle="' + html(id) + '" aria-label="Reorder ' + html(this.name(id)) + '" aria-describedby="reorder-help" aria-pressed="false">&#8942;&#8942;</button>' : ''}<div class="collection-summary"><strong>${handle ? title : '<button type="button" class="airport-details-link" data-details="' + html(id) + '">' + title + '</button>'} &middot; ${html(airport?.identifiers?.faa || id)}</strong><span>${date ? '&#10003; Visited &middot; Stamp ' + date : visits.length ? '&#10003; Visited &middot; No stamp recorded' : '&#9675; Not visited'}</span>${metadata.length ? '<small>' + metadata.map(html).join(' &middot; ') + '</small>' : ''}</div></li>`;
  }
  restoreFocus(id: string, top: number) {
    const target = [...this.root.querySelectorAll<HTMLElement>('[data-details]')].find(el => el.dataset.details === id);
    (target ?? this.root.querySelector<HTMLElement>('[data-view][aria-pressed="true"]'))?.focus({ preventScroll: true });
    this.root.closest('.passport-content')!.scrollTop = top;
  }
  private draw() {
    const body = this.root.querySelector<HTMLElement>('.collection-body')!;
    const scroll = this.root.closest('.passport-content')!;
    const top = scroll.scrollTop;
    this.root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === this.view)));
    (this.root.querySelector('.collection-sort') as HTMLElement).hidden = this.view !== 'stamps';
    const dates = collectionDates(this.state.visits);
    this.sequence = collectionSequence(this.state.visits, this.state.orders);
    const visitedIds = [...new Set(this.state.visits.map(v => v.airportId))];
    if (this.view === 'regions') {
      body.innerHTML = `<div id="regions" class="region-cards">${calculateProgress(this.program, this.state.visits).regions.map(r => {
        const key = `region:${r.id}`;
        return `<details class="region-card" data-key="${html(key)}" style="--region:${r.color}" ${this.opened.has(key) ? 'open' : ''}><summary><span class="region-heading"><svg class="region-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path class="region-chevron-outline" d="m6 3 5 5-5 5"/><path d="m6 3 5 5-5 5"/></svg><strong>${html(r.name)}</strong><span>${r.visited} / ${r.total}</span></span><progress aria-label="${html(r.name)} progress" value="${r.visited}" max="${r.total || 1}"></progress>${!r.complete && r.required !== r.total ? `<small>Visit ${r.required} ${r.required === 1 ? 'airport' : 'airports'} to complete this region.</small>` : ''}</summary><ul class="stamp-list">${this.alphabetical(this.program.airports.filter(a => a.regionId === r.id && a.participation.participating).map(a => a.id)).map(id => this.row(id)).join('') || '<li>No participating airports.</li>'}</ul></details>`;
      }).join('')}</div>`;
    } else if (!visitedIds.length) body.innerHTML = '<p class="empty">Your collected stamps will appear after your first visit.</p><button type="button" data-explore>Explore airports</button>';
    else if (this.sort === 'name') body.innerHTML = `<ul class="stamp-list">${this.alphabetical(visitedIds).map(id => this.row(id)).join('')}</ul>`;
    else if (this.sort === 'order') body.innerHTML = `<p class="muted">Earliest stamp first. To change same-day order, choose Date.</p><ul class="stamp-list">${this.sequence.map(stamp => this.row(stamp.airportId)).join('')}</ul>`;
    else body.innerHTML = [...new Set(dates.values())].sort().map(date => {
      const order = this.state.orders.find(o => o.date === date);
      const ids = this.ordering?.date === date ? this.ordering.ids : this.sequence.filter(stamp => stamp.date === date).map(stamp => stamp.airportId);
      const editing = this.ordering?.date === date;
      return `<section class="stamp-day" data-date="${date}"><h3>${date}</h3><p class="muted">${order?.confirmed ? 'Collection order confirmed' : 'Same-day order unconfirmed'}</p>${ids.length > 1 ? editing ? '<p id="reorder-help" class="muted">Drag a handle within this date. Keyboard: Space to pick up, arrows to move, Space to drop, Escape to cancel a move.</p><div class="collection-actions"><button type="button" data-save-order>Save order</button><button type="button" data-cancel-order>Cancel</button></div>' : `<button type="button" data-reorder="${date}">Reorder</button>` : ''}<ul class="stamp-list">${ids.map(id => this.row(id, editing)).join('')}</ul></section>`;
    }).join('');
    if (this.view === 'stamps' && this.sort !== 'name') {
      const history = this.alphabetical(visitedIds.filter(id => !dates.has(id)));
      if (history.length) body.insertAdjacentHTML('beforeend', `<section class="stamp-day"><h3>Visit history only</h3><p class="muted">These visits do not record a collected stamp.</p><ul class="stamp-list">${history.map(id => this.row(id)).join('')}</ul></section>`);
    }
    scroll.scrollTop = top;
  }
  private async click(e: MouseEvent) {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || this.busy) return;
    const d = button.dataset;
    if (d.view) {
      if (this.ordering) { this.notice('Save or cancel the current order before changing views.'); return; }
      this.view = d.view; this.draw(); return;
    }
    if ('explore' in d) this.actions.explore();
    if (d.details) {
      if (this.ordering) { this.notice('Save or cancel the current order before opening airport details.'); return; }
      this.actions.showDetails(d.details);
    }
    if (d.reorder) {
      if (this.ordering) { this.notice('Save or cancel the current order first.'); return; }
      const date = d.reorder;
      const order = this.state.orders.find(o => o.date === date);
      this.ordering = { date, ids: [...(order?.airportIds ?? this.sequence.filter(stamp => stamp.date === date).map(stamp => stamp.airportId))], revision: this.state.revision };
      this.draw(); this.handle(this.ordering.ids[0])?.focus();
    }
    if ('cancelOrder' in d) { this.drop(false); const date = this.ordering?.date; this.ordering = undefined; this.draw(); this.reorderButton(date)?.focus(); this.notice('Order changes cancelled.', true); }
    if ('saveOrder' in d && this.ordering) {
      this.drop(true); this.busy = true; button.disabled = true;
      const draft = this.ordering;
      try { await this.actions.order({ date: draft.date, airportIds: draft.ids, confirmed: true }, draft.revision); this.ordering = undefined; this.draw(); this.reorderButton(draft.date)?.focus(); this.notice('Collection order saved.', true); }
      catch (error) { this.notice(error instanceof Error ? error.message : 'Could not save order. Your draft is kept.'); }
      finally { this.busy = false; button.disabled = false; }
    }
  }
  private handle(id: string) { return [...this.root.querySelectorAll<HTMLButtonElement>('[data-handle]')].find(b => b.dataset.handle === id); }
  private reorderButton(date?: string) { return [...this.root.querySelectorAll<HTMLButtonElement>('[data-reorder]')].find(b => b.dataset.reorder === date); }
  private lift(id: string, pointer?: number) {
    if (!this.ordering || this.lifted) return;
    this.lifted = { id, original: [...this.ordering.ids], pointer, valid: true };
    this.handle(id)?.setAttribute('aria-pressed', 'true');
    this.handle(id)?.closest('li')?.classList.add('is-lifted');
    this.notice(`${this.name(id)} picked up. Move only within ${this.ordering.date}.`);
  }
  private move(index: number) {
    if (!this.ordering || !this.lifted) return;
    const ids = this.ordering.ids, current = ids.indexOf(this.lifted.id);
    index = Math.max(0, Math.min(ids.length - 1, index));
    if (current === index) return;
    ids.splice(current, 1); ids.splice(index, 0, this.lifted.id);
    const row = this.handle(this.lifted.id)!.closest('li')!;
    const list = row.parentElement!;
    // Move other rows around the captured handle to retain pointer capture/focus.
    for (const id of ids.slice(0, index)) list.insertBefore(this.handle(id)!.closest('li')!, row);
    for (const id of ids.slice(index + 1)) list.append(this.handle(id)!.closest('li')!);
    this.handle(this.lifted.id)?.focus({ preventScroll: true });
    this.notice(`${this.name(this.lifted.id)}, position ${index + 1} of ${ids.length} on ${this.ordering.date}.`);
  }
  private drop(save: boolean) {
    if (!this.lifted || !this.ordering) return;
    const lifted = this.lifted;
    if (!save) {
      this.ordering.ids = [...lifted.original];
      const list = this.handle(lifted.id)!.closest('ul')!;
      for (const id of lifted.original) list.append(this.handle(id)!.closest('li')!);
    }
    const handle = this.handle(lifted.id);
    this.lifted = undefined;
    handle?.setAttribute('aria-pressed', 'false'); handle?.closest('li')?.classList.remove('is-lifted');
    if (lifted.pointer !== undefined && handle?.hasPointerCapture(lifted.pointer)) handle.releasePointerCapture(lifted.pointer);
    handle?.focus({ preventScroll: true });
    this.notice(save ? `${this.name(lifted.id)} placed. Choose Save order to keep this sequence.` : 'Move cancelled. The previous draft position is restored.');
  }
  private key(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.lifted) { e.preventDefault(); e.stopPropagation(); this.drop(false); return; }
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]');
    if (!handle || !this.ordering) return;
    if ([' ', 'Enter', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) e.preventDefault();
    if (e.key === ' ' || e.key === 'Enter') { if (this.lifted) this.drop(true); else this.lift(handle.dataset.handle!); }
    if (e.key === 'Escape') { e.stopPropagation(); this.drop(false); }
    if (this.lifted && ['ArrowUp', 'ArrowDown'].includes(e.key)) this.move(this.ordering.ids.indexOf(this.lifted.id) + (e.key === 'ArrowUp' ? -1 : 1));
  }
  private pointerStart(e: PointerEvent) {
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]');
    if (!handle || e.button !== 0 || !e.isPrimary || this.lifted) return;
    e.preventDefault(); this.lift(handle.dataset.handle!, e.pointerId); handle.setPointerCapture(e.pointerId);
  }
  private pointerMove(e: PointerEvent) {
    if (this.lifted?.pointer !== e.pointerId || !this.ordering) return;
    e.preventDefault();
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-date]');
    this.lifted.valid = target?.dataset.date === this.ordering.date;
    if (!this.lifted.valid) { this.notice('Drop within the same date. Other dates are not valid destinations.'); return; }
    const rows = [...target!.querySelectorAll<HTMLElement>('[data-stamp]')].filter(row => row.dataset.stamp !== this.lifted!.id);
    const index = rows.findIndex(row => e.clientY < row.getBoundingClientRect().bottom - row.getBoundingClientRect().height / 2);
    this.move(index < 0 ? rows.length : index);
    const scroller = this.root.closest('.passport-content')!;
    const bounds = scroller.getBoundingClientRect();
    if (e.clientY > bounds.bottom - 50) scroller.scrollTop += 12;
    if (e.clientY < bounds.top + 50) scroller.scrollTop -= 12;
  }
  private pointerEnd(e: PointerEvent) { if (this.lifted?.pointer === e.pointerId) this.drop(this.lifted.valid); }
  destroy() { clearTimeout(this.timer); this.events.abort(); }
}
