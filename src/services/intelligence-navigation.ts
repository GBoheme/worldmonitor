import { isDesktopRuntime, isGbohemeMobileRuntime } from './desktop-runtime';
import { canonicalPersonalNewsUrl } from './personal-news';

export function usesNativeIntelligenceLinks(): boolean {
  return isDesktopRuntime() || (isGbohemeMobileRuntime() && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
}

/** Source links leave the native WebView; credentials and executable schemes are rejected. */
export async function openIntelligenceSource(raw: string): Promise<void> {
  const url = canonicalPersonalNewsUrl(raw);
  if (!url) throw new Error('invalid_url');
  if (isGbohemeMobileRuntime()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    const { openExternalUrl } = await import('./external-navigation');
    if (await openExternalUrl(url) === 'failed') throw new Error('open_failed');
  }
}
