import { test, expect } from '@playwright/test';
import { fixture } from '../map-fixture.js';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { for(const id of ['independent-core','other']) localStorage.setItem(`passport:${id}:offline-introduction:browser`,'seen'); });
  const { env } = await fixture();
  await context.route('https://fixture.invalid/**', async route => {
    const response = await env.fetch(route.request().url());
    await route.fulfill({status:200,body:Buffer.from(await response.arrayBuffer()),headers:{'access-control-allow-origin':'*'}});
  });
});

test('core mounts, filters, preserves drafts, installs, reopens and deletes independently', async ({ page }) => {
  await page.goto('/tests/browser/app.html');
  await expect(page.locator('.airport-map-hit')).toHaveCount(2);
  await page.locator('[data-airport="AAA"]').click();
  await page.getByLabel('Notes', {exact:false}).fill('Keep this draft');
  await page.locator('#offline-access').click();
  await page.locator('#map-download').click();
  await expect(page.locator('#map-status')).toContainText('Map available on this device');
  await page.locator('#offline-close').click();
  await expect(page.getByLabel('Notes',{exact:false})).toHaveValue('Keep this draft');
  await page.getByRole('button',{name:'Save check-in'}).click();
  // A click does not await the asynchronous IndexedDB save. Reload only after confirmation.
  await expect(page.getByRole('button',{name:'Visit saved',exact:true})).toBeVisible();
  await expect(page.locator('#overall strong')).toHaveText('1 / 2');
  await page.reload();
  await expect(page.locator('.airport-map-hit')).toHaveCount(2);
  await expect(page.locator('#overall strong')).toHaveText('1 / 2');
  await page.locator('#offline-access').click();
  await expect(page.locator('#map-status')).toContainText('Map available on this device');
  await page.evaluate(() => (window as unknown as {fixtureApp:{offline:{delete:()=>Promise<void>}}}).fixtureApp.offline.delete());
  await expect(page.locator('#map-status')).toContainText('Map not downloaded');
  await expect(page.locator('#overall strong')).toHaveText('1 / 2');
  await page.locator('#offline-close').click();
  await page.locator('[data-airport="AAA"]').click();
  await expect(page.locator('.history article')).toHaveCount(1);
  await expect(page.locator('.history')).toContainText('Keep this draft');
  await page.goto('/tests/browser/app.html?program=other');
  await expect(page.locator('.airport-map-hit')).toHaveCount(2);
  await page.locator('#offline-access').click();
  await expect(page.locator('#map-status')).toContainText('Map not downloaded');
  await expect(page.locator('#overall strong')).toHaveText('0 / 2');
});

test('passport remains usable without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type: string, ...args: unknown[]) {
      if (type.startsWith('webgl')) return null;
      return Reflect.apply(original, this, [type,...args]);
    } as typeof original;
  });
  await page.goto('/tests/browser/app.html');
  await expect(page.locator('#map')).toContainText('Interactive maps are unavailable');
  await page.locator('[data-airport="AAA"]').click();
  await page.getByRole('button',{name:'Save check-in'}).click();
  await expect(page.locator('#overall strong')).toHaveText('1 / 2');
});

test('map installation and deletion refresh another tab without sharing program visits', async ({ page, context }) => {
  const other = await context.newPage();
  for (const tab of [page,other]) {
    await tab.goto('/tests/browser/app.html');
    await expect(tab.locator('.airport-map-hit')).toHaveCount(2);
    await tab.locator('#offline-access').click();
    await expect(tab.locator('#map-download')).toBeEnabled();
  }
  await page.locator('#map-download').click();
  await expect(other.locator('#map-status')).toContainText('Map available on this device');
  await other.evaluate(() => (window as unknown as {fixtureApp:{offline:{delete:()=>Promise<void>}}}).fixtureApp.offline.delete());
  await expect(page.locator('#map-status')).toContainText('Map needs attention');
  await other.close();
});

test('marker outlines adapt when the viewport crosses the mobile breakpoint', async ({ page }) => {
  await page.goto('/tests/browser/app.html');
  await expect(page.locator('.airport-map-hit')).toHaveCount(2);
  const stroke = () => page.evaluate(() => {
    const fixture = window as unknown as { fixtureApp: { map: { map: import('maplibre-gl').Map } } };
    const map = fixture.fixtureApp?.map.map;
    return map?.getLayer('passport-airports') ? map.getPaintProperty('passport-airports','circle-stroke-width') : undefined;
  });
  await expect.poll(stroke).toBe(3);
  await page.setViewportSize({width:600,height:800});
  await expect.poll(stroke).toBe(1.5);
  await page.setViewportSize({width:1000,height:800});
  await expect.poll(stroke).toBe(3);
});

test('missing secure-context map APIs explain the limitation and leave passport workflows usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator,'locks',{value:undefined});
    Object.defineProperty(crypto,'randomUUID',{value:undefined});
  });
  await page.goto('/tests/browser/app.html');
  await expect(page.locator('.airport-map-hit')).toHaveCount(2);
  await page.locator('#offline-access').click();
  await expect(page.locator('#map-status')).toContainText('cannot safely coordinate map downloads');
  await page.locator('#map-download').click();
  await expect(page.locator('#map-status')).toContainText('cannot safely coordinate map downloads');
  await page.locator('#offline-close').click();
  await page.locator('[data-airport="AAA"]').click();
  await page.getByRole('button',{name:'Save check-in'}).click();
  await expect(page.locator('#overall strong')).toHaveText('1 / 2');
});


test('wheel zoom works over airport markers in both directions', async ({ page }) => {
  await page.goto('/tests/browser/app.html');
  const marker = page.locator('.airport-map-hit').first();
  await expect(marker).toBeVisible();
  const zoom = () => page.evaluate(() => (window as unknown as { fixtureApp: { map: { map: import('maplibre-gl').Map } } }).fixtureApp.map.map.getZoom());
  const initial = await zoom();
  await marker.hover();
  await page.mouse.wheel(0, -400);
  await expect.poll(zoom).toBeGreaterThan(initial + 0.5);
  // Finish the first wheel animation before testing the opposite direction.
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixtureApp: { map: { map: import('maplibre-gl').Map } } }).fixtureApp.map.map.isMoving())).toBe(false);
  const closer = await zoom();
  await marker.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(zoom).toBeLessThan(closer - 0.5);
  await marker.focus();
  await page.keyboard.press('Enter');
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
});

test.describe('touch gestures', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const direction of ['in', 'out'] as const) test('pinch ' + direction + ' starting on a marker zooms the map without zooming the page', async ({ page, context }) => {
    await page.goto('/tests/browser/app.html');
    const marker = page.locator('.airport-map-hit').first();
    await expect(marker).toBeVisible();
    await page.evaluate(() => (window as unknown as { fixtureApp: { map: { map: import('maplibre-gl').Map } } }).fixtureApp.map.map.jumpTo({ center: [-120, 47], zoom: 10 }));
    const box = (await marker.boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const zoom = () => page.evaluate(() => (window as unknown as { fixtureApp: { map: { map: import('maplibre-gl').Map } } }).fixtureApp.map.map.getZoom());
    const initial = await zoom();
    const scale = await page.evaluate(() => window.visualViewport!.scale);
    const session = await context.newCDPSession(page);
    const points = (distance: number) => {
      const offset = direction === 'in' ? distance : -distance;
      return [{ x: x - offset, y, id: 0 }, { x: x + (direction === 'in' ? 60 : 140) + offset, y, id: 1 }];
    };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
    for (let distance = 4; distance <= 40; distance += 4) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (direction === 'in') await expect.poll(zoom).toBeGreaterThan(initial + 0.5);
    else await expect.poll(zoom).toBeLessThan(initial - 0.5);
    expect(await page.evaluate(() => window.visualViewport!.scale)).toBeCloseTo(scale);
    await expect(marker).toHaveAttribute('aria-pressed', 'false');
    await marker.tap();
    await expect(marker).toHaveAttribute('aria-pressed', 'true');
    await session.detach();
  });
});

test('offline card is independent, dismissible, and hides granted protection', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage,'persisted',{value:async()=>true});
    Object.defineProperty(navigator.storage,'persist',{value:async()=>{throw Error('should not request')}});
  });
  await page.goto('/tests/browser/app.html?program=onboarding');
  await expect(page.locator('#offline-card')).toBeVisible();
  await expect(page.locator('#storage-protection')).toBeHidden();
  const setup=page.locator('#offline-setup details');
  await setup.locator('summary').click();await expect(setup).toHaveAttribute('open','');
  await page.keyboard.press('Space');await expect(setup).not.toHaveAttribute('open','');
  await page.keyboard.press('Escape');await expect(page.locator('#offline-card')).toBeHidden();await expect(page.locator('#offline-access')).toBeFocused();
  await page.locator('[data-airport="AAA"]').click();await page.getByLabel('Notes',{exact:false}).fill('Card preserves draft');
  await page.locator('#offline-access').click();await page.locator('#map-download').click();
  await expect(page.locator('#map-status')).toContainText('Map available on this device');
  await expect(page.locator('#map-delete')).toHaveCount(0);
  await page.locator('#offline-close').click();await expect(page.getByLabel('Notes',{exact:false})).toHaveValue('Card preserves draft');
  await page.locator('#passport-tab').click();await page.locator('#offline-access').click();await page.keyboard.press('Escape');await expect(page.locator('#passport-tab')).toHaveAttribute('aria-selected','true');
  await page.reload();await expect(page.locator('#offline-card')).toBeHidden();
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#offline-access')).toBeVisible();await page.locator('#offline-access').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('standalone launch downloads automatically with a single persistence request', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator,'standalone',{value:true});
    Object.defineProperty(navigator.storage,'persisted',{value:async()=>false});
    Object.defineProperty(navigator.storage,'persist',{value:async()=>{const key='requests';localStorage.setItem(key,String(Number(localStorage.getItem(key)||0)+1));return false;}});
  });
  await page.goto('/tests/browser/app.html?program=standalone-test');
  await expect(page.locator('#map-status')).toContainText('Map available on this device');
  await expect(page.locator('#offline-setup')).toBeHidden();await page.locator('#storage-protection').click();
  await expect(page.locator('#protection-details')).toHaveAttribute('open','');
  await page.reload();await expect(page.locator('#offline-summary')).toContainText('Map available offline');
  expect(await page.evaluate(()=>localStorage.getItem('requests'))).toBe('1');
});


test('renderer retry clears its warning without clearing unrelated feedback', async ({ page }) => {
  await page.route('https://fixture.invalid/style',route=>route.abort());
  await page.goto('/tests/browser/app.html');
  await page.locator('#offline-access').click();
  await expect(page.locator('#map-renderer-status')).toBeVisible();
  await page.evaluate(()=>{document.querySelector('#notice')!.textContent='Keep unrelated save feedback';});
  await page.unroute('https://fixture.invalid/style');
  await page.locator('#map-retry').click();
  await expect(page.locator('#map')).toHaveAttribute('data-basemap-state','ready');
  await expect(page.locator('#map-renderer-status')).toBeHidden();
  await expect(page.locator('#notice')).toHaveText('Keep unrelated save feedback');
});


test('export feedback belongs to its button, expires, and leaves unrelated notices intact', async ({ page }) => {
  await page.goto('/tests/browser/app.html');
  await page.locator('#passport-tab').click();
  await page.evaluate(()=>{document.querySelector('#passport-notice')!.textContent='Existing import feedback';});
  const download=page.waitForEvent('download');await page.locator('#export').click();await download;
  await expect(page.locator('#export-status')).toContainText('Passport exported.');
  const widths = await page.locator('.backup-actions').first().boundingBox();
  expect((await page.locator('#export-status').boundingBox())!.width).toBeCloseTo(widths!.width, 0);
  await page.locator('#explore-tab').click();
  await page.locator('#storage-protection').click();
  const second=page.waitForEvent('download');await page.locator('#offline-export').click();await second;
  await expect(page.locator('#offline-export-status')).toContainText('Passport exported.');
  await expect(page.locator('#notice')).not.toContainText('Passport exported.');
  await expect(page.locator('#passport-notice')).toHaveText('Existing import feedback');
  await expect(page.locator('#offline-export-status')).toHaveText('',{timeout:7000});
  await expect(page.locator('#export-status')).toHaveText('');
});


test('initial card title has no focus highlight while keyboard controls retain theirs', async ({ page }) => {
  await page.goto('/tests/browser/app.html?program=focus-test');
  await expect(page.locator('#offline-heading')).toBeFocused();
  await expect(page.locator('#offline-heading')).toHaveCSS('outline-style','none');
  await page.keyboard.press('Tab');await expect(page.locator('#offline-close')).toBeFocused();
  await expect(page.locator('#offline-close')).toHaveCSS('outline-style','solid');
  await page.keyboard.press('Escape');await expect(page.locator('#offline-access')).toBeFocused();
});
