export const html = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Confirmation is explicit; Cancel and Escape leave the caller's draft intact. */
export function confirmCollection(root: HTMLElement, message: string, action = 'Save and move stamp'): Promise<boolean> {
  return new Promise(resolve => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.createElement('dialog');
    dialog.className = 'collection-confirm';
    dialog.setAttribute('aria-label', 'Confirm passport change');
    dialog.innerHTML = `<h2>Review stamp collection</h2><p>${html(message)}</p><div class="collection-actions"><button type="button" data-confirm>${html(action)}</button><button type="button" data-cancel>Cancel</button></div>`;
    const finish = (result: boolean) => { dialog.close(); dialog.remove(); previous?.focus({ preventScroll: true }); resolve(result); };
    dialog.querySelector('[data-confirm]')!.addEventListener('click', () => finish(true));
    dialog.querySelector('[data-cancel]')!.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
    root.append(dialog); dialog.showModal();
    (dialog.querySelector('[data-cancel]') as HTMLElement).focus();
  });
}
