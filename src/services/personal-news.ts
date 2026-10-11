/**
 * GBoheme Intelligence: device-local news preferences.
 * Account sync and server-side notification filters are separate future work.
 */
import type { NewsItem } from '@/types';
import { safeStorageGetChecked, safeStorageSetChecked } from '@/utils/safe-storage';
import { effectivePubDateMs } from './feed-date';

export const PERSONAL_NEWS_STORAGE_KEY = 'ghboheme-personal-news-v1';
export const PERSONAL_NEWS_CHANGED_EVENT = 'ghboheme-personal-news-changed';

export const PERSONAL_NEWS_CATEGORIES = [
  { id: 'ai_agents', ar: 'الذكاء الاصطناعي والوكلاء', en: 'AI & Agents' },
  { id: 'open_source_github', ar: 'المشاريع مفتوحة المصدر وGitHub', en: 'Open Source & GitHub' },
  { id: 'software_platforms', ar: 'Windows وAndroid والبرامج', en: 'Windows, Android & Software' },
  { id: 'world_politics', ar: 'الأخبار العالمية والسياسة', en: 'World News & Politics' },
  { id: 'cybersecurity', ar: 'الأمن السيبراني', en: 'Cybersecurity' },
  { id: 'economy_markets', ar: 'الاقتصاد والأسواق', en: 'Economy & Markets' },
  { id: 'energy_oil', ar: 'الطاقة والنفط', en: 'Energy & Oil' },
  { id: 'science_discovery', ar: 'العلوم والاكتشافات', en: 'Science & Discoveries' },
  { id: 'iraq_local', ar: 'الأخبار المحلية العراقية', en: 'Iraq Local News' },
  { id: 'sports_entertainment', ar: 'الرياضة والترفيه', en: 'Sports & Entertainment' },
] as const;

export type PersonalNewsCategoryId = (typeof PERSONAL_NEWS_CATEGORIES)[number]['id'];

export interface PersonalNewsPreferences {
  categories: Record<PersonalNewsCategoryId, boolean>;
  languages: ['ar', 'en'];
  notificationPolicy: 'important_only';
}

export function defaultPersonalNewsPreferences(): PersonalNewsPreferences {
  return {
    categories: Object.fromEntries(PERSONAL_NEWS_CATEGORIES.map(({ id }) => [id, true])) as Record<PersonalNewsCategoryId, boolean>,
    languages: ['ar', 'en'],
    notificationPolicy: 'important_only',
  };
}

/** Whitelist persisted fields: malformed or user-edited JSON must not crash startup. */
export function parsePersonalNewsPreferences(raw: string | null): PersonalNewsPreferences {
  const defaults = defaultPersonalNewsPreferences();
  if (!raw) return defaults;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
    const candidate = parsed as Record<string, unknown>;
    const values = candidate.categories && typeof candidate.categories === 'object'
      && !Array.isArray(candidate.categories)
      ? candidate.categories as Record<string, unknown> : {};
    for (const { id } of PERSONAL_NEWS_CATEGORIES) {
      if (typeof values[id] === 'boolean') defaults.categories[id] = values[id];
    }
  } catch {
    // Fall back to all enabled.
  }
  return defaults;
}

export function getPersonalNewsPreferences(): PersonalNewsPreferences {
  const read = safeStorageGetChecked(PERSONAL_NEWS_STORAGE_KEY);
  if (sessionPreferences && (!read.ok || read.value === sessionPreferences.base)) {
    return parsePersonalNewsPreferences(sessionPreferences.value);
  }
  sessionPreferences = null;
  return parsePersonalNewsPreferences(read.value);
}

// Keep edits usable for this session when storage is blocked or full. A later
// external write supersedes the fallback, so account sync cannot be shadowed.
let sessionPreferences: { base: string | null; value: string } | null = null;

export function savePersonalNewsPreferences(preferences: PersonalNewsPreferences): boolean {
  const value = JSON.stringify(parsePersonalNewsPreferences(JSON.stringify(preferences)));
  const before = safeStorageGetChecked(PERSONAL_NEWS_STORAGE_KEY);
  const written = safeStorageSetChecked(PERSONAL_NEWS_STORAGE_KEY, value);
  const after = safeStorageGetChecked(PERSONAL_NEWS_STORAGE_KEY);
  const persisted = written && after.ok && after.value === value;
  sessionPreferences = persisted ? null : { base: before.value, value };
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PERSONAL_NEWS_CHANGED_EVENT));
  }
  return persisted;
}

export function setPersonalNewsCategory(id: PersonalNewsCategoryId, enabled: boolean): boolean {
  if (!PERSONAL_NEWS_CATEGORIES.some(category => category.id === id)) return false;
  const next = getPersonalNewsPreferences();
  if (next.categories[id] === enabled) return true;
  next.categories[id] = enabled;
  return savePersonalNewsPreferences(next);
}

// Conservative keyword labels, not a substitute for a verified ML classifier.
// Unknown headlines stay visible rather than disappearing without explanation.
const KEYWORDS: Record<PersonalNewsCategoryId, RegExp> = {
  ai_agents: /\b(?:ai|llm|gpt|claude|gemini|deepseek|llama|openai|anthropic|agentic|artificial intelligence|machine learning|neural network|chatbot|ai agents?)\b|ذكاء اصطناعي|الذكاء الاصطناعي|وكلاء الذكاء|نموذج لغوي|نماذج لغوية|تعلم الآلة/iu,
  open_source_github: /\b(?:github|gitlab|open[\s-]source|repository|repositories|foss|opensource)\b|مفتوح المصدر|المصدر المفتوح|مستودع برمجي|مستودعات برمجية/iu,
  software_platforms: /\b(?:windows|android|microsoft|software|app store|google play|operating system|linux|ios|macos|desktop app)\b|ويندوز|أندرويد|اندرويد|برمجيات|نظام تشغيل|تطبيقات الهاتف/iu,
  world_politics: /\b(?:election|president|parliament|diplomacy|geopolitic|geopolitics|war|ceasefire|sanctions|prime minister|foreign minister)\b|انتخابات|الرئيس|البرلمان|الدبلوماسية|سياسة خارجية|الحرب|وقف إطلاق النار|عقوبات دولية|رئيس الوزراء/iu,
  cybersecurity: /\b(?:cybersecurity|ransomware|malware|phishing|data breach|zero[\s-]day|cve-\d+|exploit|cyberattack|infosec)\b|الأمن السيبراني|هجوم سيبراني|هجمات سيبرانية|اختراق|برمجيات خبيثة|ثغرة أمنية|فدية إلكترونية/iu,
  economy_markets: /\b(?:inflation|gdp|stock market|stocks|nasdaq|dow jones|interest rates?|central bank|recession|bond yields?|bitcoin|crypto)\b|الاقتصاد|التضخم|أسواق المال|البورصة|سعر الفائدة|البنك المركزي|أسعار الأسهم|العملات الرقمية/iu,
  energy_oil: /\b(?:oil prices?|brent|crude oil|opec|petroleum|refiner(?:y|ies)|natural gas|energy sector|renewable energy|solar power)\b|النفط|الطاقة|أوبك|الغاز الطبيعي|المصافي|مصفى|أسعار الوقود|الطاقة الشمسية/iu,
  science_discovery: /\b(?:nasa|researchers?|scientists?|scientific|spacecraft|telescope|discovery|quantum physics|astronomy|genome)\b|اكتشاف علمي|بحث علمي|باحثون|علماء|الفضاء|التلسكوب|الفيزياء|الجينوم/iu,
  iraq_local: /\b(?:iraq|iraqi|baghdad|basra|najaf|karbala|muthanna|samawah|erbil|mosul)\b|العراق|العراقي|بغداد|البصرة|النجف|كربلاء|المثنى|السماوة|الرمادي|أربيل|الموصل/iu,
  sports_entertainment: /\b(?:football|soccer|champions league|world cup|nba|olympics?|fifa|tennis|film festival|box office|music awards)\b|رياضة|كرة القدم|كأس العالم|دوري الأبطال|الأولمبياد|السينما|الموسيقى|الترفيه/iu,
};

export function classifyPersonalNews(item: Pick<NewsItem, 'title' | 'snippet'>): PersonalNewsCategoryId[] {
  const content = [item.title, item.snippet ?? ''].join(' ').normalize('NFKC');
  return PERSONAL_NEWS_CATEGORIES.flatMap(({ id }) => KEYWORDS[id].test(content) ? [id] : []);
}

export function filterPersonalNews(items: NewsItem[], preferences: PersonalNewsPreferences): NewsItem[] {
  if (PERSONAL_NEWS_CATEGORIES.every(({ id }) => preferences.categories[id])) return items;
  return items.filter((item) => {
    // Critical/high threat news must remain visible regardless of topic toggles.
    if (item.isAlert || item.threat?.level === 'critical' || item.threat?.level === 'high') return true;
    const categories = classifyPersonalNews(item);
    return categories.length === 0 || categories.some(id => preferences.categories[id]);
  });
}

export function normalizedPersonalNewsTitle(title: string): string {
  return title.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Remove tracking only. Semantic query parameters remain part of identity. */
export function canonicalPersonalNewsUrl(link: string): string | null {
  try {
    const url = new URL(link);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}

/** Article identity differs from event identity; incomplete records never merge. */
export function personalNewsArticleKey(item: NewsItem): string | null {
  const url = canonicalPersonalNewsUrl(item.link);
  const timestamp = effectivePubDateMs(item);
  const title = normalizedPersonalNewsTitle(item.title);
  const publisher = item.source.trim().toLowerCase();
  if (!url || !timestamp || !title || !publisher) return null;
  return JSON.stringify([publisher, url, timestamp, title, (item.snippet ?? '').normalize('NFKC').trim()]);
}

/** Dedup exact copies only, retaining publication updates and other publishers. */
export function deduplicatePersonalNews(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, number>();
  const result: NewsItem[] = [];
  for (const item of items) {
    const key = personalNewsArticleKey(item);
    const index = key === null ? undefined : seen.get(key);
    if (index !== undefined) {
      const previous = result[index]!;
      const priority = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
      result[index] = { ...previous, isAlert: previous.isAlert || item.isAlert,
        threat: (priority[item.threat?.level ?? 'info'] > priority[previous.threat?.level ?? 'info']) ? item.threat : previous.threat };
    } else {
      if (key !== null) seen.set(key, result.length);
      result.push(item);
    }
  }
  return result;
}
