const icon = (paths: string) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
export const appearanceButton = '<button id="appearance-trigger" type="button" aria-label="Switch appearance"><span class="appearance-icon-tile" aria-hidden="true">' + icon('<circle cx="12" cy="12" r="7"/><path d="M12 5a7 7 0 0 0 0 14Z" fill="currentColor" stroke="none"/>') + '</span></button>';
export const mapIcon = icon('<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/>');
export const protectionIcon = '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M10 2 18 5v7c0 5-8 10-8 10S2 17 2 12V5Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
