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
    const { generateSummary } = await import('./summarization');
    // The original provider/entitlement checks remain authoritative. The
    // existing English browser model cannot stand in for an Arabic model.
    return generateSummary(titles, undefined, undefined, lang, { bodies: context, skipBrowserFallback: lang === 'ar' });
  });
  return run(headlines, language, bodies);
}
