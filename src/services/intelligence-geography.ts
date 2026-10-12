import { ISO2_TO_ISO3 } from '@/utils/country-codes';

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670]/g, '').replace(/[أإآ]/g, 'ا');
}
const names = ['ar', 'en'].map(locale => new Intl.DisplayNames([locale], { type: 'region' }));
const extra: Record<string, string[]> = { US: ['usa', 'u.s.', 'united states of america'], GB: ['uk', 'u.k.', 'britain'], IQ: ['iraqi', 'العراقي', 'العراقية'] };
const patterns = Object.keys(ISO2_TO_ISO3).flatMap(code => {
  const alternatives = [...new Set([...names.map(name => name.of(code) ?? ''), ...(extra[code] ?? [])].map(normalize))]
    .filter(value => value.length > 1 && value !== code.toLowerCase())
    .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return alternatives.length ? [{ code, pattern: new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${alternatives.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'u') }] : [];
});

/** Explicit name mentions are context hints, not proof of location or geographic impact. */
export function intelligenceCountryMentions(text: string): string[] {
  const normalized = normalize(text);
  return patterns.filter(entry => entry.pattern.test(normalized)).map(entry => entry.code);
}
