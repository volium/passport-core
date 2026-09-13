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
  await page.reload();
  await expect(page.locator('.airport-map-hit')).toHaveCount(2);
  await page.getByRole('tab',{name:'My passport',exact:true}).click();
  await expect(page.locator('#map-status')).toContainText('Map available on this device');
  await page.locator('#map-delete').click();
  await expect(page.locator('#map-status')).toContainText('Map not available offline');
  await expect(page.locator('#overall')).toContainText('1');
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
