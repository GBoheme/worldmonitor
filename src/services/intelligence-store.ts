import { safeStorageGetChecked, safeStorageSetChecked } from '@/utils/safe-storage';
import { canonicalPersonalNewsUrl } from './personal-news';
import type { IntelligenceArticle } from './intelligence-engine';
import type { IntelligenceAlertRecord } from './intelligence-alerts';
import type { IntelligenceDraft } from './intelligence-publisher';
import { validateIntelligenceConnector, type IntelligenceConnectorConfig } from './intelligence-connectors';

export const INTELLIGENCE_STORE_KEYS = {
  saved: 'ghboheme-saved-news-v1', cache: 'ghboheme-news-cache-v1',
  alerts: 'ghboheme-alert-history-v1', drafts: 'ghboheme-publisher-drafts-v1', connectors: 'ghboheme-connectors-v1',
} as const;
type Key = (typeof INTELLIGENCE_STORE_KEYS)[keyof typeof INTELLIGENCE_STORE_KEYS];
const fallback = new Map<Key, { base: string | null; value: string }>();
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function read(key: Key): unknown[] {
  const result = safeStorageGetChecked(key);
  const session = fallback.get(key);
  const raw = session && (!result.ok || result.value === session.base) ? session.value : result.value;
  if (session && result.ok && result.value !== session.base) fallback.delete(key);
  try { const value: unknown = JSON.parse(raw ?? '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
function write(key: Key, value: unknown[]): boolean {
  const raw = JSON.stringify(value);
  const before = safeStorageGetChecked(key);
  const success = safeStorageSetChecked(key, raw);
  const after = safeStorageGetChecked(key);
  const persisted = success && after.ok && after.value === raw;
  if (persisted) fallback.delete(key); else fallback.set(key, { base: before.value, value: raw });
  return persisted;
}
function parseArticle(value: unknown): IntelligenceArticle | null {
  const record = object(value);
  if (!record || typeof record.title !== 'string' || typeof record.source !== 'string' || typeof record.link !== 'string'
    || !canonicalPersonalNewsUrl(record.link)) return null;
  const pubDate = new Date(typeof record.pubDate === 'string' ? record.pubDate : 0);
  const level = ['critical', 'high', 'medium', 'low', 'info'].includes(String(object(record.threat)?.level))
    ? object(record.threat) : null;
  const release = object(record.officialRelease);
  const category = ['conflict', 'protest', 'disaster', 'diplomatic', 'economic', 'terrorism', 'cyber', 'health', 'environmental', 'military', 'crime', 'infrastructure', 'tech', 'general'].includes(String(level?.category))
    ? level?.category as NonNullable<IntelligenceArticle['threat']>['category'] : 'general';
  return { title: record.title.slice(0, 500), source: record.source.slice(0, 200), link: record.link.slice(0, 2000),
    pubDate: Number.isFinite(pubDate.getTime()) ? pubDate : new Date(0), pubDateMissing: record.pubDateMissing === true || typeof record.pubDate !== 'string' || !Number.isFinite(pubDate.getTime()) || pubDate.getTime() <= 0,
    isAlert: record.isAlert === true, snippet: typeof record.snippet === 'string' ? record.snippet.slice(0, 400) : undefined,
    lang: typeof record.lang === 'string' ? record.lang.slice(0, 10) : undefined,
    threat: level ? { level: level.level as NonNullable<IntelligenceArticle['threat']>['level'], category,
      confidence: typeof level.confidence === 'number' && Number.isFinite(level.confidence) ? Math.max(0, Math.min(1, level.confidence)) : 0,
      source: level.source === 'ml' || level.source === 'llm' ? level.source : 'keyword' } : undefined,
    releaseComparisonUrl: typeof record.releaseComparisonUrl === 'string' && release && typeof release.repository === 'string'
      && canonicalPersonalNewsUrl(record.releaseComparisonUrl)?.startsWith(`https://github.com/${release.repository}/compare/`) ? record.releaseComparisonUrl : undefined,
    officialRelease: release && typeof release.repository === 'string' && typeof release.version === 'string'
      && [`GitHub:${release.repository}`, `GitHub Comparison:${release.repository}`].includes(record.source) ? { repository: release.repository, version: release.version } : undefined };
}
function serializeArticles(items: IntelligenceArticle[]): unknown[] {
  return items.map(item => ({ ...item, pubDate: Number.isFinite(item.pubDate.getTime()) ? item.pubDate.toISOString() : null }));
}
export function getIntelligenceArticles(kind: 'saved' | 'cache'): IntelligenceArticle[] {
  return read(INTELLIGENCE_STORE_KEYS[kind]).flatMap(value => { const article = parseArticle(value); return article ? [article] : []; }).slice(0, kind === 'saved' ? 100 : 600);
}
export function saveIntelligenceArticles(kind: 'saved' | 'cache', items: IntelligenceArticle[]): boolean {
  return write(INTELLIGENCE_STORE_KEYS[kind], serializeArticles(items.slice(0, kind === 'saved' ? 100 : 600)));
}
export function getIntelligenceConnectorConfigs(): IntelligenceConnectorConfig[] {
  return read(INTELLIGENCE_STORE_KEYS.connectors).flatMap(value => { const config = validateIntelligenceConnector(value); return config ? [config] : []; }).slice(0, 30);
}
export function hasIntelligenceConnectorConfigs(): boolean {
  return fallback.has(INTELLIGENCE_STORE_KEYS.connectors) || safeStorageGetChecked(INTELLIGENCE_STORE_KEYS.connectors).value !== null;
}
export function saveIntelligenceConnectorConfigs(configs: IntelligenceConnectorConfig[]): boolean {
  return write(INTELLIGENCE_STORE_KEYS.connectors, configs.map(({ feed: _feed, ...config }) => config).slice(0, 30));
}
export function getIntelligenceAlerts(): IntelligenceAlertRecord[] {
  return read(INTELLIGENCE_STORE_KEYS.alerts).flatMap(value => {
    const record = object(value);
    if (!record || typeof record.eventId !== 'string' || typeof record.title !== 'string' || typeof record.source !== 'string'
      || typeof record.link !== 'string' || !canonicalPersonalNewsUrl(record.link) || !['critical', 'high'].includes(String(record.severity))
      || typeof record.notifiedAt !== 'number' || !Number.isFinite(record.notifiedAt) || !Array.isArray(record.articles)) return [];
    const articles = record.articles.flatMap(value => { const state = object(value);
      return state && typeof state.publisher === 'string' && typeof state.fingerprint === 'string'
        ? [{ publisher: state.publisher.slice(0, 150), fingerprint: state.fingerprint.slice(0, 50) }] : []; }).slice(0, 100);
    return [{ eventId: record.eventId, title: record.title.slice(0, 500), source: record.source.slice(0, 200),
      link: record.link, severity: record.severity as IntelligenceAlertRecord['severity'], notifiedAt: record.notifiedAt, articles }];
  }).slice(0, 100);
}
export function saveIntelligenceAlerts(records: IntelligenceAlertRecord[]): boolean { return write(INTELLIGENCE_STORE_KEYS.alerts, records.slice(0, 100)); }
export function getIntelligenceDrafts(): IntelligenceDraft[] {
  return read(INTELLIGENCE_STORE_KEYS.drafts).flatMap(value => {
    const draft = object(value);
    if (!draft || typeof draft.id !== 'string' || typeof draft.eventId !== 'string' || typeof draft.title !== 'string'
      || typeof draft.text !== 'string' || !['x', 'facebook'].includes(String(draft.platform)) || !['ar', 'en'].includes(String(draft.language))
      || !['primary', 'corroborated', 'unconfirmed'].includes(String(draft.verification)) || !Array.isArray(draft.sources)
      || typeof draft.createdAt !== 'number' || typeof draft.eventUpdatedAt !== 'number') return [];
    const sources = draft.sources.flatMap(value => { const source = object(value);
      return source && typeof source.name === 'string' && typeof source.url === 'string' && canonicalPersonalNewsUrl(source.url) && typeof source.publishedAt === 'number'
        ? [{ name: source.name.slice(0, 200), url: source.url, publishedAt: source.publishedAt }] : []; }).slice(0, 30);
    return [{ id: draft.id, eventId: draft.eventId, platform: draft.platform as IntelligenceDraft['platform'], language: draft.language as IntelligenceDraft['language'],
      title: draft.title.slice(0, 500), text: draft.text.slice(0, 5000), verification: draft.verification as IntelligenceDraft['verification'],
      sources, createdAt: draft.createdAt, eventUpdatedAt: draft.eventUpdatedAt, status: 'draft' as const }];
  }).slice(0, 40);
}
export function saveIntelligenceDrafts(drafts: IntelligenceDraft[]): boolean { return write(INTELLIGENCE_STORE_KEYS.drafts, drafts.slice(0, 40)); }
