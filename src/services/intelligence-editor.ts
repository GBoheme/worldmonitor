import type { IntelligenceEvent } from './intelligence-engine';
import type { SummarizationResult } from './summarization';

export async function summarizeIntelligenceEvent(event: IntelligenceEvent, language: 'ar' | 'en',
  provider?: (headlines: string[], language: string, bodies: string[]) => Promise<SummarizationResult | null>): Promise<SummarizationResult | null> {
  const headlines = event.articles.map(article => article.title).slice(0, 8);
  const bodies = event.articles.map(article => article.snippet ?? '').slice(0, 8);
  if (headlines.length === 1 && bodies[0] && bodies[0].length >= 20 && bodies[0] !== headlines[0]) {
    headlines.push(bodies[0]); bodies.push(bodies[0]);
  }
  if (headlines.length < 2) return null;
  const run = provider ?? (async (titles, lang, context) => {
    // This function is called by the explicit summary action, never by the
    // connector polling loop. Economy boot leaves the worker stopped; honor
    // the existing local-model opt-in before starting it on demand.
    if (lang === 'en') {
      const [{ getAiFlowSettings }, { isDesktopRuntime }] = await Promise.all([
        import('./ai-flow-settings'), import('./runtime'),
      ]);
      if (getAiFlowSettings().browserModel || isDesktopRuntime()) {
        const { mlWorker } = await import('./ml-worker');
        await mlWorker.init().catch(() => false);
      }
    }
    const { generateSummary } = await import('./summarization');
    // The original provider/entitlement checks remain authoritative. The
    // existing English browser model cannot stand in for an Arabic model.
    return generateSummary(titles, undefined, undefined, lang, { bodies: context, skipBrowserFallback: lang === 'ar' });
  });
  return run(headlines, language, bodies);
}
