import type { Feed, NewsItem } from '@/types';
import type { IntelligenceArticle } from './intelligence-engine';
import { effectivePubDateMs } from './feed-date';
import { canonicalPersonalNewsUrl } from './personal-news';

export type IntelligenceConnectorKind = 'rss' | 'github' | 'youtube' | 'x' | 'facebook';
export interface IntelligenceConnectorConfig {
  id: string;
  kind: IntelligenceConnectorKind;
  target: string;
  enabled: boolean;
  intervalMinutes: number;
  feed?: Feed;
  githubMode?: 'releases' | 'tags' | 'discovery' | 'comparison';
}
export interface IntelligenceConnectorStatus {
  id: string;
  state: 'idle' | 'syncing' | 'ready' | 'disabled' | 'error' | 'authorization_required' | 'quota';
  lastSync: number | null;
  itemCount: number;
  error: 'authentication' | 'quota' | 'network' | 'invalid_data' | 'configuration' | null;
  canRead: boolean;
  canPublish: false;
  nextAttempt: number;
}
export interface IntelligenceConnectorResult { items: IntelligenceArticle[]; status: IntelligenceConnectorStatus }
export interface ConnectorDependencies {
  fetch?: typeof fetch;
  readRss?: (feed: Feed, signal: AbortSignal) => Promise<NewsItem[]>;
  now?: () => number;
}
class ConnectorFailure extends Error {
  constructor(public readonly kind: NonNullable<IntelligenceConnectorStatus['error']>, public readonly retryAfterMs = 60_000) { super(kind); }
}
const repositoryPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!(?:\.{1,2})$)[A-Za-z0-9_.-]{1,100}$/;
const channelPattern = /^UC[A-Za-z0-9_-]{22}$/;

export function validateIntelligenceConnector(value: unknown): IntelligenceConnectorConfig | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!['rss', 'github', 'youtube', 'x', 'facebook'].includes(String(candidate.kind))
    || typeof candidate.id !== 'string' || !/^[\w:.-]{1,150}$/.test(candidate.id)
    || typeof candidate.target !== 'string' || candidate.target.length > 2000) return null;
  const kind = candidate.kind as IntelligenceConnectorKind;
  const githubMode = ['releases', 'tags', 'discovery', 'comparison'].includes(String(candidate.githubMode))
    ? candidate.githubMode as IntelligenceConnectorConfig['githubMode'] : 'releases';
  if (kind === 'github' && (githubMode === 'discovery'
    ? !candidate.target.trim() || candidate.target.length > 150 || /[\u0000-\u001f]/.test(candidate.target)
    : !repositoryPattern.test(candidate.target))) return null;
  if (kind === 'youtube' && !channelPattern.test(candidate.target)) return null;
  if (kind === 'rss' && !canonicalPersonalNewsUrl(candidate.target)) return null;
  const minutes = Number(candidate.intervalMinutes);
  return { id: candidate.id, kind, target: candidate.target, enabled: candidate.enabled === true,
    intervalMinutes: Number.isFinite(minutes) ? Math.max(15, Math.min(1440, Math.round(minutes))) : 30,
    ...(kind === 'github' ? { githubMode } : {}) };
}

export function intelligenceConnectorSource(config: IntelligenceConnectorConfig): string {
  if (config.feed) return config.feed.name;
  if (config.kind === 'github') return `${config.githubMode === 'tags' ? 'GitHub Tags' : config.githubMode === 'discovery' ? 'GitHub Search' : config.githubMode === 'comparison' ? 'GitHub Comparison' : 'GitHub'}:${config.target}`;
  return config.kind === 'youtube' ? `YouTube:${config.target}` : config.id;
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}
function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Each connector owns its cache, request interval and backoff. No account tokens live here. */
export class IntelligenceConnector {
  private cache: IntelligenceArticle[] = [];
  private inFlight: Promise<IntelligenceConnectorResult> | null = null;
  private failures = 0;
  private status: IntelligenceConnectorStatus;
  constructor(public readonly config: IntelligenceConnectorConfig, private readonly dependencies: ConnectorDependencies = {}) {
    this.status = { id: config.id, state: config.enabled ? 'idle' : 'disabled', lastSync: null, itemCount: 0,
      error: null, canRead: !['x', 'facebook'].includes(config.kind), canPublish: false, nextAttempt: 0 };
  }
  getStatus(): IntelligenceConnectorStatus { return { ...this.status }; }

  /** One scheduling authority for TTL/backoff; blocked account connectors transition once. */
  isDue(): boolean {
    if (!this.config.enabled || this.inFlight) return false;
    if (!this.status.canRead) return this.status.state === 'idle';
    return (this.dependencies.now?.() ?? Date.now()) >= this.status.nextAttempt;
  }

  sync(signal?: AbortSignal): Promise<IntelligenceConnectorResult> {
    if (this.inFlight) return this.inFlight;
    const now = this.dependencies.now?.() ?? Date.now();
    if (!this.config.enabled) {
      this.status.state = 'disabled';
      return Promise.resolve({ items: [], status: this.getStatus() });
    }
    if (['x', 'facebook'].includes(this.config.kind)) {
      this.status.state = 'authorization_required'; this.status.error = 'configuration';
      return Promise.resolve({ items: [], status: this.getStatus() });
    }
    if (now < this.status.nextAttempt) return Promise.resolve({ items: [...this.cache], status: this.getStatus() });
    this.inFlight = this.perform(signal).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async perform(externalSignal?: AbortSignal): Promise<IntelligenceConnectorResult> {
    const now = this.dependencies.now?.() ?? Date.now();
    const signal = externalSignal ? AbortSignal.any([externalSignal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
    this.status.state = 'syncing';
    try {
      signal.throwIfAborted();
      let items: IntelligenceArticle[];
      if (this.config.kind === 'github') items = await this.readGitHub(signal);
      else {
        const read = this.dependencies.readRss ?? (async (feed, abortSignal) => {
          const { fetchFeed, BRIEF_ONLY_RSS_FETCH_POLICY, getFeedFailures } = await import('./rss');
          const result = await fetchFeed(feed, { signal: abortSignal, policy: BRIEF_ONLY_RSS_FETCH_POLICY });
          const failure = getFeedFailures().get(feed.name);
          if (failure && failure.count > 0) throw new ConnectorFailure('network');
          return result;
        });
        let feed = this.config.feed;
        if (!feed) {
          const { rssProxyUrl } = await import('@/utils');
          const url = this.config.kind === 'youtube'
            ? `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(this.config.target)}` : this.config.target;
          feed = { name: this.config.kind === 'youtube' ? `YouTube:${this.config.target}` : this.config.id, url: rssProxyUrl(url) };
        }
        items = await read(feed, signal);
      }
      signal.throwIfAborted();
      this.cache = items.filter(item => canonicalPersonalNewsUrl(item.link)).slice(0, 60);
      this.failures = 0;
      this.status = { ...this.status, state: 'ready', lastSync: now, itemCount: this.cache.length, error: null,
        nextAttempt: now + this.config.intervalMinutes * 60_000 };
    } catch (error) {
      if (externalSignal?.aborted) throw error;
      this.failures++;
      const failure = error instanceof ConnectorFailure ? error : new ConnectorFailure('network');
      this.status = { ...this.status, state: failure.kind === 'authentication' ? 'authorization_required' : failure.kind === 'quota' ? 'quota' : 'error',
        error: failure.kind, nextAttempt: now + Math.min(60 * 60_000, Math.max(failure.retryAfterMs, 30_000 * 2 ** Math.min(this.failures, 6))) };
    }
    return { items: [...this.cache], status: this.getStatus() };
  }

  private async githubJson(path: string, signal: AbortSignal): Promise<unknown> {
    const request = this.dependencies.fetch ?? ((...args) => globalThis.fetch(...args));
    const response = await request(`https://api.github.com/${path}`, {
      signal, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, credentials: 'omit',
    });
    if (!response.ok) {
      const quota = response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
      const retrySeconds = Number(response.headers.get('retry-after'));
      throw new ConnectorFailure(quota ? 'quota' : [401, 403].includes(response.status) ? 'authentication' : 'network',
        quota ? Math.max(60_000, Number.isFinite(retrySeconds) ? retrySeconds * 1000 : 15 * 60_000) : 60_000);
    }
    return response.json();
  }

  private async readGitHub(signal: AbortSignal): Promise<IntelligenceArticle[]> {
    const mode = this.config.githubMode ?? 'releases';
    const source = intelligenceConnectorSource(this.config);
    if (mode === 'discovery') {
      const result = jsonObject(await this.githubJson(`search/repositories?q=${encodeURIComponent(this.config.target)}&sort=stars&order=desc&per_page=20`, signal));
      if (!Array.isArray(result?.items)) throw new ConnectorFailure('invalid_data');
      return result.items.flatMap((entry): IntelligenceArticle[] => {
        const repo = jsonObject(entry);
        const name = text(repo?.full_name, 150);
        if (!repositoryPattern.test(name) || repo?.private === true) return [];
        const date = new Date(text(repo?.pushed_at, 50));
        return [{ source, title: `GitHub ${name}`, link: `https://github.com/${name}`,
          pubDate: Number.isFinite(date.getTime()) ? date : new Date(0), pubDateMissing: !Number.isFinite(date.getTime()),
          snippet: text(repo?.description, 350), isAlert: false }];
      });
    }
    if (!repositoryPattern.test(this.config.target)) throw new ConnectorFailure('configuration');
    if (mode === 'tags') {
      const body = await this.githubJson(`repos/${this.config.target}/tags?per_page=20`, signal);
      if (!Array.isArray(body)) throw new ConnectorFailure('invalid_data');
      return body.flatMap((entry): IntelligenceArticle[] => {
        const tag = jsonObject(entry);
        const sha = text(jsonObject(tag?.commit)?.sha, 40);
        const name = text(tag?.name, 100);
        if (!name || !/^[a-f0-9]{40}$/i.test(sha)) return [];
        // The tags endpoint has no publication date. Never pretend sync time is publication.
        return [{ source, title: `GitHub ${this.config.target} · ${name}`, link: `https://github.com/${this.config.target}/tree/${sha}`,
          pubDate: new Date(0), pubDateMissing: true, snippet: `${name} · ${sha}`, isAlert: false }];
      });
    }
    const body = await this.githubJson(`repos/${this.config.target}/releases?per_page=20`, signal);
    if (!Array.isArray(body)) throw new ConnectorFailure('invalid_data');
    const articles = body.flatMap((entry): IntelligenceArticle[] => {
      const release = jsonObject(entry);
      if (!release || release.draft === true || release.prerelease === true) return [];
      const url = canonicalPersonalNewsUrl(text(release.html_url, 2000));
      const date = new Date(text(release.published_at, 50));
      if (!url || new URL(url).origin !== 'https://github.com' || !new URL(url).pathname.toLowerCase().startsWith(`/${this.config.target.toLowerCase()}/releases/`)) return [];
      const version = text(release.tag_name, 100);
      return [{ source, title: `GitHub ${this.config.target} · ${text(release.name, 200) || version}`,
        link: url, pubDate: Number.isFinite(date.getTime()) ? date : new Date(0), pubDateMissing: !Number.isFinite(date.getTime()),
        snippet: text(release.body, 400).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(), isAlert: false,
        officialRelease: { repository: this.config.target, version } }];
    });
    if (mode === 'comparison' && articles.length >= 2) {
      articles.sort((a, b) => effectivePubDateMs(b) - effectivePubDateMs(a));
      const current = articles[0]!; const previous = articles[1]!;
      const base = encodeURIComponent(previous.officialRelease!.version);
      const head = encodeURIComponent(current.officialRelease!.version);
      const comparison = jsonObject(await this.githubJson(`repos/${this.config.target}/compare/${base}...${head}?per_page=10`, signal));
      if (!comparison || !Array.isArray(comparison.commits) || typeof comparison.total_commits !== 'number') throw new ConnectorFailure('invalid_data');
      const messages = comparison.commits.flatMap(entry => {
        const message = text(jsonObject(jsonObject(entry)?.commit)?.message, 120).split('\n')[0];
        return message ? [message] : [];
      }).slice(0, 3);
      current.snippet = `${previous.officialRelease!.version} → ${current.officialRelease!.version} · ${comparison.total_commits} commits · ${messages.join(' · ')}`.slice(0, 400);
      current.releaseComparisonUrl = `https://github.com/${this.config.target}/compare/${base}...${head}`;
      return [current];
    }
    return articles;
  }
}

export async function syncIntelligenceConnectors(connectors: IntelligenceConnector[], signal: AbortSignal): Promise<IntelligenceConnectorResult[]> {
  const results: IntelligenceConnectorResult[] = [];
  // Two at a time bounds data/CPU load on mobile; one failed source cannot stop siblings.
  for (let index = 0; index < connectors.length; index += 2) {
    signal.throwIfAborted();
    const batch = await Promise.allSettled(connectors.slice(index, index + 2).map(connector => connector.sync(signal)));
    batch.forEach((result, offset) => {
      if (result.status === 'fulfilled') results.push(result.value);
      else results.push({ items: [], status: connectors[index + offset]!.getStatus() });
    });
  }
  signal.throwIfAborted();
  return results;
}
