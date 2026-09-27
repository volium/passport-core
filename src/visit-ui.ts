export const html = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Confirmation is explicit; Cancel and Escape leave the caller's draft intact. */
export function confirmCollection(root: HTMLElement, message: string, action = 'Save and move stamp', title = 'Review stamp collection'): Promise<boolean> {
  return new Promise(resolve => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.createElement('dialog');
    dialog.className = 'collection-confirm';
    dialog.setAttribute('aria-label', title);
    dialog.innerHTML = `<h2>${html(title)}</h2><p>${html(message)}</p><div class="collection-actions"><button type="button" data-confirm>${html(action)}</button><button type="button" data-cancel>Cancel</button></div>`;
    const finish = (result: boolean) => { dialog.close(); dialog.remove(); previous?.focus({ preventScroll: true }); resolve(result); };
    dialog.querySelector('[data-confirm]')!.addEventListener('click', () => finish(true));
    dialog.querySelector('[data-cancel]')!.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
    root.append(dialog); dialog.showModal();
    (dialog.querySelector('[data-cancel]') as HTMLElement).focus();
  });
}

/** A visit can precede stamp collection; the two dates need not be identical. */
export function chooseEarlierVisit(root: HTMLElement, airport: string, currentDate: string, earlierDate: string): Promise<'move' | 'visit-only' | 'cancel'> {
  return new Promise(resolve => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.createElement('dialog');
    dialog.className = 'collection-confirm';
    dialog.setAttribute('aria-label', 'Earlier visit and stamp collection');
    dialog.innerHTML = `<h2>This visit is before your stamp date</h2><p>${html(airport)} has a recorded stamp collection date of <strong>${html(currentDate)}</strong>. You are saving a visit on <strong>${html(earlierDate)}</strong>.</p><p><strong>Save and move stamp</strong> will move the stamp collection date earlier, from ${html(currentDate)} to ${html(earlierDate)}, and move the airport in your collection order.</p><p><strong>Save visit only</strong> will add this visit to your history and keep the stamp date at ${html(currentDate)}. Your collection order will stay the same.</p><div class="collection-actions"><button type="button" data-choice="move">Save and move stamp</button><button type="button" data-choice="visit-only">Save visit only</button><button type="button" data-choice="cancel">Cancel</button></div>`;
    const finish = (result: 'move' | 'visit-only' | 'cancel') => {
      dialog.close(); dialog.remove(); previous?.focus({ preventScroll: true }); resolve(result);
    };
    dialog.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button => button.addEventListener('click', () => finish(button.dataset.choice as 'move' | 'visit-only' | 'cancel')));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish('cancel'); });
    root.append(dialog); dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[data-choice="cancel"]')!.focus();
  });
}
