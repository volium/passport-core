import { test, expect } from '@playwright/test';
test.beforeEach(async ({page}) => { await page.addInitScript(()=>localStorage.setItem('passport:independent-core:offline-introduction:browser','seen')); });
async function launch(page: import('@playwright/test').Page) {
  await page.goto('/tests/browser/app.html?gps');
  await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
  await page.locator('#quick-checkin').click();
}
test('GPS saves timestamp evidence offline, round trips backup and preserves notes on edits',async({page,context})=>{
  await context.grantPermissions(['geolocation']); await context.setGeolocation({latitude:47,longitude:-120,accuracy:20});
  await launch(page); await context.setOffline(true);
  await page.getByRole('button',{name:'Use my location',exact:true}).click();
  await page.locator('[data-match="0"]').click();
  await page.locator('#gps-form textarea').fill('GPS stop');
  await page.locator('#gps-form button[type=submit]').click();
  await expect(page.locator('.gps-checkin')).not.toBeVisible();
  await expect(page.locator('#overall')).toContainText('1 / 2');
  await context.setOffline(false);
  await page.getByRole('tab',{name:'My passport',exact:true}).click();
  const downloadEvent=page.waitForEvent('download'); await page.locator('#export').click();
  const download=await downloadEvent; const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream!) chunks.push(chunk);
  const backup=JSON.parse(Buffer.concat(chunks).toString()); expect(backup.schemaVersion).toBe(4);expect(backup.checkIns[0].verification.status).toBe('verified');expect(backup.checkIns[0].timeKnown).toBe(true);
  await page.locator('#import').setInputFiles({name:'gps.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.locator('#passport-notice')).toContainText('Imported 0');
  await page.getByRole('tab',{name:'Explore',exact:true}).click(); await page.locator('[data-airport="AAA"]').click();
  await page.locator('#history-heading').click(); await expect(page.locator('.history')).toContainText('Location confirmed nearby');
  await page.getByRole('button',{name:'Edit',exact:true}).click(); await page.locator('#checkin textarea').fill('Updated notes'); await page.locator('#checkin [type=submit]').click();
  await expect(page.locator('.history')).toContainText('Location confirmed nearby');
  await page.getByRole('button',{name:'Edit',exact:true}).click(); await page.locator('#checkin [name=date]').fill('2026-01-01');await page.locator('#checkin [type=submit]').click();
  await page.getByRole('button',{name:'Change date',exact:true}).click(); await page.getByRole('button',{name:'Save and move stamp',exact:true}).click();
  await expect(page.locator('.history')).toContainText('Unverified');
});
test('overlapping airport radii require explicit airport selection',async({page,context})=>{
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:47.05,longitude:-119.95,accuracy:20});
  await page.addInitScript(()=>{ Object.defineProperty(navigator.geolocation,'watchPosition',{value:(success:PositionCallback)=>{setTimeout(()=>success({coords:{latitude:47,longitude:-120,accuracy:20},timestamp:Date.now()} as GeolocationPosition),10);return 1;}}); });
  await page.goto('/tests/browser/app.html?gps&wide'); await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');await page.locator('#quick-checkin').click();await page.getByRole('button',{name:'Use my location',exact:true}).click();
  await expect(page.locator('[data-match]')).toHaveCount(2); await page.locator('[data-match="1"]').click(); await expect(page.locator('.gps-checkin')).toContainText('Airport BBB');await expect(page.locator('#overall')).toContainText('0 / 2');
});
for(const scenario of ['denied','poor','outside','cancel']) test('location '+scenario+' preserves manual fallback and never creates a visit',async({page,context})=>{
  if(scenario==='denied') await page.addInitScript(()=>{Object.defineProperty(navigator.geolocation,'watchPosition',{value:(_s:PositionCallback,e:PositionErrorCallback)=>{setTimeout(()=>e({code:1} as GeolocationPositionError),5);return 1;}});});
  else { await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:scenario==='outside'?0:47,longitude:-120,accuracy:scenario==='poor'||scenario==='cancel'?2000:20}); }
  await launch(page);await page.getByRole('button',{name:'Use my location',exact:true}).click();
  if(scenario==='cancel'){await page.locator('.gps-checkin [data-close]').click();await expect(page.locator('.gps-checkin')).not.toBeVisible();await expect(page.locator('#quick-checkin')).toBeFocused();}
  else {await expect(page.locator('.gps-checkin')).toContainText('Location not confirmed');await page.getByRole('button',{name:'Save manually',exact:true}).click();await page.locator('#gps-search').fill('AAA');await page.locator('[data-index="0"]').click();await expect(page.locator('#gps-form [name=date]')).toBeVisible();}
  await expect(page.locator('#overall')).toContainText('0 / 2');
});
test('phone manual modal preserves notes when discard is cancelled',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/tests/browser/app.html?gps');await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
  await page.getByRole('button',{name:'List',exact:true}).click();await page.locator('[data-airport="AAA"]').click();
  await page.locator('#open-visit-editor').click();await page.getByRole('button',{name:'Add a manual visit',exact:true}).click();
  await page.locator('#gps-form textarea').fill('Keep this draft');
  expect(await page.locator('.gps-checkin').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'Discard check-in?'}).getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.locator('#gps-form textarea')).toHaveValue('Keep this draft');
});

test('acquisition is opt-in, clears its watch and ignores late callbacks after cancellation',async({page})=>{
  await page.addInitScript(()=>{
    const state={calls:0,clears:0,success:undefined as PositionCallback|undefined};
    Object.assign(window,{locationProbe:state});
    Object.defineProperty(navigator.geolocation,'watchPosition',{value:(success:PositionCallback)=>{state.calls++;state.success=success;return 77;}});
    Object.defineProperty(navigator.geolocation,'clearWatch',{value:()=>state.clears++});
  });
  await launch(page);
  const probe=()=>page.evaluate(()=>(window as unknown as {locationProbe:{calls:number;clears:number}}).locationProbe);
  expect((await probe()).calls).toBe(0);
  await page.getByRole('button',{name:'Use my location',exact:true}).click();
  await page.locator('.gps-checkin [data-close]').click();
  expect((await probe()).clears).toBe(1);
  await page.evaluate(()=>{(window as unknown as {locationProbe:{success:PositionCallback}}).locationProbe.success({coords:{latitude:47,longitude:-120,accuracy:20},timestamp:Date.now()} as GeolocationPosition);});
  await expect(page.locator('.gps-checkin')).not.toBeVisible();
  await expect(page.locator('#overall')).toContainText('0 / 2');
  await page.locator('#quick-checkin').click();
  expect((await probe()).calls).toBe(2);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('.gps-checkin')).toContainText('stopped when the app was hidden');
  expect((await probe()).clears).toBe(2);
});

test('manual fallback saves a date-only visit and a failed write preserves notes',async({page})=>{
  await launch(page); await page.getByRole('button',{name:'Choose airport manually',exact:true}).click();
  await page.locator('#gps-search').fill('AAA');await page.locator('[data-index="0"]').click();
  await page.locator('#gps-form textarea').fill('Keep my notes');
  await page.evaluate(()=>{
    const app=(window as unknown as {fixtureApp:{store:{save:(...args:unknown[])=>Promise<void>}}}).fixtureApp;
    const save=app.store.save.bind(app.store); let first=true;
    app.store.save=async(...args)=>{if(first){first=false;throw Error('Storage unavailable');}return save(...args);};
  });
  await page.locator('#gps-form [type=submit]').click();
  await expect(page.locator('#gps-save-status')).toContainText('Storage unavailable');
  await expect(page.locator('#gps-form textarea')).toHaveValue('Keep my notes');
  await page.locator('#gps-form [type=submit]').click();await expect(page.locator('.gps-checkin')).not.toBeVisible();
  await expect(page.locator('#overall')).toContainText('1 / 2');
});

test('airport details has one action and always offers manual or location, without acquiring on open',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('passport:independent-core:location-introduction','seen');
    Object.defineProperty(navigator.geolocation,'watchPosition',{value:()=>{throw Error('Manual entry must never request location');}});
  });
  await page.goto('/tests/browser/app.html?gps');await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
  await page.locator('[data-airport="AAA"]').click();
  await expect(page.locator('#airport-location-checkin')).toHaveCount(0);
  await page.locator('#open-visit-editor').click();
  await expect(page.getByRole('button',{name:'Check in here',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Add a manual visit',exact:true})).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#open-visit-editor')).toBeFocused();
  await page.locator('#open-visit-editor').click();await page.getByRole('button',{name:'Add a manual visit',exact:true}).click();
  await expect(page.locator('.gps-checkin')).toBeVisible();await expect(page.locator('#gps-form [name=date]')).toBeVisible();
  await expect(page.locator('#checkin')).toBeHidden();
  expect(await page.locator('.gps-secondary').evaluate(el=>getComputedStyle(el).borderTopStyle)).toBe('solid');
  await page.locator('#gps-form textarea').fill('Manual airport visit');await page.locator('#gps-form [type=submit]').click();
  await expect(page.locator('#open-visit-editor')).toHaveText('Add another visit');
});

 test('visit action typography is shared by primary and secondary buttons', async ({ page }) => {
  await page.goto('/tests/browser/app.html?gps=1');
  await page.locator('[data-airport="AAA"]').click();
  const typography = (selector: string) => page.locator(selector).evaluate(el => { const s=getComputedStyle(el); return [s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight,s.borderRadius,s.minHeight]; });
  const expected = await typography('#open-visit-editor');
  expect(expected[2]).toBe('600');
  await page.locator('#open-visit-editor').click();
  expect(await typography('[data-here]')).toEqual(expected);
  expect(await typography('[data-manual]')).toEqual(expected);
  await page.locator('[data-manual]').click();
  expect(await typography('#gps-form [type=submit]')).toEqual(expected);
  expect(await typography('[data-location]')).toEqual(expected);
  await expect(page.locator('[data-location]')).toHaveText('Check in with GPS');
});
