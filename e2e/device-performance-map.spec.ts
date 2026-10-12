import { test, expect } from '@playwright/test';

test('economy starts on SVG and explicitly requested 3D returns safely to 2D', async ({page}) => {
 const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
 const globeRequests: string[] = []; page.on('request', request => { if (request.url().includes('/src/components/GlobeMap.ts')) globeRequests.push(request.url()); });
 await page.addInitScript(() => {
   if (sessionStorage.getItem('performance-map-seeded')) return;
   sessionStorage.setItem('performance-map-seeded', 'true');
   localStorage.setItem('wm-device-performance', 'economy');
   localStorage.setItem('wm-layer-warning-dismissed', 'true');
   localStorage.setItem('wm-pro-banner-launched-dismissed', String(Date.now()));
   localStorage.setItem('worldmonitor-mission-preset-dismissed-v1', '1');
 });
 await page.route('**/api/**', route => route.fulfill({json: {}}));
 await page.goto('/dashboard');
 await expect(page.locator('html')).toHaveAttribute('data-wm-event-handlers-ready', 'true');
 await expect(page.locator('#mapContainer.svg-mode:not([aria-busy])')).toBeVisible();
 expect(globeRequests).toHaveLength(0);
 await page.locator('#mapDimensionToggle [data-mode="globe"]').click();
 await expect(page.locator('#mapContainer.globe-mode:not([aria-busy])')).toBeVisible({timeout:45000});
 await expect(page.locator('#mapContainer canvas')).toBeVisible();
 expect(globeRequests).toHaveLength(1);
 await page.locator('#mapDimensionToggle [data-mode="flat"]').click();
 await expect(page.locator('#mapContainer.svg-mode:not([aria-busy])')).toBeVisible();
 await page.reload();
 await expect(page.locator('#mapContainer.svg-mode:not([aria-busy])')).toBeVisible();
 expect(errors).toEqual([]);
});
