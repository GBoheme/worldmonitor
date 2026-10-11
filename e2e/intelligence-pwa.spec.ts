import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
test('built PWA reloads cached news offline through its actual service worker',async({page,context})=>{
 await page.addInitScript(()=>{if(localStorage.getItem('gi-pwa-seeded'))return;localStorage.setItem('gi-pwa-seeded','true');localStorage.setItem('wm-locale-explicit','ar');localStorage.setItem('ghboheme-connectors-v1',JSON.stringify([{id:'github:pwa',kind:'github',target:'GBoheme/worldmonitor',enabled:true,intervalMinutes:60}]));});
 await page.route('https://api.github.com/repos/GBoheme/worldmonitor/releases?*',route=>route.fulfill({json:[{html_url:'https://github.com/GBoheme/worldmonitor/releases/tag/v3.0.0',tag_name:'v3.0.0',name:'Offline AI release fixture',published_at:new Date(Date.now()-60000).toISOString(),body:'Source text retained on this device.'}]}));
 await page.goto('/dashboard?intelligence=1');await expect(page.locator('html')).toHaveAttribute('data-gboheme-ready','true');await expect(page.locator('#gi-cards .gi-card')).toHaveCount(1);
 await page.locator('[data-action="save"]').click();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
 await context.setOffline(true);await page.reload();
 await expect(page.locator('#t-title')).toContainText('GBoheme Intelligence');await expect(page.locator('article')).toHaveCount(1);await expect(page.locator('article')).toContainText('Offline AI release fixture');await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await page.screenshot({path:resolve(process.cwd(),'../../outputs/gboheme-offline-ar.png'),fullPage:true});
});
