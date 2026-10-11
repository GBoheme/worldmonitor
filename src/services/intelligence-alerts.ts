import { effectivePubDateMs } from './feed-date';
import { publisherFamilyForItem } from '../../shared/publisher-families.js';
import { intelligenceHash, independentPublisherCount, officialRepositoryRelease, type IntelligenceEvent, type IntelligenceSeverity } from './intelligence-engine';
import { declaredSourceTier } from '../../server/_shared/source-tiers';
import type { PersonalNewsPreferences } from './personal-news';

export interface IntelligenceAlertRecord {
  eventId: string;
  title: string;
  link: string;
  source: string;
  severity: IntelligenceSeverity;
  notifiedAt: number;
  articles: Array<{ publisher: string; fingerprint: string }>;
}
const severityRank: Record<IntelligenceSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function articleStates(event: IntelligenceEvent): IntelligenceAlertRecord['articles'] {
  return event.articles.map(article => ({ publisher: publisherFamilyForItem(article),
    fingerprint: intelligenceHash(`${article.title.normalize('NFKC')}|${(article.snippet ?? '').normalize('NFKC').trim()}`) }));
}

export function inQuietHours(preferences: PersonalNewsPreferences, now: number): boolean {
  const { enabled, start, end } = preferences.quietHours;
  if (!enabled) return false;
  // Device-local hours, matching the local-device delivery channel.
  const hour = new Date(now).getHours();
  if (start === end) return true;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Pure selection; calling this never requests permission or sends anything. */
export function selectIntelligenceAlerts(events: IntelligenceEvent[], preferences: PersonalNewsPreferences,
  history: IntelligenceAlertRecord[], now = Date.now()): IntelligenceAlertRecord[] {
  if (preferences.notificationPolicy === 'off' || inQuietHours(preferences, now)) return [];
  const recentHistory = history.filter(record => record.notifiedAt > now - 10 * 60_000 && record.notifiedAt <= now);
  const selected: IntelligenceAlertRecord[] = [];
  for (const event of events) {
    if (selected.length + recentHistory.length >= 3) break;
    if (!['critical', 'high'].includes(event.severity) || event.verification === 'unconfirmed') continue;
    if (event.lastUpdated <= 0 || event.lastUpdated > now + 5 * 60_000 || now - event.lastUpdated > 60 * 60_000) continue;
    const categories = event.classification.categories;
    if (categories.length && !categories.some(category => preferences.categories[category] && !preferences.disabledAlertCategories.includes(category))) continue;
    const enabledArticles = event.articles.filter(article => !preferences.disabledAlertSources.includes(article.source));
    if (!enabledArticles.length) continue;
    // Verification must survive notification-specific source exclusions too.
    if (event.verification === 'corroborated') {
      if (independentPublisherCount(enabledArticles) < 2 || !enabledArticles.some(article => (declaredSourceTier(article.source) ?? 5) <= 2)) continue;
    } else if (!enabledArticles.some(officialRepositoryRelease)) continue;
    const previous = history.filter(record => record.eventId === event.id).sort((a, b) => b.notifiedAt - a.notifiedAt)[0];
    const states = articleStates(event);
    if (previous) {
      const escalation = severityRank[event.severity] > severityRank[previous.severity];
      // A new publisher or a changed publication timestamp is not a material
      // update. Require new substantial content from an already seen publisher.
      const materialUpdate = event.articles.some((article, index) => {
        const state = states[index]!;
        return effectivePubDateMs(article) > previous.notifiedAt && (article.snippet?.trim().length ?? 0) >= 40
          && previous.articles.some(old => old.publisher === state.publisher)
          && !previous.articles.some(old => old.fingerprint === state.fingerprint);
      });
      if (!escalation && !materialUpdate) continue;
      if (now - previous.notifiedAt < 30 * 60_000) continue;
    }
    selected.push({ eventId: event.id, title: event.primary.title, link: event.primary.link,
      source: event.primary.source, severity: event.severity, notifiedAt: now, articles: states });
  }
  return selected;
}

/** Foreground/local channel. Background push requires a separate authorized server. */
export async function deliverIntelligenceDeviceAlert(record: IntelligenceAlertRecord): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const options: NotificationOptions = { body: record.source, tag: record.eventId,
    data: { url: record.link }, icon: '/favico/android-chrome-192x192.png' };
  const registration = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration?.showNotification) await registration.showNotification(record.title, options);
  else new Notification(record.title, options);
  return true;
}
