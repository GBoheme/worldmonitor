import { FEEDS, INTEL_SOURCES, computeDefaultDisabledSources } from '@/config/feeds';
import { FREE_MAX_SOURCES } from '@/config/panels';
import { computeCapDisabledSources } from '@/services/source-cap';
import { initI18n, getCurrentLanguage } from '@/services/i18n';
import { loadIntelligenceFonts } from '@/services/intelligence-fonts';
import { safeStorageGet } from '@/utils/safe-storage';
import { intelligenceHash } from '@/services/intelligence-engine';
import type { IntelligenceConnectorConfig } from '@/services/intelligence-connectors';
import { IntelligenceWorkspace } from '@/components/IntelligenceWorkspace';

function defaultSources(): IntelligenceConnectorConfig[] {
  const defaultDisabled = new Set(computeDefaultDisabledSources('ar'));
  let disabled = defaultDisabled;
  try {
    const stored: unknown = JSON.parse(safeStorageGet('worldmonitor-disabled-feeds') ?? 'null');
    if (Array.isArray(stored)) disabled = new Set(stored.filter((name): name is string => typeof name === 'string'));
  } catch { /* preserve upstream defaults */ }
  // Observe the original free source cap; the new home never widens entitlements.
  const capped = computeCapDisabledSources(FEEDS, INTEL_SOURCES, disabled, FREE_MAX_SOURCES);
  const blocked = new Set([...disabled, ...capped]);
  const seen = new Set<string>();
  const sources: IntelligenceConnectorConfig[] = [];
  for (const feeds of Object.values(FEEDS)) {
    const feed = feeds.find(feed => !blocked.has(feed.name) && !seen.has(feed.name));
    if (!feed || sources.length >= 12) continue;
    const rawUrl = typeof feed.url === 'string' ? feed.url : feed.url.ar || feed.url.en || Object.values(feed.url)[0] || '';
    const parsed = new URL(rawUrl, location.origin);
    const target = parsed.searchParams.get('url') || rawUrl;
    seen.add(feed.name);
    sources.push({ id: `rss:${intelligenceHash(feed.name)}`, kind: 'rss', target, enabled: true, intervalMinutes: 30, feed });
  }
  sources.push({ id: 'github:worldmonitor', kind: 'github', target: 'GBoheme/worldmonitor', enabled: true, intervalMinutes: 60 },
    { id: 'x:account', kind: 'x', target: 'authorized-account', enabled: true, intervalMinutes: 60 },
    { id: 'facebook:page', kind: 'facebook', target: 'managed-page', enabled: true, intervalMinutes: 60 });
  return sources;
}

export async function initIntelligence(): Promise<void> {
  await initI18n({ waitForFullTranslation: true, defaultLocale: 'ar' });
  await loadIntelligenceFonts(getCurrentLanguage());
  const root = document.getElementById('app');
  if (!root) throw new Error('Application container missing');
  document.querySelector('.app-heading')?.remove();
  document.documentElement.classList.remove('wm-pro-banner-reserved');
  const workspace = new IntelligenceWorkspace(root, defaultSources());
  workspace.mount();
  window.addEventListener('pagehide', () => workspace.destroy(), { once: true });
}
