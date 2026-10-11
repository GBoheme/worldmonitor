import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
const output=resolve(process.cwd(),'../../outputs');
async function seed(page: import('@playwright/test').Page) {
 await page.addInitScript(()=>{
  if(localStorage.getItem('gi-test-seeded')) return;
  localStorage.clear(); localStorage.setItem('gi-test-seeded','true');
  localStorage.setItem('ghboheme-connectors-v1',JSON.stringify([
   {id:'github:fixture',kind:'github',target:'GBoheme/worldmonitor',enabled:true,intervalMinutes:15},
   {id:'github:failed',kind:'github',target:'missing/repository',enabled:true,intervalMinutes:15},
   {id:'x:account',kind:'x',target:'authorized-account',enabled:true,intervalMinutes:60}
  ]));
 });
 await page.route('https://api.github.com/repos/**/releases?*',async route=>{
  if(route.request().url().includes('missing/repository')) { await route.fulfill({status:503,body:'unavailable'}); return; }
  await route.fulfill({json:[{html_url:'https://github.com/GBoheme/worldmonitor/releases/tag/v3.0.0',tag_name:'v3.0.0',name:'AI agents software release',published_at:new Date(Date.now()-60000).toISOString(),body:'Release notes: better AI agents, Iraq local coverage and security improvements. <img src=x onerror="window.giXss=true">'}]});
 });
 await page.goto('/dashboard?intelligence=1');
 await expect(page.locator('html')).toHaveAttribute('data-gboheme-ready','true');
 await expect.poll(()=>page.evaluate(()=>Array.from(document.fonts).some(font=>font.family.replaceAll('"','')==='Cairo' && font.status==='loaded'))).toBe(true);
 await expect(page.locator('#gi-cards .gi-card')).toHaveCount(1);
 await expect(page.locator('[data-action="refresh"]')).toBeEnabled();
}
test('Arabic workspace preserves interests, evidence, saved news and draft-only workflow',async({page})=>{
 const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
 await seed(page);
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await expect(page.getByRole('heading',{level:1})).toHaveText('إحاطتك الإخبارية');
 await expect(page.locator('.gi-card')).toContainText('إصدار رسمي');
 await expect(page.locator('.gi-card img')).toHaveCount(0);
 await page.locator('#gi-country').selectOption('IQ'); await expect(page.locator('#gi-cards .gi-card')).toHaveCount(1);
 await page.locator('#gi-time').selectOption('unknown'); await expect(page.locator('#gi-cards .gi-card')).toHaveCount(0);
 await page.locator('#gi-time').selectOption('day'); await expect(page.locator('#gi-cards .gi-card')).toHaveCount(1);
 await page.locator('#gi-time').selectOption(''); await page.locator('#gi-country').selectOption('');
 await expect(page.locator('.gi-root')).not.toContainText('intelligence.');
 await page.screenshot({path:resolve(output,'gboheme-desktop-ar.png'),fullPage:true});
 await page.locator('.gi-sidebar [data-section="settings"]').click();
 await expect(page.locator('[data-category]')).toHaveCount(10);
 const categoryIds=await page.locator('[data-category]').evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.category!));
 for(const id of categoryIds) await page.locator(`[data-category="${id}"]`).uncheck();
 await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-gboheme-ready','true');
 await expect(page.locator('[data-category="ai_agents"]')).not.toBeChecked();
 await expect(page.locator('[data-category]:checked')).toHaveCount(0);
 await page.locator('.gi-sidebar [data-section="home"]').click();
 await expect(page.locator('#gi-cards .gi-card')).toHaveCount(1); // high-impact release remains visible
 await page.locator('[data-action="save"]').click();
 await page.locator('.gi-sidebar [data-section="saved"]').click();
 await expect(page.locator('#gi-cards .gi-card')).toHaveCount(1);
 await page.locator('[data-action="draft"]').click();
 await expect(page.locator('textarea[data-draft]')).toHaveCount(2);
 await expect(page.locator('.gi-main article').getByRole('button',{name:/نشر|publish/i})).toHaveCount(0);
 await page.locator('textarea[data-draft]').first().fill('مسودة مُراجعة يدوياً');
 await page.locator('textarea[data-draft]').first().blur();
 await page.reload(); await expect(page.locator('textarea[data-draft]').first()).toHaveValue('مسودة مُراجعة يدوياً');
 await page.locator('.gi-sidebar [data-section="sources"]').click();
 await expect(page.locator('.gi-source-state')).toContainText(['جاهز','تعطل','يلزم تفويض']);
 await page.locator('[data-action="language"]').click();
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).direction)).toBe('ltr');
 await expect(page.getByRole('heading',{level:1})).toHaveText('Sources');
 await page.locator('.gi-sidebar [data-section="home"]').click();
 await page.locator('#gi-search').fill('no such article'); await expect(page.locator('#gi-cards .gi-card')).toHaveCount(0);
 await page.locator('#gi-search').fill('AI agents'); await expect(page.locator('#gi-cards .gi-card')).toHaveCount(1);
 await page.locator('[data-action="theme"]').click(); await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 expect(errors).toEqual([]);
});

test('GitHub modes persist and tag-only items keep unknown dates',async({page})=>{
 await page.route('https://api.github.com/repos/**/tags?*',async route=>route.fulfill({json:[{name:'v2.1.0',commit:{sha:'a'.repeat(40)}}]}));
 await seed(page);await page.locator('.gi-sidebar [data-section="sources"]').click();
 await page.locator('#gi-new-github-mode').selectOption('tags');await page.locator('#gi-new-target').fill('GBoheme/worldmonitor');
 await page.locator('[data-action="add-source"]').click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ghboheme-connectors-v1') ?? '[]').some((config:{githubMode?:string})=>config.githubMode==='tags'))).toBe(true);
 await expect(page.locator('[data-action="refresh"]')).toBeEnabled();
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-gboheme-ready','true');
 await page.locator('.gi-sidebar [data-section="github"]').click();
 await expect(page.locator('#gi-cards .gi-card')).toHaveCount(2);
 await page.locator('#gi-time').selectOption('unknown');await expect(page.locator('#gi-cards .gi-card')).toHaveCount(1);
 await expect(page.locator('#gi-cards .gi-card')).toContainText('تاريخ النشر غير معروف');
});
test('mobile Arabic navigation reaches all sections with no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844}); await seed(page);
 await expect(page.locator('.gi-bottom-nav')).toBeVisible(); await expect(page.locator('.gi-sidebar')).not.toBeVisible();
 await page.screenshot({path:resolve(output,'gboheme-mobile-ar.png'),fullPage:true});
 await page.locator('#gi-section').selectOption('sources'); await expect(page.getByRole('heading',{level:1})).toHaveText('المصادر');
 await page.locator('[data-connector="github:fixture"]').uncheck();
 await page.locator('#gi-section').selectOption('home'); await expect(page.locator('#gi-cards .gi-card')).toHaveCount(0);
 await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-gboheme-ready','true');
 await expect(page.locator('#gi-cards .gi-card')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('offline fallback renders stored source text safely without external bundles',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('ghboheme-saved-news-v1',JSON.stringify([{title:'Saved AI release',source:'Official',link:'https://example.com/news',snippet:'<img src=x onerror=alert(1)>',pubDateMissing:true,pubDate:new Date().toISOString()},{title:'Unsafe',source:'Unknown',link:'javascript:alert(1)'}]));});
 await page.goto('/offline.html?intelligence=1');
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await expect(page.locator('article')).toHaveCount(1);
 await expect(page.locator('article img')).toHaveCount(0);
 await expect(page.locator('article')).toContainText('تاريخ النشر غير معروف');
 await expect(page.locator('article')).toContainText('<img src=x');
});
