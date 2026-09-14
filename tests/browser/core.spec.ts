import { test, expect } from '@playwright/test';
import { fixture } from '../map-fixture.js';

test.beforeEach(async ({ context }) => {
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
  await page.getByRole('tab',{name:'My passport',exact:true}).click();
  await page.locator('#map-download').click();
  await expect(page.locator('#map-status')).toContainText('Map available on this device');
  await page.getByRole('tab',{name:'Explore',exact:true}).click();
  await expect(page.getByLabel('Notes',{exact:false})).toHaveValue('Keep this draft');
  await page.getByRole('button',{name:'Save check-in'}).click();
  // A click does not await the asynchronous IndexedDB save. Reload only after confirmation.
  await expect(page.getByRole('button',{name:'Visit saved',exact:true})).toBeVisible();
  await expect(page.locator('#overall strong')).toHaveText('1 / 2');
  await page.reload();
  await expect(page.locator('.airport-map-hit')).toHaveCount(2);
  await expect(page.locator('#overall strong')).toHaveText('1 / 2');
  await page.getByRole('tab',{name:'My passport',exact:true}).click();
  await expect(page.locator('#map-status')).toContainText('Map available on this device');
  await page.locator('#map-delete').click();
  await expect(page.locator('#map-status')).toContainText('Map not available offline');
  await expect(page.locator('#overall strong')).toHaveText('1 / 2');
  await page.getByRole('tab',{name:'Explore',exact:true}).click();
  await page.locator('[data-airport="AAA"]').click();
  await expect(page.locator('.history article')).toHaveCount(1);
  await expect(page.locator('.history')).toContainText('Keep this draft');
  await page.goto('/tests/browser/app.html?program=other');
  await expect(page.locator('.airport-map-hit')).toHaveCount(2);
  await page.getByRole('tab',{name:'My passport',exact:true}).click();
  await expect(page.locator('#map-status')).toContainText('Map not available offline');
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
    await tab.getByRole('tab',{name:'My passport',exact:true}).click();
    await expect(tab.locator('#map-download')).toBeEnabled();
  }
  await page.locator('#map-download').click();
  await expect(other.locator('#map-status')).toContainText('Map available on this device');
  await other.locator('#map-delete').click();
  await expect(page.locator('#map-status')).toContainText('Map not available offline');
  await other.close();
});

test('marker outlines adapt when the viewport crosses the mobile breakpoint', async ({ page }) => {
  await page.goto('/tests/browser/app.html');
  await expect(page.locator('.airport-map-hit')).toHaveCount(2);
  const stroke = () => page.evaluate(() => {
    const fixture = window as unknown as { fixtureApp: { map: { map: import('maplibre-gl').Map } } };
    return fixture.fixtureApp?.map.map.getPaintProperty('passport-airports','circle-stroke-width');
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
  await page.getByRole('tab',{name:'My passport',exact:true}).click();
  await expect(page.locator('#map-status')).toContainText('cannot safely coordinate map downloads');
  await page.locator('#map-download').click();
  await expect(page.locator('#map-status')).toContainText('cannot safely coordinate map downloads');
  await page.getByRole('tab',{name:'Explore',exact:true}).click();
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
