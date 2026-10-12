import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, readdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const label = process.argv[2] ?? 'measurement';
if (!/^[\w-]+$/.test(label)) throw new Error('Use a simple measurement label');
const dist = resolve(process.argv[3] ?? 'dist');
const evidence = resolve('.cache/gboheme-benchmark', label);
await mkdir(evidence, { recursive: true });
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const file = pathname === '/dashboard' || pathname === '/' ? resolve(dist, 'dashboard.html') : resolve(dist, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(dist + sep)) throw new Error('Invalid path');
    const body = await readFile(file);
    const headers = { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' };
    if (label === 'serve') {
      const config = JSON.parse(await readFile(resolve('vercel.json'), 'utf8'));
      const csp = config.headers.flatMap(rule => rule.headers).find(header => header.key === 'Content-Security-Policy');
      if (csp) headers['Content-Security-Policy'] = csp.value;
    }
    response.writeHead(200, headers);
    response.end(body);
  } catch { response.writeHead(404); response.end('Unavailable'); }
});
await new Promise((done, reject) => { server.once('error', reject); server.listen(label === 'serve' ? 4187 : 0, '127.0.0.1', done); });
const base = 'http://127.0.0.1:' + server.address().port;
if (label === 'serve') { console.log('Built dashboard with deployed CSP at ' + base); await new Promise(() => {}); }
const profiles = [
  { name: 'phone-2gb-signals', width: 390, height: 844, memory: 2, cores: 2, cpu: 4 },
  { name: 'phone-4gb-signals', width: 390, height: 844, memory: 4, cores: 4, cpu: 4 },
  { name: 'desktop-4gb-signals', width: 1280, height: 800, memory: 4, cores: 4, cpu: 2 },
  { name: 'desktop-8gb-signals', width: 1280, height: 800, memory: 8, cores: 8, cpu: 1 },
];
let browser;
const rows = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, serviceWorkers: 'block', locale: 'ar-IQ' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let apiRequests = 0; let bytes = 0; let networkRequests = 0;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable'); await cdp.send('Network.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    cdp.on('Network.loadingFinished', event => { bytes += event.encodedDataLength; });
    cdp.on('Network.requestWillBeSent', () => { networkRequests++; });
    await page.addInitScript(({ memory, cores }) => {
      Object.defineProperty(navigator, 'deviceMemory', { get: () => memory });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores });
      localStorage.setItem('wm-locale-explicit', 'ar');
      localStorage.setItem('ghboheme-connectors-v1', JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ id: 'github:fixture' + i, kind: 'github', target: 'fixture/repo' + i, enabled: true, intervalMinutes: 60 }))));
    }, profile);
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === base) { await route.continue(); return; }
      if (url.hostname === 'api.github.com') {
        apiRequests++;
        const repository = url.pathname.split('/').slice(2, 4).join('/');
        await route.fulfill({ json: Array.from({ length: 20 }, (_, i) => ({ html_url: 'https://github.com/' + repository + '/releases/tag/v3.0.' + i, tag_name: 'v3.0.' + i, name: 'AI agents Iraq security release ' + repository + ' update ' + i, published_at: '2026-10-12T06:00:00Z', body: 'Official software release notes with security fixes, open source agents and energy monitoring.' })) });
      } else { await route.fulfill({ status: 204, body: '' }); }
    });
    const begin = performance.now();
    await page.goto(base + '/dashboard?intelligence=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-gboheme-ready="true"]');
    await page.waitForSelector('#gi-cards .gi-card');
    await page.waitForFunction(() => !document.querySelector('[data-action="refresh"]').disabled);
    const startupMs = performance.now() - begin;
    await page.evaluate(() => document.fonts.ready);
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
    const before = await metrics();
    const beforeApi = apiRequests;
    await page.evaluate(() => {
      window.__cardMutations = 0;
      new MutationObserver(records => { window.__cardMutations += records.length; }).observe(document.getElementById('app'), { childList: true, subtree: true });
    });
    const refreshStart = performance.now();
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-action="refresh"]').click();
      await page.waitForFunction(() => !document.querySelector('[data-action="refresh"]').disabled);
    }
    const refreshMs = performance.now() - refreshStart;
    const after = await metrics();
    const ui = await page.evaluate(() => ({ cardMutations: window.__cardMutations, cards: document.querySelectorAll('#gi-cards .gi-card').length, effective: document.documentElement.dataset.performanceMode ?? 'unconfigured', overflow: document.documentElement.scrollWidth > innerWidth }));
    await page.screenshot({ path: resolve(evidence, profile.name + '.png'), fullPage: true });
    rows.push({ profile, startupMs, refreshMs, refreshTaskMs: 1000 * (after.TaskDuration - before.TaskDuration), refreshScriptMs: 1000 * (after.ScriptDuration - before.ScriptDuration), heapBefore: before.JSHeapUsedSize, heapAfter: after.JSHeapUsedSize, networkRequests, transferredBytes: bytes, apiRequests, refreshApiRequests: apiRequests - beforeApi, ui, errors });
    await context.close();
  }
  const files = await readdir(resolve(dist, 'assets'));
  let jsBytes = 0; let jsGzipBytes = 0;
  for (const file of files.filter(file => file.endsWith('.js'))) { const data = await readFile(resolve(dist, 'assets', file)); jsBytes += data.length; jsGzipBytes += gzipSync(data).length; }
  const sw = await readFile(resolve(dist, 'sw.js'), 'utf8');
  const precacheUrls = [...sw.matchAll(/url:"([^"]+)"/g)].map(match => match[1]);
  let precacheBytes = 0; for (const file of precacheUrls) { try { precacheBytes += (await stat(resolve(dist, file))).size; } catch {} }
  const result = { label, head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), measuredAt: new Date().toISOString(), browser: browser.version(), production: true, serviceWorkers: 'blocked for main-page CPU/heap isolation; built precache size separately measured', limitations: 'Device signals and CPU throttle are simulated. No RAM cap, GPU usage, process RAM, FPS, live-source latency, long-session leak or production deployment measurements.', jsBytes, jsGzipBytes, precacheEntries: precacheUrls.length, precacheBytes, rows };
  await writeFile(resolve(evidence, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
