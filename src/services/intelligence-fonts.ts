const loads = new Map<string, Promise<unknown>>();
export async function loadIntelligenceFonts(language: string): Promise<void> {
  const family = language === 'ar' ? 'cairo' : 'nunito';
  let load = loads.get(family);
  if (!load) {
    load = family === 'cairo' ? Promise.all([
      import('@fontsource/cairo/400.css'), import('@fontsource/cairo/600.css'), import('@fontsource/cairo/700.css'),
    ]) : Promise.all([import('@fontsource/nunito/400.css'), import('@fontsource/nunito/600.css'), import('@fontsource/nunito/700.css')]);
    loads.set(family, load);
  }
  try { await load; } catch { loads.delete(family); /* System fonts keep the feed readable offline. */ }
}
