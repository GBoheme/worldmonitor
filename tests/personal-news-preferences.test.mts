import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PERSONAL_NEWS_CATEGORIES,
  defaultPersonalNewsPreferences,
  parsePersonalNewsPreferences,
  classifyPersonalNews,
  filterPersonalNews,
  deduplicatePersonalNews,
} from '../src/services/personal-news.ts';
import type { NewsItem } from '../src/types/index.ts';

const date = new Date('2026-10-11T08:00:00Z');
const item = (title: string, source = 'Reuters', link = 'https://example.com/a'): NewsItem =>
  ({ title, source, link, pubDate: date, isAlert: false });

describe('GBoheme personal news preferences', () => {
  it('defaults to ten enabled topics, Arabic/English and important-only alerts', () => {
    const prefs = defaultPersonalNewsPreferences();
    assert.equal(PERSONAL_NEWS_CATEGORIES.length, 10);
    assert.ok(Object.values(prefs.categories).every(Boolean));
    assert.deepEqual(prefs.languages, ['ar', 'en']);
    assert.equal(prefs.notificationPolicy, 'important_only');
  });

  it('rejects malformed preference JSON and ignores untrusted category types', () => {
    assert.equal(parsePersonalNewsPreferences('{').categories.ai_agents, true);
    const parsed = parsePersonalNewsPreferences('{"categories":{"ai_agents":false,"energy_oil":"false"}}');
    assert.equal(parsed.categories.ai_agents, false);
    assert.equal(parsed.categories.energy_oil, true);
  });

  it('recognizes Arabic and English topics and allows overlap', () => {
    assert.ok(classifyPersonalNews(item('أوبك تعلن تغييرات في إنتاج النفط')).includes('energy_oil'));
    assert.ok(classifyPersonalNews(item('GitHub open-source AI agents')).includes('ai_agents'));
    assert.ok(classifyPersonalNews(item('GitHub open-source AI agents')).includes('open_source_github'));
  });

  it('hides disabled classified stories, retaining unknown and overlapping topics', () => {
    const prefs = defaultPersonalNewsPreferences();
    prefs.categories.energy_oil = false;
    const list = [item('OPEC crude oil prices'), item('Unknown headline about an unspecified event'),
      item('Oil prices and stock market')];
    const titles = filterPersonalNews(list, prefs).map(n => n.title);
    assert.deepEqual(titles, [list[1]!.title, list[2]!.title]);
  });

  it('always retains high-threat or breaking alerts when their topic is disabled', () => {
    const prefs = defaultPersonalNewsPreferences();
    prefs.categories.energy_oil = false;
    const urgent = { ...item('OPEC crude oil prices'), isAlert: true };
    const high = { ...item('Brent crude oil prices'), threat: { level: 'high' as const, category: 'conflict' as never, confidence: 0.9, source: 'keyword' as const } };
    assert.deepEqual(filterPersonalNews([urgent, high], prefs), [urgent, high]);
  });

  it('deduplicates tracking-link copies without suppressing other publishers', () => {
    const news = [
      item('Major discovery', 'Reuters', 'https://example.com/a?utm_source=x'),
      item('Major discovery', 'Reuters', 'https://example.com/a?utm_source=y'),
      item('Major discovery', 'BBC', 'https://example.com/a?utm_source=y'),
    ];
    assert.equal(deduplicatePersonalNews(news).length, 2);
  });
});
