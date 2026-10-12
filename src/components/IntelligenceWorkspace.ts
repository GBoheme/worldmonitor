import { t, getCurrentLanguage, getLocale, changeLanguage } from '@/services/i18n';
import { setThemePreference } from '@/utils/theme-manager';
import { isGbohemeMobileRuntime } from '@/services/desktop-runtime';
import { usesNativeIntelligenceLinks, openIntelligenceSource } from '@/services/intelligence-navigation';
import { loadIntelligenceFonts } from '@/services/intelligence-fonts';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import { PERSONAL_NEWS_CATEGORIES, PERSONAL_NEWS_CHANGED_EVENT, getPersonalNewsPreferences, savePersonalNewsPreferences,
  setPersonalNewsCategory, personalNewsArticleKey, filterPersonalNews } from '@/services/personal-news';
import { buildIntelligenceEvents, intelligenceHash, type IntelligenceArticle, type IntelligenceEvent } from '@/services/intelligence-engine';
import { IntelligenceConnector, intelligenceConnectorSource, validateIntelligenceConnector, type IntelligenceConnectorConfig } from '@/services/intelligence-connectors';
import { selectIntelligenceAlerts, deliverIntelligenceDeviceAlert } from '@/services/intelligence-alerts';
import { prepareIntelligenceDraft } from '@/services/intelligence-publisher';
import { getIntelligenceArticles, saveIntelligenceArticles, getIntelligenceAlerts, saveIntelligenceAlerts,
  getIntelligenceDrafts, saveIntelligenceDrafts, hasIntelligenceConnectorConfigs, getIntelligenceConnectorConfigs, saveIntelligenceConnectorConfigs } from '@/services/intelligence-store';
import { DEVICE_PERFORMANCE_MODES, getDevicePerformanceMode, getEffectivePerformanceMode, setDevicePerformanceMode, DEVICE_PERFORMANCE_CHANGED_EVENT } from '@/config/device-performance';
import '../styles/intelligence.css';

const sections = ['home', 'world', 'tech', 'github', 'iraq', 'markets', 'breaking', 'saved', 'digest', 'sources', 'alerts', 'publisher', 'settings'] as const;
type Section = (typeof sections)[number];
const sectionTopics: Partial<Record<Section, string[]>> = { world: ['world_politics'], tech: ['ai_agents', 'software_platforms', 'cybersecurity'],
  github: ['open_source_github'], iraq: ['iraq_local'], markets: ['economy_markets', 'energy_oil'] };
const e = escapeHtml;
function tr(key: string, options?: Record<string, unknown>): string { return e(t('intelligence.' + key, options)); }
function articleIdentity(article: IntelligenceArticle): string { return personalNewsArticleKey(article) ?? article.link; }
function editorKey(event: IntelligenceEvent): string {
  return `${event.id}|${getCurrentLanguage()}|${intelligenceHash(JSON.stringify(event.articles.map(article => [articleIdentity(article), article.snippet ?? ''])))}`;
}

export class IntelligenceWorkspace {
  private section: Section = 'home';
  private query = '';
  private sourceFilter = '';
  private severityFilter = '';
  private countryFilter = '';
  private timeFilter = '';
  private articles = getIntelligenceArticles('cache');
  private events: IntelligenceEvent[] = [];
  private saved = getIntelligenceArticles('saved');
  private alerts = getIntelligenceAlerts();
  private drafts = getIntelligenceDrafts();
  private configs: IntelligenceConnectorConfig[];
  private connectors: IntelligenceConnector[] = [];
  private readonly lifetime = new AbortController();
  private refreshController: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private destroyed = false;
  private busy = false;
  private notice = '';
  private translations = new Map<string, string>();
  private summaries = new Map<string, { text: string; provider: string }>();

  constructor(private readonly root: HTMLElement, defaults: IntelligenceConnectorConfig[]) {
    const stored = getIntelligenceConnectorConfigs();
    const byId = new Map(defaults.map(config => [config.id, config]));
    this.configs = hasIntelligenceConnectorConfigs() ? stored.map(config => ({ ...config, feed: byId.get(config.id)?.feed })) : defaults;
    const enabledNames = new Set(this.configs.filter(config => config.enabled).map(config => intelligenceConnectorSource(config)));
    this.articles = this.articles.filter(article => enabledNames.has(article.source));
    this.resetConnectors();
    const section = new URL(location.href).searchParams.get('section');
    if (sections.includes(section as Section)) this.section = section as Section;
  }

  mount(): void {
    document.title = 'GBoheme Intelligence';
    this.root.classList.add('gi-root');
    const signal = this.lifetime.signal;
    this.root.addEventListener('click', event => { void this.onClick(event).catch(() => {
      (event.target as Element).closest('button')?.removeAttribute('disabled'); this.showNotice('operationFailed');
    }); }, { signal });
    this.root.addEventListener('change', event => { void this.onChange(event).catch(() => this.showNotice('operationFailed')); }, { signal });
    this.root.addEventListener('input', event => {
      const input = event.target as HTMLInputElement;
      if (input.id === 'gi-search') { this.query = input.value; this.updateCards(); }
    }, { signal });
    window.addEventListener(DEVICE_PERFORMANCE_CHANGED_EVENT, () => this.render(), { signal });
    window.addEventListener(PERSONAL_NEWS_CHANGED_EVENT, () => { this.rebuild(); this.render(); }, { signal });
    window.addEventListener('storage', () => {
      this.saved = getIntelligenceArticles('saved'); this.alerts = getIntelligenceAlerts(); this.rebuild(); this.render();
    }, { signal });
    window.addEventListener('wm:cloud-prefs-applied', () => {
      this.saved = getIntelligenceArticles('saved'); this.rebuild(); this.render();
    }, { signal });
    window.addEventListener('online', () => { void this.refresh(); }, { signal });
    window.addEventListener('offline', () => this.showNotice('offline'), { signal });
    window.addEventListener('popstate', () => {
      const section = new URL(location.href).searchParams.get('section');
      this.section = sections.includes(section as Section) ? section as Section : 'home';
      this.render();
    }, { signal });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.refresh(); }, { signal });
    this.rebuild(); this.render();
    void this.refresh();
    this.timer = setInterval(() => { if (!document.hidden && navigator.onLine) void this.refresh(); }, 60_000);
    document.documentElement.dataset.gbohemeReady = 'true';
  }

  destroy(): void {
    this.destroyed = true; this.generation++; this.refreshController?.abort(); this.lifetime.abort();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    delete document.documentElement.dataset.gbohemeReady;
  }
  private resetConnectors(): void { this.connectors = this.configs.map(config => new IntelligenceConnector(config)); }
  private rebuild(): void { this.events = buildIntelligenceEvents(this.articles, getPersonalNewsPreferences()); }

  private async refresh(): Promise<void> {
    if (this.destroyed || this.busy) return;
    if (!navigator.onLine) { this.showNotice('offline'); return; }
    const due = this.connectors.filter(connector => connector.isDue());
    if (!due.length) return;
    this.busy = true;
    const generation = ++this.generation;
    const controller = new AbortController(); this.refreshController = controller;
    this.updateStatus();
    const collected = new Map<string, IntelligenceArticle[]>();
    try {
      for (let index = 0; index < due.length; index += 2) {
        const group = due.slice(index, index + 2);
        const batch = await Promise.allSettled(group.map(connector => connector.sync(controller.signal)));
        if (generation !== this.generation || this.destroyed) return;
        batch.forEach((result, offset) => {
          const connector = group[offset]!;
          if (result.status === 'fulfilled' && result.value.status.state === 'ready') collected.set(connector.config.id, result.value.items);
        });
        const newItems = [...collected.values()].flat();
        // Keep last-good articles from uncompleted/failed sources, and replace
        // only sources whose refresh supplied data. Disabled sources never leak.
        const successfulSources = new Set(this.connectors.filter(connector => collected.has(connector.config.id) && connector.getStatus().state === 'ready')
          .map(connector => intelligenceConnectorSource(connector.config)));
        this.articles = [...newItems, ...this.articles.filter(article => !successfulSources.has(article.source))].slice(0, 600);
        this.rebuild();
        if (['sources', 'digest'].includes(this.section)) this.render(); else this.updateCards();
      }
      const enabledNames = new Set(this.configs.filter(config => config.enabled).map(config => intelligenceConnectorSource(config)));
      // Thirty GitHub connectors can return 600 items. Keep that entire bounded
      // cycle so a high-impact item from a later source is not discarded.
      this.articles = this.articles.filter(article => enabledNames.has(article.source)).slice(0, 600);
      if (!saveIntelligenceArticles('cache', this.articles)) this.notice = t('personalNews.sessionOnly');
      this.rebuild();
      const selected = selectIntelligenceAlerts(this.events, getPersonalNewsPreferences(), this.alerts);
      if (selected.length) {
        this.alerts = [...selected, ...this.alerts].slice(0, 100);
        if (!saveIntelligenceAlerts(this.alerts)) this.notice = t('personalNews.sessionOnly');
        if (getPersonalNewsPreferences().localNotifications) {
          for (const alert of selected) {
            try { if (!await deliverIntelligenceDeviceAlert(alert)) this.notice = t('intelligence.notificationUnavailable'); }
            catch { this.notice = t('intelligence.notificationUnavailable'); }
          }
        }
      }
      if (this.connectors.some(connector => ['error', 'quota'].includes(connector.getStatus().state))) this.notice = t('intelligence.partialFailure');
      this.render();
    } catch {
      if (!controller.signal.aborted && !this.destroyed) this.showNotice('operationFailed');
    } finally {
      if (generation === this.generation) { this.busy = false; this.refreshController = null; this.updateStatus(); }
    }
  }

  private navigate(section: Section): void {
    this.section = section;
    const url = new URL(location.href); url.searchParams.set('section', section);
    history.pushState(null, '', url); this.render();
  }
  private showNotice(key: string): void { this.notice = t('intelligence.' + key); this.updateStatus(); }
  private savedResult(persisted: boolean): void {
    this.notice = t(persisted ? 'personalNews.saved' : 'personalNews.sessionOnly'); this.updateStatus();
  }
  private updateStatus(): void {
    const status = this.root.querySelector('#gi-status');
    if (status) status.textContent = this.notice || t(this.busy ? 'intelligence.refreshing' : navigator.onLine ? 'intelligence.localMode' : 'intelligence.offline');
    const refresh = this.root.querySelector<HTMLButtonElement>('[data-action="refresh"]');
    if (refresh) refresh.disabled = this.busy;
  }

  private render(): void {
    if (this.destroyed) return;
    const nav = sections.map(section => `<button type="button" data-section="${section}" ${this.section === section ? 'aria-current="page"' : ''}>${tr('sections.' + section)}</button>`).join('');
    setTrustedHtml(this.root, trustedHtml(`<div class="gi-workspace">
      <header class="gi-header"><a class="gi-brand" href="/dashboard?intelligence=1"><span class="gi-monogram" aria-hidden="true">GB</span><span>GBoheme <strong>Intelligence</strong></span></a>
        <div class="gi-tools"><button type="button" data-action="language">${getCurrentLanguage() === 'ar' ? 'English' : 'العربية'}</button><button type="button" data-action="theme">${tr('theme')}</button><a href="/dashboard${isGbohemeMobileRuntime() ? '?intelligence=0' : ''}">${tr('monitor')}</a></div></header>
      <div class="gi-layout"><aside class="gi-sidebar"><p>${tr('navigation')}</p><nav aria-label="${tr('navigation')}">${nav}</nav><p class="gi-footnote">${tr('privacy')}</p></aside>
      <main class="gi-main"><div class="gi-heading"><div><p class="gi-eyebrow">${tr('eyebrow')}</p><h1>${tr('sections.' + this.section)}</h1></div><button type="button" data-action="refresh">${tr('refresh')}</button></div>
      <p id="gi-status" role="status" aria-live="polite" class="gi-status"></p>
      <label class="gi-mobile-section">${tr('navigation')}<select id="gi-section">${sections.map(section => `<option value="${section}"${this.section === section ? ' selected' : ''}>${tr('sections.' + section)}</option>`).join('')}</select></label>
      ${this.isNewsSection() ? this.filtersHtml() + '<div id="gi-cards" class="gi-cards"></div>' : this.sectionHtml()}
      <footer class="gi-footer">${tr('attribution')} <a href="https://github.com/koala73/worldmonitor" target="_blank" rel="noopener noreferrer">World Monitor</a> · <a href="https://github.com/GBoheme/worldmonitor/tree/ghboheme-custom" target="_blank" rel="noopener noreferrer">AGPL-3.0-only · ${tr('sourceCode')}</a></footer>
      </main></div><nav class="gi-bottom-nav" aria-label="${tr('navigation')}">${['home', 'breaking', 'saved', 'alerts', 'settings'].map(section => `<button type="button" data-section="${section}"${this.section === section ? ' aria-current="page"' : ''}>${tr('sections.' + section)}</button>`).join('')}</nav>
      </div>`, 'escaped intelligence workspace templates'));
    this.updateStatus(); this.updateCards();
  }
  private isNewsSection(): boolean { return !['sources', 'alerts', 'publisher', 'settings', 'digest'].includes(this.section); }
  private filtersHtml(): string {
    const sources = [...new Set(this.articles.map(article => article.source))].sort();
    const countries = [...new Set(this.events.flatMap(event => event.countryMentions))].sort();
    const names = new Intl.DisplayNames([getLocale()], { type: 'region' });
    return `<div class="gi-filters"><label>${tr('search')}<input id="gi-search" type="search" value="${e(this.query)}" placeholder="${tr('searchPlaceholder')}"></label>
      <label>${tr('source')}<select id="gi-source"><option value="">${tr('allSources')}</option>${sources.map(source => `<option value="${e(source)}"${source === this.sourceFilter ? ' selected' : ''}>${e(source)}</option>`).join('')}</select></label>
      <label>${tr('importance')}<select id="gi-severity"><option value="">${tr('allLevels')}</option>${['critical', 'high', 'medium', 'low'].map(level => `<option value="${level}"${level === this.severityFilter ? ' selected' : ''}>${tr('severity.' + level)}</option>`).join('')}</select></label>
      <label>${tr('countryMentions')}<select id="gi-country"><option value="">${tr('allCountries')}</option>${countries.map(code => `<option value="${code}"${code === this.countryFilter ? ' selected' : ''}>${e(names.of(code) ?? code)}</option>`).join('')}</select></label>
      <label>${tr('time')}<select id="gi-time"><option value="">${tr('allTimes')}</option>${['day', 'week', 'unknown'].map(value => `<option value="${value}"${value === this.timeFilter ? ' selected' : ''}>${tr('times.' + value)}</option>`).join('')}</select></label></div>`;
  }
  private visibleEvents(): IntelligenceEvent[] {
    const preferences = getPersonalNewsPreferences();
    let events = this.section === 'saved' ? buildIntelligenceEvents(this.saved, preferences) : this.events;
    const allowed = new Set(filterPersonalNews(this.articles, preferences).map(articleIdentity));
    if (this.section !== 'saved') events = events.filter(event => ['critical', 'high'].includes(event.severity)
      || event.articles.some(article => allowed.has(articleIdentity(article))));
    const topics = sectionTopics[this.section];
    if (topics) events = events.filter(event => event.classification.categories.some(category => topics.includes(category)));
    if (this.section === 'breaking') events = events.filter(event => ['critical', 'high'].includes(event.severity));
    const query = this.query.normalize('NFKC').toLowerCase().trim();
    return events.filter(event => (!query || event.articles.some(article => `${article.title} ${article.snippet ?? ''} ${article.source}`.normalize('NFKC').toLowerCase().includes(query)))
      && (!this.sourceFilter || event.articles.some(article => article.source === this.sourceFilter)) && (!this.severityFilter || event.severity === this.severityFilter)
      && (!this.countryFilter || event.countryMentions.includes(this.countryFilter))
      && (!this.timeFilter || (this.timeFilter === 'unknown' ? event.lastUpdated <= 0 : event.lastUpdated > Date.now() - (this.timeFilter === 'day' ? 1 : 7) * 24 * 60 * 60_000 && event.lastUpdated <= Date.now() + 5 * 60_000)));
  }
  private updateCards(): void {
    const sources = new Set((this.section === 'saved' ? this.saved : this.articles).map(article => article.source));
    if (this.sourceFilter) sources.add(this.sourceFilter);
    const sourceSelect = this.root.querySelector<HTMLSelectElement>('#gi-source');
    if (sourceSelect) {
      const options = [new Option(t('intelligence.allSources'), ''), ...[...sources].sort().map(source => new Option(source, source))];
      if (sourceSelect.options.length !== options.length || options.some((option, index) => option.value !== sourceSelect.options[index]?.value)) sourceSelect.replaceChildren(...options);
      sourceSelect.value = this.sourceFilter;
    }
    const countries = new Set(this.events.flatMap(event => event.countryMentions));
    if (this.countryFilter) countries.add(this.countryFilter);
    const names = new Intl.DisplayNames([getLocale()], { type: 'region' });
    const select = this.root.querySelector<HTMLSelectElement>('#gi-country');
    if (select) {
      const options = [new Option(t('intelligence.allCountries'), ''), ...[...countries].sort().map(code => new Option(names.of(code) ?? code, code))];
      if (select.options.length !== options.length || options.some((option, index) => option.value !== select.options[index]?.value)) select.replaceChildren(...options);
      select.value = this.countryFilter;
    }
    const cards = this.root.querySelector<HTMLElement>('#gi-cards');
    if (!cards) return;
    const events = this.visibleEvents();
    setTrustedHtml(cards, trustedHtml(events.length ? events.slice(0, 100).map(event => this.cardHtml(event)).join('')
      : `<div class="gi-empty"><h2>${tr('empty')}</h2><p>${tr(this.section === 'saved' ? 'emptySaved' : 'emptyDesc')}</p><button type="button" data-section="sources">${tr('sections.sources')}</button></div>`, 'escaped intelligence article cards'));
  }
  private cardHtml(event: IntelligenceEvent): string {
    const saved = this.saved.some(article => articleIdentity(article) === articleIdentity(event.primary));
    const date = event.lastUpdated > 0 ? new Date(event.lastUpdated).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }) : t('intelligence.unknownDate');
    const translated = this.translations.get(editorKey(event));
    const summary = this.summaries.get(editorKey(event));
    return `<article class="gi-card" data-event="${event.id}"><div class="gi-card-meta"><span class="gi-severity gi-${event.severity}">${tr('severity.' + event.severity)}</span><span class="gi-verification">${tr('verification.' + event.verification)}</span><time dir="auto">${e(date)}</time></div>
      <h2 dir="auto"><a href="${sanitizeUrl(event.primary.link)}" target="_blank" rel="noopener noreferrer">${e(event.primary.title)}</a></h2>
      ${event.primary.releaseComparisonUrl ? `<p><a href="${sanitizeUrl(event.primary.releaseComparisonUrl)}" target="_blank" rel="noopener noreferrer">${tr('compareVersions')}</a></p>` : ''}<p class="gi-extract-label">${tr(translated ? 'translation' : 'sourceExtract')}</p><p class="gi-extract" dir="auto">${e(translated || event.summary)}</p>
      ${summary ? `<p class="gi-extract-label">${tr('aiSummary')} · ${e(summary.provider)}</p><p dir="auto">${e(summary.text)}</p><p class="gi-extract-label">${tr('aiReviewRequired')}</p>` : ''}<div class="gi-topic-tags">${event.classification.categories.map(category => `<span>${e(t('personalNews.categories.' + category))}</span>`).join('')}<span>${tr('confidence', { percent: Math.round(event.classification.confidence * 100) })}</span></div>
      <details class="gi-evidence"><summary>${tr('evidence', { count: event.publisherCount })}</summary><p>${tr('verificationCaveat')}</p><p>${event.reasons.map(reason => tr('reasons.' + reason)).join(' · ')}</p>
      <ol>${event.articles.map(article => `<li><a href="${sanitizeUrl(article.link)}" target="_blank" rel="noopener noreferrer">${e(article.source)}</a> <span dir="auto">${e(article.pubDateMissing || !Number.isFinite(article.pubDate.getTime()) ? t('intelligence.unknownDate') : article.pubDate.toLocaleString(getLocale()))}</span></li>`).join('')}</ol></details>
      <div class="gi-card-actions"><button type="button" data-action="save" data-id="${event.id}" aria-pressed="${saved}">${tr(saved ? 'unsave' : 'save')}</button><button type="button" data-action="translate" data-id="${event.id}">${tr('translate')}</button><button type="button" data-action="summarize" data-id="${event.id}">${tr('summarize')}</button><button type="button" data-action="draft" data-id="${event.id}">${tr('createDraft')}</button></div></article>`;
  }

  private sectionHtml(): string {
    switch (this.section) {
      case 'settings': return this.settingsHtml();
      case 'sources': return this.sourcesHtml();
      case 'alerts': return `<p class="gi-explanation">${tr('alertsDesc')}</p>${this.alerts.length ? this.alerts.map(alert => `<article class="gi-card"><span class="gi-severity gi-${alert.severity}">${tr('severity.' + alert.severity)}</span><h2 dir="auto"><a href="${sanitizeUrl(alert.link)}" target="_blank" rel="noopener noreferrer">${e(alert.title)}</a></h2><p>${e(alert.source)} · <time>${e(new Date(alert.notifiedAt).toLocaleString(getLocale()))}</time></p></article>`).join('') : `<p class="gi-empty">${tr('emptyAlerts')}</p>`}`;
      case 'publisher': return this.publisherHtml();
      case 'digest': return `<p class="gi-explanation">${tr('digestDesc')}</p>${this.events.filter(event => event.lastUpdated > Date.now() - 24 * 60 * 60_000).slice(0, 10).map(event => this.cardHtml(event)).join('') || `<p class="gi-empty">${tr('empty')}</p>`}`;
      default: return '';
    }
  }
  private settingsHtml(): string {
    const preferences = getPersonalNewsPreferences();
    return `<section class="gi-settings"><label>${e(t('performance.title'))}<select id="gi-performance">${DEVICE_PERFORMANCE_MODES.map(mode => `<option value="${mode}"${mode === getDevicePerformanceMode() ? ' selected' : ''}>${e(t('performance.modes.' + mode))}</option>`).join('')}</select></label><p>${e(t('performance.description'))}</p><p>${e(t('performance.effective'))}: ${e(t('performance.modes.' + getEffectivePerformanceMode()))}</p><h2>${e(t('personalNews.interests'))}</h2><p>${e(t('personalNews.interestsDesc'))}</p><div class="gi-settings-grid">${PERSONAL_NEWS_CATEGORIES.map(category => `<label class="gi-toggle"><span>${e(t('personalNews.categories.' + category.id))}</span><input type="checkbox" data-category="${category.id}"${preferences.categories[category.id] ? ' checked' : ''}></label>`).join('')}</div>
      <h2>${tr('sections.alerts')}</h2><label class="gi-toggle"><span>${tr('importantOnly')}</span><input id="gi-alert-enabled" type="checkbox"${preferences.notificationPolicy !== 'off' ? ' checked' : ''}></label>
      <p>${tr('alertsDesc')}</p><button type="button" data-action="notifications">${tr('enableDeviceNotifications')}</button><label class="gi-toggle"><span>${tr('deviceNotifications')}</span><input id="gi-device-enabled" type="checkbox"${preferences.localNotifications ? ' checked' : ''}></label>
      <h3>${tr('alertTopics')}</h3><div class="gi-settings-grid">${PERSONAL_NEWS_CATEGORIES.map(category => `<label class="gi-toggle"><span>${e(t('personalNews.categories.' + category.id))}</span><input type="checkbox" data-alert-category="${category.id}"${!preferences.disabledAlertCategories.includes(category.id) ? ' checked' : ''}></label>`).join('')}</div>
      <h3>${tr('quietHours')}</h3><label class="gi-toggle"><span>${tr('quietHoursDesc')}</span><input id="gi-quiet-enabled" type="checkbox"${preferences.quietHours.enabled ? ' checked' : ''}></label><div class="gi-filters"><label>${tr('fromHour')}<input id="gi-quiet-start" type="number" min="0" max="23" value="${preferences.quietHours.start}"></label><label>${tr('toHour')}<input id="gi-quiet-end" type="number" min="0" max="23" value="${preferences.quietHours.end}"></label></div><p>${tr('languagesNote')}</p></section>`;
  }
  private sourcesHtml(): string {
    const preferences = getPersonalNewsPreferences();
    return `<p class="gi-explanation">${tr('sourcesDesc')}</p><form id="gi-source-form" class="gi-source-form"><label>${tr('platform')}<select id="gi-new-kind"><option value="github">GitHub</option><option value="youtube">YouTube</option><option value="rss">RSS / Atom</option></select></label><label>${tr('githubMode')}<select id="gi-new-github-mode">${['releases','tags','discovery','comparison'].map(mode => `<option value="${mode}">${tr('githubModes.' + mode)}</option>`).join('')}</select></label><label>${tr('target')}<input id="gi-new-target" placeholder="owner/repository · UC… · https://…" dir="ltr" required></label><button type="button" data-action="add-source">${tr('addSource')}</button></form>
      <div class="gi-sources">${this.connectors.map(connector => {
        const config = connector.config; const status = connector.getStatus();
        const source = intelligenceConnectorSource(config);
        return `<article class="gi-source-card"><h2 dir="auto">${e(config.feed?.name || config.kind.toUpperCase())}</h2><p dir="auto" class="gi-source-target">${e(config.target)}</p><p class="gi-source-state">${tr('states.' + status.state)}</p><p>${tr('lastSync')}: ${status.lastSync ? e(new Date(status.lastSync).toLocaleString(getLocale())) : tr('never')} · ${tr('received', { count: status.itemCount })}</p>
        ${status.error ? `<p class="gi-error">${tr('errors.' + status.error)}</p>` : ''}<p>${tr(status.canRead ? 'readOnly' : 'accountRequired')}</p>
        <label class="gi-toggle"><span>${tr('sourceEnabled')}</span><input type="checkbox" data-connector="${e(config.id)}"${config.enabled ? ' checked' : ''}></label><label class="gi-toggle"><span>${tr('sourceAlerts')}</span><input type="checkbox" data-alert-source="${e(source)}"${!preferences.disabledAlertSources.includes(source) ? ' checked' : ''}></label>
        <label>${tr('interval')}<input type="number" min="15" max="1440" data-interval="${e(config.id)}" value="${config.intervalMinutes}"></label><button type="button" data-action="remove-source" data-id="${e(config.id)}">${tr('removeSource')}</button></article>`;
      }).join('')}</div>`;
  }
  private publisherHtml(): string {
    return `<p class="gi-explanation">${tr('publisherDesc')}</p>${this.drafts.map(draft => `<article class="gi-card"><h2 dir="auto">${e(draft.title)}</h2><p>${e(draft.platform.toUpperCase())} · ${tr('draftOnly')} · ${tr('verification.' + draft.verification)}</p><label>${tr('draftText')}<textarea data-draft="${e(draft.id)}" rows="8" dir="auto">${e(draft.text)}</textarea></label><div class="gi-card-actions"><button type="button" data-action="copy-draft" data-id="${e(draft.id)}">${tr('copy')}</button><button type="button" data-action="remove-draft" data-id="${e(draft.id)}">${tr('delete')}</button></div><p>${tr('accountRequired')}</p></article>`).join('') || `<p class="gi-empty">${tr('emptyDrafts')}</p>`}`;
  }

  private eventById(id: string): IntelligenceEvent | undefined {
    return [...this.events, ...buildIntelligenceEvents(this.saved, getPersonalNewsPreferences())].find(event => event.id === id);
  }
  private async onClick(event: Event): Promise<void> {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[target="_blank"]');
    if (link && this.root.contains(link) && usesNativeIntelligenceLinks()) {
      event.preventDefault(); await openIntelligenceSource(link.href); return;
    }
    const button = (event.target as Element).closest<HTMLElement>('[data-action], [data-section]');
    if (!button || !this.root.contains(button)) return;
    const section = button.dataset.section as Section;
    if (sections.includes(section)) { this.navigate(section); return; }
    const id = button.dataset.id ?? '';
    const story = this.eventById(id);
    switch (button.dataset.action) {
      case 'refresh': await this.refresh(); break;
      case 'theme': setThemePreference(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); break;
      case 'language': await changeLanguage(getCurrentLanguage() === 'ar' ? 'en' : 'ar'); await loadIntelligenceFonts(getCurrentLanguage()); break;
      case 'save': if (story) {
        const key = articleIdentity(story.primary);
        const storyKeys = new Set(story.articles.map(articleIdentity));
        this.saved = this.saved.some(article => articleIdentity(article) === key) ? this.saved.filter(article => !storyKeys.has(articleIdentity(article))) : [...story.articles, ...this.saved.filter(article => !storyKeys.has(articleIdentity(article)))].slice(0, 100);
        this.savedResult(saveIntelligenceArticles('saved', this.saved)); this.updateCards();
      } break;
      case 'draft': if (story) {
        const language = getCurrentLanguage() === 'ar' ? 'ar' : 'en';
        const summary = this.summaries.get(editorKey(story));
        const drafts = (['x', 'facebook'] as const).map(platform => {
          const draft = prepareIntelligenceDraft(summary ? { ...story, summary: summary.text } : story, platform, language);
          if (summary && platform === 'facebook') draft.text = `${t('intelligence.aiReviewRequired')}\n${draft.text}`;
          return draft;
        });
        const keys = new Set(drafts.map(draft => draft.id));
        this.drafts = [...drafts, ...this.drafts.filter(draft => !keys.has(draft.id))].slice(0, 40);
        this.savedResult(saveIntelligenceDrafts(this.drafts)); this.navigate('publisher');
      } break;
      case 'translate': if (story) {
        const key = editorKey(story);
        button.setAttribute('disabled', '');
        this.showNotice('translating');
        const { translateText } = await import('@/services/summarization');
        const translated = await translateText(story.summary, getCurrentLanguage() === 'ar' ? 'ar' : 'en');
        if (this.destroyed) return;
        if (translated) { this.translations.set(key, translated); if (this.translations.size > 100) this.translations.delete(this.translations.keys().next().value!); this.notice = ''; this.render(); }
        else { button.removeAttribute('disabled'); this.showNotice('translationUnavailable'); }
      } break;
      case 'summarize': if (story) {
        const key = editorKey(story);
        button.setAttribute('disabled', ''); this.showNotice('summarizing');
        const { summarizeIntelligenceEvent } = await import('@/services/intelligence-editor');
        const result = await summarizeIntelligenceEvent(story, getCurrentLanguage() === 'ar' ? 'ar' : 'en');
        if (this.destroyed) return;
        if (result?.summary) { this.summaries.set(key, { text: result.summary, provider: result.provider }); if (this.summaries.size > 100) this.summaries.delete(this.summaries.keys().next().value!); this.notice = ''; this.render(); }
        else { button.removeAttribute('disabled'); this.showNotice('summaryUnavailable'); }
      } break;
      case 'notifications': {
        if (typeof Notification === 'undefined') { this.showNotice('notificationUnavailable'); break; }
        const permission = await Notification.requestPermission();
        if (this.destroyed) return;
        const preferences = getPersonalNewsPreferences(); preferences.localNotifications = permission === 'granted';
        this.savedResult(savePersonalNewsPreferences(preferences));
        if (permission !== 'granted') this.showNotice('notificationUnavailable');
      } break;
      case 'add-source': this.addSource(); break;
      case 'remove-source': this.configs = this.configs.filter(config => config.id !== id); this.applySourceChange(); break;
      case 'copy-draft': { const draft = this.drafts.find(draft => draft.id === id); if (draft) { await navigator.clipboard.writeText(draft.text); this.showNotice('copied'); } } break;
      case 'remove-draft': this.drafts = this.drafts.filter(draft => draft.id !== id); this.savedResult(saveIntelligenceDrafts(this.drafts)); this.render(); break;
    }
  }
  private async onChange(event: Event): Promise<void> {
    const performanceSelect = event.target as HTMLSelectElement;
    if (performanceSelect.id === 'gi-performance') {
      const persisted = setDevicePerformanceMode(performanceSelect.value as 'auto' | 'economy' | 'full');
      this.savedResult(persisted);
      return;
    }
    const input = event.target as HTMLInputElement;
    if (input.id === 'gi-section') { this.navigate(input.value as Section); return; }
    if (input.id === 'gi-source') { this.sourceFilter = input.value; this.updateCards(); return; }
    if (input.id === 'gi-severity') { this.severityFilter = input.value; this.updateCards(); return; }
    if (input.id === 'gi-country') { this.countryFilter = input.value; this.updateCards(); return; }
    if (input.id === 'gi-time') { this.timeFilter = input.value; this.updateCards(); return; }
    if (input.dataset.category) {
      const category = PERSONAL_NEWS_CATEGORIES.find(category => category.id === input.dataset.category);
      if (category) this.savedResult(setPersonalNewsCategory(category.id, input.checked));
      return;
    }
    if (input.dataset.connector || input.dataset.interval) {
      const config = this.configs.find(config => config.id === (input.dataset.connector || input.dataset.interval));
      if (config) {
        if (input.dataset.connector) config.enabled = input.checked;
        else config.intervalMinutes = Math.max(15, Math.min(1440, Number(input.value) || 30));
        this.applySourceChange();
      } return;
    }
    if (input.dataset.draft) {
      const draft = this.drafts.find(draft => draft.id === input.dataset.draft);
      if (draft) { draft.text = input.value.slice(0, 5000); this.savedResult(saveIntelligenceDrafts(this.drafts)); } return;
    }
    const preferences = getPersonalNewsPreferences();
    if (input.dataset.alertCategory) {
      const category = PERSONAL_NEWS_CATEGORIES.find(category => category.id === input.dataset.alertCategory);
      if (category) preferences.disabledAlertCategories = input.checked ? preferences.disabledAlertCategories.filter(id => id !== category.id) : [...new Set([...preferences.disabledAlertCategories, category.id])];
    } else if (input.dataset.alertSource) {
      const source = input.dataset.alertSource;
      preferences.disabledAlertSources = input.checked ? preferences.disabledAlertSources.filter(name => name !== source) : [...new Set([...preferences.disabledAlertSources, source])];
    } else if (input.id === 'gi-alert-enabled') preferences.notificationPolicy = input.checked ? 'important_only' : 'off';
    else if (input.id === 'gi-device-enabled') {
      if (input.checked && (typeof Notification === 'undefined' || Notification.permission !== 'granted')) { input.checked = false; this.showNotice('notificationUnavailable'); return; }
      preferences.localNotifications = input.checked;
    } else if (input.id === 'gi-quiet-enabled') preferences.quietHours.enabled = input.checked;
    else if (input.id === 'gi-quiet-start') preferences.quietHours.start = Math.max(0, Math.min(23, Number(input.value) || 0));
    else if (input.id === 'gi-quiet-end') preferences.quietHours.end = Math.max(0, Math.min(23, Number(input.value) || 0));
    else return;
    this.savedResult(savePersonalNewsPreferences(preferences));
  }
  private addSource(): void {
    const kind = this.root.querySelector<HTMLSelectElement>('#gi-new-kind')?.value;
    const target = this.root.querySelector<HTMLInputElement>('#gi-new-target')?.value.trim() ?? '';
    const githubMode = this.root.querySelector<HTMLSelectElement>('#gi-new-github-mode')?.value ?? 'releases';
    const id = `${kind}:${intelligenceHash(`${target}|${kind === 'github' ? githubMode : ''}`)}`;
    const config = validateIntelligenceConnector({ id, kind, target, githubMode, enabled: true, intervalMinutes: 30 });
    if (!config || this.configs.length >= 30 || this.configs.some(current => current.id === id || (current.kind === config.kind && current.target === target
      && (config.kind !== 'github' || (current.githubMode ?? 'releases') === (config.githubMode ?? 'releases'))))) { this.showNotice('invalidSource'); return; }
    this.configs.push(config); this.applySourceChange();
  }
  private applySourceChange(): void {
    this.refreshController?.abort(); this.generation++; this.busy = false;
    this.savedResult(saveIntelligenceConnectorConfigs(this.configs));
    const names = new Set(this.configs.filter(config => config.enabled).map(config => intelligenceConnectorSource(config)));
    this.articles = this.articles.filter(article => names.has(article.source));
    this.resetConnectors(); this.rebuild(); this.render(); void this.refresh();
  }
}
