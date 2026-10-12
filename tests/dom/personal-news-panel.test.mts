import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClusteredEvent, NewsItem } from '@/types';
import { initTestI18n } from './helpers/i18n.mts';
const velocity = vi.hoisted(() => ({ enrich: vi.fn() }));
vi.mock('@/services', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), enrichWithVelocityML: velocity.enrich,
}));
import { NewsPanel } from '@/components/NewsPanel';
import { PERSONAL_NEWS_CHANGED_EVENT } from '@/services/personal-news';
beforeAll(initTestI18n);
const panels: NewsPanel[] = [];
afterEach(() => { for (const panel of panels.splice(0)) panel.destroy(); document.body.replaceChildren(); });
const news: NewsItem = { title: 'Oil prices', source: 'BBC', link: 'https://example.com/a', pubDate: new Date(), isAlert: false };

describe('Personal news panel lifecycle', () => {
  it.each(['new-input', 'destroy'] as const)('rejects late enrichment after %s', async action => {
    let finish!: (value: ClusteredEvent[]) => void;
    velocity.enrich.mockReturnValue(new Promise<ClusteredEvent[]>(resolve => { finish = resolve; }));
    const panel = new NewsPanel('personal-race', 'News', undefined, { clusterNews: async () => [] });
    panels.push(panel);
    const render = vi.spyOn(panel as unknown as { renderClusters: (clusters: ClusteredEvent[]) => void }, 'renderClusters');
    panel.renderNews([news]);
    await vi.waitFor(() => expect(velocity.enrich).toHaveBeenCalled());
    if (action === 'destroy') panel.destroy(); else panel.renderNews([]);
    finish([]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(render).not.toHaveBeenCalled();
    velocity.enrich.mockClear();
  });
  it('cannot resurrect time/source-filtered news after a preference change', () => {
    const panel = new NewsPanel('personal-filter', 'News', undefined, { clusterNews: async () => [] });
    panels.push(panel);
    panel.renderNews([news]);
    panel.renderFilteredEmpty('Outside the time range');
    const flat = vi.spyOn(panel as unknown as { renderFlat: (items: NewsItem[]) => void }, 'renderFlat');
    window.dispatchEvent(new CustomEvent(PERSONAL_NEWS_CHANGED_EVENT));
    expect(flat).not.toHaveBeenCalled();
  });
  it('removes listeners when destroyed', () => {
    const panel = new NewsPanel('personal-cleanup', 'News');
    panel.destroy();
    const render = vi.spyOn(panel, 'renderNews');
    window.dispatchEvent(new CustomEvent(PERSONAL_NEWS_CHANGED_EVENT));
    window.dispatchEvent(new StorageEvent('storage', { key: 'ghboheme-personal-news-v1' }));
    expect(render).not.toHaveBeenCalled();
  });
});
