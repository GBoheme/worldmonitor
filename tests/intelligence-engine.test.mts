import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildIntelligenceEvents, independentPublisherCount, type IntelligenceArticle } from '../src/services/intelligence-engine.ts';
import { defaultPersonalNewsPreferences, classifyPersonalNewsWithConfidence } from '../src/services/personal-news.ts';
import { selectIntelligenceAlerts, inQuietHours } from '../src/services/intelligence-alerts.ts';
const now = Date.parse('2026-10-11T08:30:00Z');
const prefs = () => defaultPersonalNewsPreferences();
const article = (source = 'Reuters World', overrides: Partial<IntelligenceArticle> = {}): IntelligenceArticle => ({
  title: 'Iraq parliament announces emergency oil supply measures', source,
  link: `https://${source.startsWith('BBC') ? 'bbc.com' : 'reuters.com'}/news/1`, pubDate: new Date(now - 60_000), isAlert: true,
  threat: { level: 'high', category: 'economic', confidence: 0.9, source: 'ml' }, ...overrides,
});
const events = () => buildIntelligenceEvents([article(), article('BBC World')], prefs(), now);

describe('Intelligence processing', () => {
  it('keeps articles/updates in a timeline and counts publisher families', () => {
    const list = [article(), article('Reuters Business', { link: 'https://reuters.com/other' }), article('BBC World'),
      article('Reuters World', { pubDate: new Date(now - 20_000), snippet: 'Supply has resumed after emergency measures.' })];
    const event = buildIntelligenceEvents(list, prefs(), now)[0]!;
    assert.equal(event.articles.length, 4);
    assert.equal(event.publisherCount, 2);
    assert.equal(event.verification, 'corroborated');
    assert.equal(event.severity, 'high');
    assert.equal(event.summaryKind, 'source-extract');
    assert.ok(event.classification.categories.includes('iraq_local'));
    assert.ok(event.classification.categories.includes('economy_markets'));
  });
  it('does not conflate similar headlines, old events or unknown dates', () => {
    const list = [article(), article('BBC World', { title: 'Iran parliament announces emergency oil supply measures' }),
      article('BBC World', { pubDate: new Date(now - 24 * 60 * 60_000) }), article('BBC World', { pubDate: new Date('invalid') })];
    assert.equal(buildIntelligenceEvents(list, prefs(), now).length, 4);
  });
  it('same URL or syndicated content does not create independence', () => {
    assert.equal(independentPublisherCount([article(), article('BBC World', { link: article().link })]), 1);
    const snippet = 'This report is syndicated across several news outlets and carries the exact same article description and facts.';
    assert.equal(independentPublisherCount([article('Reuters World', { snippet }), article('BBC World', { snippet })]), 1);
  });
  it('high impact stays distinct from verification', () => {
    const event = buildIntelligenceEvents([article()], prefs(), now)[0]!;
    assert.equal(event.severity, 'high');
    assert.equal(event.verification, 'unconfirmed');
    assert.equal(selectIntelligenceAlerts([event], prefs(), [], now).length, 0);
  });
  it('uses optional upstream model evidence without requiring a paid model', () => {
    const label = classifyPersonalNewsWithConfidence(article('BBC', { title: 'Unclear headline', threat: { level: 'low', category: 'cyber', confidence: 0.85, source: 'ml' } }));
    assert.deepEqual(label.categories, ['cybersecurity']);
    assert.equal(label.method, 'upstream-model');
    assert.equal(classifyPersonalNewsWithConfidence({ title: 'Unspecified item' }).method, 'unclassified');
  });
  it('accepts official GitHub major releases only on the configured repository URL', () => {
    const release = article('GitHub:org/project', { title: 'GitHub org/project v2.0.0', link: 'https://github.com/org/project/releases/tag/v2.0.0',
      threat: undefined, isAlert: false, officialRelease: { repository: 'org/project', version: 'v2.0.0' } });
    assert.equal(buildIntelligenceEvents([release], prefs(), now)[0]!.verification, 'primary');
    assert.equal(buildIntelligenceEvents([release], prefs(), now)[0]!.severity, 'high');
    assert.equal(buildIntelligenceEvents([{ ...release, link: 'https://evil.com/org/project/releases/v2' }], prefs(), now)[0]!.verification, 'unconfirmed');
  });
});

describe('Local important-only alerts', () => {
  it('notifies high/critical corroborated events once, without medium/low notifications', () => {
    const list = events();
    const first = selectIntelligenceAlerts(list, prefs(), [], now);
    assert.equal(first.length, 1);
    assert.equal(selectIntelligenceAlerts(list, prefs(), first, now + 31 * 60_000).length, 0);
    assert.equal(selectIntelligenceAlerts(list.map(e => ({ ...e, severity: 'medium' })), prefs(), [], now).length, 0);
    assert.equal(selectIntelligenceAlerts(list.map(e => ({ ...e, severity: 'low' })), prefs(), [], now).length, 0);
  });
  it('does not re-alert for timestamp-only or extra-publisher changes', () => {
    const history = selectIntelligenceAlerts(events(), prefs(), [], now);
    const next = buildIntelligenceEvents([article('Reuters World', { pubDate: new Date(now + 31 * 60_000) }),
      article('BBC World'), article('AP News', { link: 'https://apnews.com/article/1' })], prefs(), now + 31 * 60_000);
    assert.equal(selectIntelligenceAlerts(next, prefs(), history, now + 31 * 60_000).length, 0);
  });
  it('allows substantial updates from an existing publisher after cooldown', () => {
    const history = selectIntelligenceAlerts(events(), prefs(), [], now);
    const nextNow = now + 31 * 60_000;
    const next = buildIntelligenceEvents([article(), article('BBC World'), article('Reuters World', {
      pubDate: new Date(nextNow), snippet: 'Emergency measures have now restored oil supply throughout the affected region.' })], prefs(), nextNow);
    assert.equal(selectIntelligenceAlerts(next, prefs(), history, nextNow).length, 1);
  });
  it('respects disabled sources, topics, off mode and quiet hours', () => {
    const settings = prefs();
    settings.notificationPolicy = 'off';
    assert.equal(selectIntelligenceAlerts(events(), settings, [], now).length, 0);
    settings.notificationPolicy = 'important_only';
    settings.disabledAlertSources = ['BBC World'];
    assert.equal(selectIntelligenceAlerts(events(), settings, [], now).length, 0);
    settings.disabledAlertSources = [];
    settings.disabledAlertCategories = events()[0]!.classification.categories;
    assert.equal(selectIntelligenceAlerts(events(), settings, [], now).length, 0);
    settings.quietHours = { enabled: true, start: 0, end: 0 };
    assert.equal(inQuietHours(settings, now), true);
  });
  it('suppresses stale/missing/future dates and caps bursts to three per ten minutes', () => {
    const list = events();
    for (const stamp of [0, now - 2 * 60 * 60_000, now + 10 * 60_000]) {
      assert.equal(selectIntelligenceAlerts(list.map(e => ({ ...e, lastUpdated: stamp })), prefs(), [], now).length, 0);
    }
    const many = Array.from({ length: 8 }, (_, index) => ({ ...list[0]!, id: `test-${index}` }));
    const first = selectIntelligenceAlerts(many, prefs(), [], now);
    assert.equal(first.length, 3);
    assert.equal(selectIntelligenceAlerts(many, prefs(), first, now + 60_000).length, 0);
  });
});
