import type { NewsItem } from '@/types';
import { declaredSourceTier } from '../../server/_shared/source-tiers';
import { publisherFamilyForItem } from '../../shared/publisher-families.js';
import { effectivePubDateMs } from './feed-date';
import { intelligenceCountryMentions } from './intelligence-geography';
import {
  canonicalPersonalNewsUrl, classifyPersonalNewsWithConfidence, deduplicatePersonalNews,
  normalizedPersonalNewsTitle, personalNewsArticleKey,
  type PersonalNewsClassification, type PersonalNewsPreferences,
} from './personal-news';

export type IntelligenceSeverity = 'critical' | 'high' | 'medium' | 'low';
export type VerificationState = 'primary' | 'corroborated' | 'unconfirmed';
export interface IntelligenceArticle extends NewsItem {
  /** Set by official connectors, never inferred from an arbitrary headline. */
  officialRelease?: { repository: string; version: string };
  releaseComparisonUrl?: string;
}
export interface IntelligenceEvent {
  id: string;
  articles: IntelligenceArticle[];
  primary: IntelligenceArticle;
  classification: PersonalNewsClassification;
  publisherCount: number;
  verification: VerificationState;
  severity: IntelligenceSeverity;
  score: number;
  reasons: Array<'impact' | 'corroboration' | 'primary' | 'recent' | 'interest' | 'reliable' | 'majorRelease' | 'geography'>;
  countryMentions: string[];
  firstSeen: number;
  lastUpdated: number;
  summary: string;
  summaryKind: 'source-extract';
}

export function intelligenceHash(value: string): string {
  let a = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) a = Math.imul(a ^ value.charCodeAt(i), 0x01000193);
  return (a >>> 0).toString(36);
}

export function officialRepositoryRelease(item: IntelligenceArticle): boolean {
  const release = item.officialRelease;
  const url = canonicalPersonalNewsUrl(item.link);
  if (!release || !url || !/^[\w.-]+\/[\w.-]+$/.test(release.repository)) return false;
  return new URL(url).origin === 'https://github.com'
    && new URL(url).pathname.startsWith(`/${release.repository}/releases/`);
}

/** Count visible publisher families; identical URL/content syndication adds no independence. */
export function independentPublisherCount(items: IntelligenceArticle[]): number {
  const families = new Set<string>();
  const urls = new Set<string>();
  const snippets = new Set<string>();
  for (const item of items) {
    const family = publisherFamilyForItem(item);
    const url = canonicalPersonalNewsUrl(item.link);
    const snippet = (item.snippet ?? '').normalize('NFKC').toLowerCase().trim();
    if (!family || !url || urls.has(url) || (snippet.length >= 80 && snippets.has(snippet))) continue;
    urls.add(url);
    if (snippet.length >= 80) snippets.add(snippet);
    families.add(family);
  }
  return families.size;
}

/** Conservative event matching: exact normalized headline and a bounded time window.
 * Similar wording is never sufficient evidence of a shared claim. Original
 * articles and updates are retained in the timeline, including incomplete data.
 */
export function buildIntelligenceEvents(inputs: IntelligenceArticle[], preferences: PersonalNewsPreferences,
  now = Date.now()): IntelligenceEvent[] {
  const items = deduplicatePersonalNews(inputs) as IntelligenceArticle[];
  const groups = new Map<string, IntelligenceArticle[]>();
  for (const item of items) {
    const title = normalizedPersonalNewsTitle(item.title);
    const stamp = effectivePubDateMs(item);
    const identity = personalNewsArticleKey(item);
    const groupKey = title && stamp > 0 && stamp <= now + 5 * 60_000
      ? JSON.stringify([title, Math.floor(stamp / (6 * 60 * 60_000))])
      : `incomplete:${identity ?? groups.size}`;
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }
  return [...groups].map(([groupKey, articles]): IntelligenceEvent => {
    articles.sort((a, b) => effectivePubDateMs(a) - effectivePubDateMs(b) || a.link.localeCompare(b.link));
    const primary = [...articles].sort((a, b) => (declaredSourceTier(a.source) ?? 5) - (declaredSourceTier(b.source) ?? 5)
      || effectivePubDateMs(b) - effectivePubDateMs(a))[0]!;
    const labels = articles.map(classifyPersonalNewsWithConfidence);
    const classification: PersonalNewsClassification = {
      categories: [...new Set(labels.flatMap(label => label.categories))],
      confidence: Math.max(...labels.map(label => label.confidence)),
      method: labels.some(label => label.method === 'upstream-model') ? 'upstream-model' : labels.some(label => label.categories.length) ? 'rules' : 'unclassified',
    };
    const publisherCount = independentPublisherCount(articles);
    const official = articles.some(officialRepositoryRelease);
    const reliable = articles.some(article => (declaredSourceTier(article.source) ?? 5) <= 2);
    const verification: VerificationState = official ? 'primary' : publisherCount >= 2 && reliable ? 'corroborated' : 'unconfirmed';
    const lastUpdated = Math.max(...articles.map(effectivePubDateMs));
    const firstSeen = Math.min(...articles.map(effectivePubDateMs));
    const recent = lastUpdated > 0 && lastUpdated <= now + 5 * 60_000 && now - lastUpdated < 24 * 60 * 60_000;
    const impact = articles.some(article => article.threat?.level === 'critical') ? 45
      : articles.some(article => article.threat?.level === 'high') ? 35 : articles.some(article => article.isAlert) ? 25 : 0;
    const majorRelease = articles.some(article => officialRepositoryRelease(article) && /^v?[1-9]\d*\.0\.0(?:$|\+)/.test(article.officialRelease!.version));
    const interest = classification.categories.some(category => preferences.categories[category]);
    const countryMentions = [...new Set(articles.flatMap(article => intelligenceCountryMentions(`${article.title} ${article.snippet ?? ''}`)))];
    const reasons: IntelligenceEvent['reasons'] = [];
    let score = 0;
    if (impact) { score += impact; reasons.push('impact'); }
    if (majorRelease) { score += 35; reasons.push('majorRelease'); }
    if (verification !== 'unconfirmed') { score += 20; reasons.push(official ? 'primary' : 'corroboration'); }
    if (recent) { score += 15; reasons.push('recent'); }
    if (interest) { score += 10; reasons.push('interest'); }
    if (reliable || official) { score += 10; reasons.push('reliable'); }
    if (countryMentions.length >= 2) { score += 5; reasons.push('geography'); }
    const severity: IntelligenceSeverity = impact === 45 ? 'critical' : impact === 35 || score >= 75 ? 'high' : score >= 35 ? 'medium' : 'low';
    return { id: `event-${intelligenceHash(groupKey)}`, articles, primary, classification, publisherCount, verification,
      severity, score: Math.min(score, 100), reasons, countryMentions, firstSeen, lastUpdated,
      summary: primary.snippet?.trim() || primary.title, summaryKind: 'source-extract' };
  }).sort((a, b) => b.score - a.score || b.lastUpdated - a.lastUpdated || a.id.localeCompare(b.id));
}
