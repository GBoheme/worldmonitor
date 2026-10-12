import { canonicalPersonalNewsUrl } from './personal-news';
import { effectivePubDateMs } from './feed-date';
import { intelligenceHash, type IntelligenceEvent, type VerificationState } from './intelligence-engine';

export type IntelligencePublishingPlatform = 'x' | 'facebook';
export interface IntelligenceDraft {
  id: string;
  eventId: string;
  platform: IntelligencePublishingPlatform;
  language: 'ar' | 'en';
  title: string;
  text: string;
  sources: Array<{ name: string; url: string; publishedAt: number }>;
  verification: VerificationState;
  createdAt: number;
  eventUpdatedAt: number;
  status: 'draft';
}

/** Source extracts, never fabricated facts. Unconfirmed material carries a warning. */
export function prepareIntelligenceDraft(event: IntelligenceEvent, platform: IntelligencePublishingPlatform,
  language: 'ar' | 'en', now = Date.now()): IntelligenceDraft {
  const ar = language === 'ar';
  const sources = event.articles.flatMap(article => {
    const url = canonicalPersonalNewsUrl(article.link);
    return url ? [{ name: article.source, url, publishedAt: effectivePubDateMs(article) }] : [];
  });
  if (!sources.length) throw new Error('missing_sources');
  const warning = event.verification === 'unconfirmed'
    ? ar ? 'تقرير غير مؤكد؛ يحتاج إلى تحقق مستقل.\n' : 'Unconfirmed report; independent verification required.\n'
    : ar ? 'بحسب المصادر أدناه؛ تعدد الناشرين لا يضمن صحة جميع الادعاءات.\n' : 'According to the sources below; publisher coverage is not fact checking.\n';
  const date = new Date(event.lastUpdated);
  const dated = event.lastUpdated > 0 && event.lastUpdated <= now + 5 * 60_000
    ? date.toISOString() : ar ? 'تاريخ النشر غير معروف' : 'Publication date unknown';
  const original = event.summary || event.primary.title;
  const sourceLinks = [...new Set(sources.map(source => source.url))];
  let body: string;
  if (platform === 'x') {
    const link = sourceLinks[0]!;
    const prefix = event.verification === 'unconfirmed' ? ar ? 'غير مؤكد: ' : 'Unconfirmed: ' : ar ? 'بحسب المصدر: ' : 'Source report: ';
    // Conservative 280-codepoint draft; a URL is counted at its literal length,
    // which can be stricter than X's link-shortening count, never looser.
    const available = Math.max(0, 280 - [...prefix].length - [...link].length - 2);
    if ([...prefix].length + [...link].length + 2 >= 280) throw new Error('platform_length');
    body = `${prefix}${[...event.primary.title].slice(0, available).join('')}\n${link}`;
  } else body = `${warning}${event.primary.title}\n\n${original}\n\n${ar ? 'تاريخ الحدث' : 'Event date'}: ${dated}\n${ar ? 'المصادر' : 'Sources'}:\n${sourceLinks.slice(0, 8).join('\n')}`;
  return { id: `draft-${intelligenceHash(`${event.id}|${platform}|${language}`)}`, eventId: event.id,
    platform, language, title: event.primary.title, text: body, sources, verification: event.verification,
    createdAt: now, eventUpdatedAt: event.lastUpdated, status: 'draft' };
}

export interface IntelligencePublishAuthorization {
  accountId: string;
  platform: IntelligencePublishingPlatform;
  connected: boolean;
  canPublish: boolean;
  autoPublish: boolean;
}
export interface IntelligencePublishReceipt { draftId: string; eventId: string; platform: IntelligencePublishingPlatform; accountId: string; postId: string; publishedAt: number }

/** Policy for a future authorized server publisher; UI flags are not credentials. */
export function intelligencePublishBlocker(draft: IntelligenceDraft, authorization: IntelligencePublishAuthorization,
  receipts: IntelligencePublishReceipt[], now = Date.now()): string | null {
  if (!authorization.connected || !authorization.canPublish || !authorization.autoPublish || authorization.platform !== draft.platform) return 'authorization_required';
  if (draft.verification === 'unconfirmed') return 'unconfirmed';
  if (!draft.text.trim() || (draft.platform === 'x' && [...draft.text].length > 280)) return 'platform_length';
  if (!draft.sources.length || draft.sources.some(source => !canonicalPersonalNewsUrl(source.url))) return 'missing_sources';
  if (draft.eventUpdatedAt <= 0 || draft.eventUpdatedAt > now + 5 * 60_000 || now - draft.eventUpdatedAt > 24 * 60 * 60_000) return 'stale_context';
  if (receipts.some(receipt => receipt.eventId === draft.eventId && receipt.platform === draft.platform && receipt.accountId === authorization.accountId)) return 'duplicate';
  return null;
}
