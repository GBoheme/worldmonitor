import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
test('built PWA reloads cached news offline through its actual service worker',async({page,context})=>{
 await page.addInitScript(()=>{if(localStorage.getItem('gi-pwa-seeded'))return;localStorage.setItem('gi-pwa-seeded','true');localStorage.setItem('wm-locale-explicit','ar');localStorage.setItem('ghboheme-connectors-v1',JSON.stringify([{id:'github:pwa',kind:'github',target:'GBoheme/worldmonitor',enabled:true,intervalMinutes:60}]));});
 await page.route('https://api.github.com/repos/GBoheme/worldmonitor/releases?*',route=>route.fulfill({json:[{html_url:'https://github.com/GBoheme/worldmonitor/releases/tag/v3.0.0',tag_name:'v3.0.0',name:'Offline AI release fixture',published_at:new Date(Date.now()-60000).toISOString(),body:'Source text retained on this device.'}]}));
 await page.goto('/dashboard?intelligence=1');await expect(page.locator('html')).toHaveAttribute('data-gboheme-ready','true');await expect(page.locator('#gi-cards .gi-card')).toHaveCount(1);
 await page.locator('[data-action="save"]').click();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
 const globe = readdirSync(resolve(process.cwd(), 'dist/assets')).find(file => /^GlobeMap-.*\.js$/.test(file));
 expect(globe).toBeDefined();
 const asset = '/assets/' + globe;
 const cached = () => page.evaluate(async url => {
   const keys = await caches.keys();
   for (const key of keys) { if (await (await caches.open(key)).match(url)) return true; }
   return false;
 }, asset);
 expect(await cached()).toBe(false); // optional map engine is absent until requested
 await page.evaluate(async url => { const response = await fetch(url); if (!response.ok) throw new Error('Lazy asset unavailable'); await response.arrayBuffer(); }, asset);
 await expect.poll(cached).toBe(true);
 await context.setOffline(true);
 expect(await page.evaluate(async url => (await fetch(url)).ok, asset)).toBe(true);
 await page.reload();
 await expect(page.locator('#t-title')).toContainText('GBoheme Intelligence');await expect(page.locator('article')).toHaveCount(1);await expect(page.locator('article')).toContainText('Offline AI release fixture');await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await page.screenshot({path:resolve(process.cwd(),'../../outputs/gboheme-offline-ar.png'),fullPage:true});
});
