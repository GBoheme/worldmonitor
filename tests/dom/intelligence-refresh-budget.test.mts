import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntelligenceWorkspace } from '@/components/IntelligenceWorkspace';
import { IntelligenceConnector } from '@/services/intelligence-connectors';
import type { IntelligenceArticle } from '@/services/intelligence-engine';
vi.mock('@/services/i18n', () => ({ t: (key: string) => key, getCurrentLanguage: () => 'en', getLocale: () => 'en', changeLanguage: vi.fn() }));
const now = Date.parse('2026-10-12T08:00:00Z');
const config = { id: 'github:test', kind: 'github' as const, target: 'GBoheme/worldmonitor', enabled: true, intervalMinutes: 15 };
const release = { html_url: 'https://github.com/GBoheme/worldmonitor/releases/tag/v3.0.0', tag_name: 'v3.0.0', name: 'AI agents release', published_at: new Date(now - 60000).toISOString(), body: 'Official software security release notes' };
interface InspectWorkspace { refresh(): Promise<void>; render(): void; rebuild(): void; articles: IntelligenceArticle[] }
let workspace: IntelligenceWorkspace;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); localStorage.clear(); document.body.replaceChildren(); vi.stubGlobal('fetch', vi.fn(async () => Response.json([release]))); });
afterEach(() => { workspace?.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function createWorkspace(): InspectWorkspace {
  const root = document.createElement('div'); document.body.append(root);
  workspace = new IntelligenceWorkspace(root, [config]);
  return workspace as unknown as InspectWorkspace;
}
describe('Intelligence refresh resource budget', () => {
  it('does not rebuild or replace cards while all connectors remain inside TTL', async () => {
    const probe = createWorkspace(); await probe.refresh();
    const render = vi.spyOn(probe, 'render'); const rebuild = vi.spyOn(probe, 'rebuild');
    const sync = vi.spyOn(IntelligenceConnector.prototype, 'sync');
    for (let index = 0; index < 3; index++) { vi.setSystemTime(now + (index + 1) * 60000); await probe.refresh(); }
    expect(sync).not.toHaveBeenCalled(); expect(rebuild).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1); expect(probe.articles).toHaveLength(1);
    vi.setSystemTime(now + 15 * 60000); await probe.refresh(); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('retains one last-good copy through a failed due refresh and repeated backoff', async () => {
    const probe = createWorkspace(); await probe.refresh();
    vi.mocked(fetch).mockResolvedValue(new Response('unavailable', { status: 503 }));
    vi.setSystemTime(now + 15 * 60000); await probe.refresh();
    expect(probe.articles).toHaveLength(1); expect(probe.articles[0]?.link).toBe(release.html_url);
    vi.setSystemTime(now + 15 * 60000 + 1000); await probe.refresh(); expect(probe.articles).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
