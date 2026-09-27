import { test, expect, type Page } from '@playwright/test';
import { fixture } from '../map-fixture.js';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('passport:independent-core:offline-introduction:browser', 'seen'));
  const { env } = await fixture();
  await context.route('https://fixture.invalid/**', async route => { const r = await env.fetch(route.request().url()); await route.fulfill({ status: 200, body: Buffer.from(await r.arrayBuffer()), headers: { 'access-control-allow-origin': '*' } }); });
});
const seed = async (page: Page) => {
  await page.goto('/tests/browser/app.html?collection=1');
  await page.locator('#passport-tab').click();
  await page.locator('#import').setInputFiles({ name: 'passport.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'aviation-passport', schemaVersion: 1, programId: 'independent-core', exportedAt: new Date().toISOString(), attachments: [], checkIns: ['AAA', 'BBB', 'CCC', 'DDD'].map((id, i) => ({ id, programId: 'independent-core', airportId: id, visitedAt: i === 3 ? '2026-09-11' : '2026-09-10', timeKnown: false, createdAt: '2026-09-12T00:00:00Z', updatedAt: '2026-09-12T00:00:00Z', notes: 'Original ' + id, verification: { status: 'unverified' } })) })) });
  await expect(page.locator('#passport-notice')).toContainText('Imported 4 visits');
};
const stamps = async (page: Page) => { await page.getByRole('button', { name: 'My stamps', exact: true }).click(); await page.getByLabel('Sort stamps').selectOption('date'); };
const openDetails = async (page: Page, id: string) => {
  await page.locator('[data-details="' + id + '"]').click();
  await expect(page.locator('#detail')).toBeVisible();
  if (await page.locator('#visit-history').getAttribute('open') === null) await page.locator('#history-heading').click();
  return page.locator('#detail');
};
const ids = (page: Page, date = '2026-09-10') => page.locator(`[data-date="${date}"] [data-stamp]`).evaluateAll(rows => rows.map(r => (r as HTMLElement).dataset.stamp));

test('Passport names open details and return preserves region state, focus and drafts', async ({ page }) => {
  await page.goto('/tests/browser/app.html?collection=1');
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#search').fill('AAA'); await page.locator('#passport-tab').click();
  await page.locator('.region-card > summary').click();
  await expect(page.locator('.collection-row')).toHaveCount(4);
  await expect(page.locator('#search')).toHaveValue('AAA');
  await expect(page.locator('.collection-row form, .collection-row details, .collection-actions')).toHaveCount(0);
  await page.locator('[data-details="BBB"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#detail h2')).toHaveText('Airport BBB');
  await expect(page.locator('#close-detail')).toContainText('Back to My Passport');
  await page.locator('#open-visit-editor').click(); await page.getByLabel('Notes').fill('Keep <my> draft');
  await page.locator('#close-detail').click();
  await expect(page.locator('#passport-panel')).toBeVisible();
  await expect(page.locator('.region-card')).toHaveAttribute('open', '');
  await expect(page.locator('[data-details="BBB"]')).toBeFocused();
  await openDetails(page, 'BBB'); await expect(page.getByLabel('Notes')).toHaveValue('Keep <my> draft');
  await page.getByRole('button', {name:'Save check-in'}).click(); await expect(page.locator('#checkin')).toBeHidden();
  await page.locator('#close-detail').click(); await expect(page.locator('[data-stamp="BBB"]')).toContainText('Visited');
  await expect(page.locator('#overall strong')).toHaveText('1 / 4');
});

test('keyboard same-day order persists, cancels safely, and round-trips through a versioned backup', async ({ page, context }) => {
  await seed(page); await stamps(page);
  await expect(page.locator('[data-date="2026-09-10"]')).toContainText('unconfirmed');
  await page.locator('[data-reorder="2026-09-10"]').click();
  const handle = page.locator('[data-handle="AAA"]');
  await handle.press('Space'); await handle.press('ArrowDown'); await handle.press('ArrowDown'); await handle.press('Space');
  expect(await ids(page)).toEqual(['BBB', 'CCC', 'AAA']);
  await page.getByRole('button', { name: 'Save order', exact: true }).click();
  await expect(page.locator('.collection-status')).toContainText('Collection order saved');
  await page.reload(); await page.locator('#passport-tab').click(); await stamps(page);
  expect(await ids(page)).toEqual(['BBB', 'CCC', 'AAA']);
  await page.locator('[data-reorder="2026-09-10"]').click();
  await page.locator('[data-handle="AAA"]').press('Space'); await page.locator('[data-handle="AAA"]').press('ArrowUp'); await page.locator('[data-handle="AAA"]').press('Escape');
  expect(await ids(page)).toEqual(['BBB', 'CCC', 'AAA']);
  await page.locator('[data-cancel-order]').click();
  const download = page.waitForEvent('download'); await page.locator('#export').click();
  const stream = await (await download).createReadStream(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.schemaVersion).toBe(3); expect(backup.orders[0].airportIds).toEqual(['BBB', 'CCC', 'AAA']);
  const fresh = await context.browser()!.newContext(); await fresh.addInitScript(() => localStorage.setItem('passport:independent-core:offline-introduction:browser', 'seen'));
  const other = await fresh.newPage(); await other.goto('/tests/browser/app.html?collection=1'); await other.locator('#passport-tab').click();
  await other.locator('#import').setInputFiles({ name: 'restored.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(other.locator('#passport-notice')).toContainText('Imported 4 visits'); await stamps(other);
  expect(await ids(other)).toEqual(['BBB', 'CCC', 'AAA']); await fresh.close();
});

test('pointer drag changes only its date, invalid drops restore the draft, and touch handles preserve scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page); await stamps(page); await page.locator('[data-reorder="2026-09-10"]').click();
  const a = page.locator('[data-handle="AAA"]'), c = page.locator('[data-handle="CCC"]');
  await c.scrollIntoViewIfNeeded();
  const from = (await a.boundingBox())!, to = (await c.boundingBox())!;
  await page.mouse.move(from.x + 10, from.y + 10); await page.mouse.down(); await page.mouse.move(to.x + 10, to.y + to.height, { steps: 8 }); await page.mouse.up();
  expect(await ids(page)).toEqual(['BBB', 'CCC', 'AAA']);
  const start = (await a.boundingBox())!;
  await page.mouse.move(start.x + 10, start.y + 10); await page.mouse.down(); await page.mouse.move(385, 30, { steps: 5 }); await page.mouse.up();
  expect(await ids(page)).toEqual(['BBB', 'CCC', 'AAA']); expect(await ids(page, '2026-09-11')).toEqual(['DDD']);
  expect(await a.evaluate(el => getComputedStyle(el).touchAction)).toBe('none');
  expect(await page.locator('[data-date="2026-09-10"] .stamp-list').evaluate(el => getComputedStyle(el).touchAction)).toBe('auto');
});

test('earlier visit asks before moving a stamp; cancellation keeps input and repeat visits keep unique progress', async ({ page }) => {
  await seed(page); await stamps(page); const row = await openDetails(page, 'AAA');
  await page.locator('#open-visit-editor').click(); await row.getByLabel('Visit date').fill('2026-09-09'); await row.getByLabel('Notes').fill('Earlier visit');
  await row.getByRole('button', {name:'Save check-in'}).click();
  await expect(page.getByRole('dialog')).toContainText('2026-09-09'); await page.getByRole('button', {name:'Cancel',exact:true}).click();
  await expect(row.getByLabel('Notes')).toHaveValue('Earlier visit');
  await row.getByRole('button', {name:'Save check-in'}).click(); await page.getByRole('button', {name:'Save and move stamp'}).click();
  await expect(page.locator('#airport-visit-summary')).toContainText('2026-09-09');
  await expect(row.locator('.history article > strong')).toHaveText(['2026-09-09','2026-09-10']);
  await expect(row.locator('.history article').filter({hasText:'Original AAA'})).toContainText('Repeat visit');
  await expect(page.locator('#overall strong')).toHaveText('4 / 4');
  await page.reload(); await page.locator('#passport-tab').click(); await stamps(page); await openDetails(page, 'AAA');
  await row.locator('.history article').filter({hasText:'Earlier visit'}).getByRole('button', {name:'Delete',exact:true}).click();
  await page.getByRole('button', {name:'Delete visit',exact:true}).click();
  await expect(page.locator('#airport-visit-summary')).toContainText('2026-09-10');
  await expect(row.locator('.history article').filter({hasText:'Original AAA'})).toContainText('Stamp collection date');
});

test('stale ordering draft cannot overwrite another tab and cancelled drafts reveal latest visits', async ({ page, context }) => {
  await seed(page); await stamps(page); await page.locator('[data-reorder="2026-09-10"]').click();
  const other = await context.newPage(); await other.goto('/tests/browser/app.html?collection=1');
  await other.locator('[data-airport="AAA"]').click(); if (await other.locator('#open-visit-editor').isVisible()) await other.locator('#open-visit-editor').click(); await other.getByLabel('Notes').fill('A concurrent visit'); await other.getByRole('button', { name: 'Save check-in' }).click(); await expect(other.locator('#checkin')).toBeHidden(); await expect(other.locator('#visit-save-confirmation')).toHaveText('Visit saved on this device.');
  await page.bringToFront(); await page.locator('[data-save-order]').click();
  await expect(page.locator('.collection-status')).toContainText('another operation or tab');
  await expect(page.locator('[data-cancel-order]')).toBeVisible(); await page.locator('[data-cancel-order]').click();
  await expect(page.locator('[data-stamp="AAA"] .collection-summary')).toContainText('2 visits'); await other.close();
});

test('import reviews earlier dates; cancelling leaves visits untouched', async ({ page }) => {
  await seed(page); await stamps(page);
  await page.locator('[data-reorder="2026-09-10"]').click(); await page.locator('[data-save-order]').click();
  await expect(page.locator('.collection-status')).toContainText('Collection order saved');
  const backup = { format: 'aviation-passport', schemaVersion: 2, programId: 'independent-core', exportedAt: new Date().toISOString(), attachments: [], checkIns: [{ id: 'earlier-import', programId: 'independent-core', airportId: 'AAA', visitedAt: '2026-09-08', timeKnown: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: 'Imported earlier', verification: { status: 'unverified' } }], orders: [{ date: '2026-09-08', airportIds: ['AAA'], confirmed: true }] };
  const file = { name: 'earlier.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) };
  await page.locator('#import').setInputFiles(file);
  await expect(page.getByRole('dialog')).toContainText('stamp moves');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#passport-notice')).toContainText('Import cancelled');
  expect(await ids(page)).toContain('AAA');
  await page.locator('#import').setInputFiles(file);
  await page.getByRole('button', { name: 'Import and keep local order' }).click();
  await expect(page.locator('#passport-notice')).toContainText('Imported 1 visits');
  expect(await ids(page, '2026-09-08')).toEqual(['AAA']); expect(await ids(page)).toEqual(['BBB', 'CCC']);
});

test('failed order save keeps the draft', async ({ page }) => {
  await seed(page); await stamps(page); await page.locator('[data-reorder="2026-09-10"]').click();
  await page.locator('[data-handle="AAA"]').press('Space'); await page.locator('[data-handle="AAA"]').press('ArrowDown'); await page.locator('[data-handle="AAA"]').press('Space');
  await page.evaluate(() => {
    const app = (window as unknown as { fixtureApp: { store: { saveOrder: () => Promise<void> } } }).fixtureApp;
    app.store.saveOrder = async () => { throw new Error('Storage full. Your draft is kept.'); };
  });
  await page.locator('[data-save-order]').click();
  await expect(page.locator('.collection-status')).toContainText('Storage full');
  expect(await ids(page)).toEqual(['BBB', 'AAA', 'CCC']); await expect(page.locator('[data-cancel-order]')).toBeVisible();
});

test.describe('touch collection', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('touch handle reorders while dragging outside the date cancels and the list still scrolls', async ({ page, context }) => {
    await seed(page); await stamps(page); await page.locator('[data-reorder="2026-09-10"]').tap();
    const a = page.locator('[data-handle="AAA"]'), c = page.locator('[data-handle="CCC"]');
    await c.scrollIntoViewIfNeeded();
    const from = (await a.boundingBox())!, to = (await c.boundingBox())!;
    const session = await context.newCDPSession(page);
    const touch = async (type: string, x: number, y: number) => { await session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 0 }] }); await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => r()))); };
    await touch('touchStart', from.x + 15, from.y + 15);
    for (let step = 1; step <= 8; step++) await touch('touchMove', from.x + 15, from.y + 15 + (to.y + to.height - from.y - 15) * step / 8);
    await touch('touchEnd', 0, 0);
    expect(await ids(page)).toEqual(['BBB', 'CCC', 'AAA']);
    const pos = (await a.boundingBox())!;
    await touch('touchStart', pos.x + 15, pos.y + 15); await touch('touchMove', 385, 30); await touch('touchEnd', 0, 0);
    expect(await ids(page)).toEqual(['BBB', 'CCC', 'AAA']);
    const scroller = page.locator('.passport-content'); await scroller.evaluate(el => { el.scrollTop = 0; });
    const before = await scroller.evaluate(el => el.scrollTop);
    await touch('touchStart', 280, 690); for (let y = 670; y >= 350; y -= 20) await touch('touchMove', 280, y); await touch('touchEnd', 0, 0);
    await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(before);
    await session.detach();
  });
});

test('Explore confirmation Escape preserves its draft and editing history cannot overwrite it', async ({ page }) => {
  await seed(page); await page.locator('#explore-tab').click(); await page.locator('[data-airport="AAA"]').click();
  await page.locator('#open-visit-editor').click();
  await page.locator('#checkin [name="date"]').fill('2026-09-09');
  await page.locator('#checkin [name="notes"]').fill('Unfinished earlier visit');
  await page.locator('#checkin [type="submit"]').click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#checkin [name="notes"]')).toHaveValue('Unfinished earlier visit');
  if (await page.locator('#visit-history').getAttribute('open') === null) await page.locator('#history-heading').click();
  await page.locator('#detail [data-edit]').first().click();
  await expect(page.locator('#save-status')).toContainText('Save or cancel your current draft');
  await expect(page.locator('#checkin [name="notes"]')).toHaveValue('Unfinished earlier visit');
  await page.locator('#cancel-visit-draft').click(); await page.getByRole('button', { name: 'Discard draft', exact: true }).click(); await page.locator('#detail [data-edit]').first().click();
  await expect(page.locator('#checkin [name="notes"]')).toHaveValue('Original AAA');
});

test('same-day repeat warns, cancellation keeps the draft, and editing notes does not warn again', async ({ page }) => {
  await seed(page); await page.getByRole('button', { name: 'My stamps', exact: true }).click();
  const row = await openDetails(page, 'AAA');
  await page.locator('#open-visit-editor').click();
  await row.getByLabel('Visit date').fill('2026-09-10'); await row.getByLabel('Notes').fill('A second landing');
  await row.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page.getByRole('dialog')).toContainText('Another visit on the same day?');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(row.getByLabel('Notes')).toHaveValue('A second landing');
  await expect(row.locator('.history article')).toHaveCount(1);
  await row.getByRole('button', { name: 'Save check-in' }).click();
  await page.getByRole('button', { name: 'Save another visit', exact: true }).click();
  await expect(row.locator('.history article')).toHaveCount(2);
  await expect(page.locator('#overall strong')).toHaveText('4 / 4');
  await row.locator('.history article').filter({ hasText: 'A second landing' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await row.getByLabel('Notes').fill('Notes corrected'); await row.getByRole('button', { name: 'Save changes' }).click();
  await expect(row).toContainText('Notes corrected'); await expect(page.getByRole('dialog')).toHaveCount(0);
});


test('saving earlier history keeps the stamp across reload and notes edits', async ({ page }) => {
  await seed(page); await stamps(page);
  await page.locator('[data-reorder="2026-09-10"]').click(); await page.locator('[data-save-order]').click();
  const row = await openDetails(page, 'AAA');
  await page.locator('#open-visit-editor').click();
  await row.getByLabel('Visit date').fill('2026-09-09'); await row.getByLabel('Notes').fill('Before collecting my stamp');
  await row.getByRole('button', { name: 'Save check-in' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('2026-09-10'); await expect(dialog).toContainText('2026-09-09');
  await dialog.getByRole('button', { name: 'Save visit only', exact: true }).click();
  await expect(page.locator('#airport-visit-summary')).toContainText('2026-09-10');
  expect(await ids(page)).toEqual(['AAA', 'BBB', 'CCC']);
  await expect(row).toContainText('Visit only - excluded from stamp collection');
  await page.reload(); await page.locator('#passport-tab').click(); await stamps(page);
  await openDetails(page, 'AAA');
  await row.locator('.history article').filter({ hasText: 'Before collecting my stamp' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await row.getByLabel('Notes').fill('Corrected history notes'); await row.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('#airport-visit-summary')).toContainText('2026-09-10');
  await expect(row).toContainText('Visit only - excluded from stamp collection');
  await page.locator('#close-detail').click();
  const download = page.waitForEvent('download'); await page.locator('#export').click();
  const stream = await (await download).createReadStream(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.schemaVersion).toBe(3);
  expect(backup.checkIns.find((v: { notes: string }) => v.notes === 'Corrected history notes').historyOnly).toBe(true);
  expect(backup.orders[0]).toEqual({ date: '2026-09-10', airportIds: ['AAA', 'BBB', 'CCC'], confirmed: true });
  await openDetails(page, 'AAA');
  await row.locator('.history article').filter({ hasText: 'Original AAA' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('remaining visits were explicitly excluded');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete visit', exact: true }).click();
  await expect(page.locator('#airport-visit-summary')).toContainText('No stamp recorded');
  await page.locator('#close-detail').click(); await expect(page.locator('#passport-panel')).toContainText('Visit history only');
});


for (const surface of ['Passport', 'Explore']) test('deleting a stamp visit updates collection groups and persisted order from ' + surface, async ({ page }) => {
  await seed(page); await stamps(page);
  await page.locator('[data-reorder="2026-09-10"]').click(); await page.locator('[data-save-order]').click();
  if (surface === 'Explore') { await page.locator('#explore-tab').click(); await page.locator('[data-airport="AAA"]').click(); } else await openDetails(page, 'AAA');
  const row = page.locator('#detail');
  await page.locator('#open-visit-editor').click();
  await row.getByLabel('Visit date').fill('2026-09-12'); await row.getByLabel('Notes').fill('Later return');
  await row.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page.locator('#visit-count')).toHaveText('2');
  const history = row.locator('.history');
  const remove = history.locator('article').filter({ hasText: 'Original AAA' }).getByRole('button', { name: 'Delete', exact: true });
  await remove.click();
  await expect(page.getByRole('dialog')).toContainText('will move from 2026-09-10 to 2026-09-12');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(history.locator('article')).toHaveCount(2);
  await remove.click(); await page.keyboard.press('Escape');
  await expect(history.locator('article')).toHaveCount(2);
  await remove.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete visit', exact: true }).click();
  await expect(page.locator('#airport-visit-summary')).toContainText('2026-09-12');
  await page.locator('#close-detail').click(); await page.locator('#passport-tab').click();
  expect(await ids(page)).toEqual(['BBB', 'CCC']);
  expect(await ids(page, '2026-09-12')).toEqual(['AAA']);
  await page.reload(); await page.locator('#passport-tab').click(); await stamps(page);
  expect(await ids(page)).toEqual(['BBB', 'CCC']);
  expect(await ids(page, '2026-09-12')).toEqual(['AAA']);
  await openDetails(page, 'AAA');
  await row.locator('.history article').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete visit', exact: true }).click();
  await expect(page.locator('[data-date="2026-09-12"]')).toHaveCount(0);
  await page.reload(); await page.locator('#passport-tab').click(); await stamps(page);
  await expect(page.locator('[data-stamp="AAA"]')).toHaveCount(0);
  expect(await ids(page)).toEqual(['BBB', 'CCC']);
});


test('stamp sort modes share saved collection numbers and renumber after deletion', async ({ page }) => {
  await seed(page); await stamps(page);
  const sort = page.getByLabel('Sort stamps');
  await expect(sort.locator('option')).toHaveText(['Airport name', 'Collection order', 'Date']);
  await page.locator('[data-reorder="2026-09-10"]').click();
  const handle = page.locator('[data-handle="AAA"]');
  await handle.press('Space'); await handle.press('ArrowDown'); await handle.press('Space');
  await page.locator('[data-save-order]').click();
  await expect(page.locator('.collection-status')).toContainText('Collection order saved');
  for (const mode of ['name', 'order', 'date']) {
    await sort.selectOption(mode);
    await expect(page.locator('[data-stamp="BBB"] .collection-number')).toHaveText('#1');
    await expect(page.locator('[data-stamp="AAA"] .collection-number')).toHaveText('#2');
    await expect(page.locator('[data-stamp="DDD"] .collection-number')).toHaveText('#4');
    if (mode === 'order') {
      expect(await page.locator('[data-stamp]').evaluateAll(rows => rows.map(r => r.getAttribute('data-stamp')))).toEqual(['BBB', 'AAA', 'CCC', 'DDD']);
      await expect(page.locator('[data-date]')).toHaveCount(0);
    }
    if (mode === 'date') await expect(page.locator('[data-date]')).toHaveCount(2);
  }
  await sort.selectOption('order');
  const row = await openDetails(page, 'BBB');
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete visit', exact: true }).click();
  await page.locator('#close-detail').click();
  await expect(page.locator('[data-stamp="AAA"] .collection-number')).toHaveText('#1');
  await expect(page.locator('[data-stamp="DDD"] .collection-number')).toHaveText('#3');
  await page.reload(); await page.locator('#passport-tab').click(); await stamps(page);
  await expect(page.locator('[data-stamp="AAA"] .collection-number')).toHaveText('#1');
});


for (const width of [1280, 390]) test('Passport details restore scroll and support retired and missing airports at ' + width, async ({ page }) => {
  await page.setViewportSize({width, height: 700});
  await page.goto('/tests/browser/app.html?collection=1&retired=1');
  await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
  await page.locator('#passport-tab').click();
  const now = new Date().toISOString();
  await page.locator('#import').setInputFiles({name:'retired.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({
    format:'aviation-passport',schemaVersion:3,programId:'independent-core',exportedAt:now,attachments:[],orders:[{date:'2026-09-10',airportIds:['DDD','UNKNOWN'],confirmed:true}],
    checkIns:['DDD','UNKNOWN'].map(id=>({id,airportId:id,programId:'independent-core',visitedAt:'2026-09-10',timeKnown:false,createdAt:now,updatedAt:now,notes:'Retained history',verification:{status:'unverified'}}))
  }))});
  await expect(page.locator('#passport-notice')).toContainText('Imported 2 visits');
  await stamps(page); await page.getByLabel('Sort stamps').selectOption('order');
  await page.locator('[data-details="DDD"]').scrollIntoViewIfNeeded();
  const top=await page.locator('.passport-content').evaluate(el=>el.scrollTop);
  await openDetails(page,'DDD');
  await expect(page.locator('.participation-notice')).toContainText('No longer part of the program');
  await expect(page.locator('.airport-map-hit.is-selected')).toHaveAttribute('title', /^DDD /);
  await expect(page.locator('#overall strong')).toHaveText('0 / 3');
  await page.locator('#detail').getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByLabel('Notes').fill('Retired visit edited'); await page.getByRole('button',{name:'Save changes'}).click();
  await expect(page.locator('#checkin')).toBeHidden();
  await page.locator('#close-detail').click();
  await expect(page.getByLabel('Sort stamps')).toHaveValue('order');
  await expect(page.locator('[data-details="DDD"]')).toBeFocused();
  expect(await page.locator('.passport-content').evaluate(el=>el.scrollTop)).toBeCloseTo(top,0);
  await expect(page.locator('.airport-map-hit[title^="DDD "]')).toHaveCount(0);
  await openDetails(page,'UNKNOWN');
  await expect(page.locator('#detail h2')).toHaveText('UNKNOWN');
  await expect(page.locator('.participation-notice')).toContainText('no map location');
  await expect(page.locator('.airport-map-hit.is-selected')).toHaveCount(0);
  await page.locator('#detail').getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByLabel('Notes').fill('Missing metadata edit'); await page.getByRole('button',{name:'Save changes'}).click();
  await expect(page.locator('#visit-history')).toContainText('Missing metadata edit');
  await page.locator('#detail').getByRole('button',{name:'Delete',exact:true}).click();
  await page.getByRole('button',{name:'Delete visit',exact:true}).click();
  await expect(page.locator('#visit-count')).toHaveText('0');
  await page.locator('#close-detail').click();
  await expect(page.locator('[data-stamp="UNKNOWN"]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'My stamps',exact:true})).toBeFocused();
});

for (const completion of ['all', 'count', 'percentage']) {
  test('regional requirement caption only explains a different threshold: ' + completion, async ({ page }) => {
    await page.goto('/tests/browser/app.html?collection=1&completion=' + completion);
    await page.locator('#passport-tab').click();
    const summary = page.locator('.region-card > summary');
    await expect(summary).toContainText('0 / 4');
    if (completion === 'all') await expect(summary.locator('small')).toHaveCount(0);
    else await expect(summary.locator('small')).toHaveText('Visit 2 airports to complete this region.');
    await page.locator('#import').setInputFiles({ name: 'passport.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'aviation-passport', schemaVersion: 1, programId: 'independent-core', exportedAt: new Date().toISOString(), attachments: [], checkIns: ['AAA', 'BBB', 'CCC', 'DDD'].map(id => ({ id, programId: 'independent-core', airportId: id, visitedAt: '2026-09-10', timeKnown: false, createdAt: '2026-09-12T00:00:00Z', updatedAt: '2026-09-12T00:00:00Z', notes: '', verification: { status: 'unverified' } })) })) });
    await expect(summary).toContainText('4 / 4');
    await expect(summary).not.toContainText('Complete');
    await expect(summary.locator('.region-dot')).toHaveCount(0);
    await expect(summary.locator('.region-chevron')).toBeVisible();
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await summary.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.region-card')).toHaveAttribute('open', '');
    await expect(summary.locator('small')).toHaveCount(0);
  });
}
