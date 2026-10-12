import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getIntelligenceArticles, saveIntelligenceArticles, getIntelligenceConnectorConfigs, hasIntelligenceConnectorConfigs, saveIntelligenceConnectorConfigs, INTELLIGENCE_STORE_KEYS } from '@/services/intelligence-store';
const article={ title:'<img src=x onerror=alert(1)>',source:'Example',link:'https://example.com/1',pubDate:new Date('2026-10-11T08:00:00Z'),isAlert:false };
beforeEach(()=>{ vi.unstubAllGlobals(); localStorage.clear(); for(const key of Object.values(INTELLIGENCE_STORE_KEYS)) localStorage.setItem(key,'["reset"]'); });
afterEach(()=>vi.unstubAllGlobals());
describe('Intelligence durable storage',()=>{
 it('revives dates, rejects unsafe URLs and never re-enables explicitly removed connectors',()=>{
  expect(saveIntelligenceArticles('saved',[article])).toBe(true);
  expect(getIntelligenceArticles('saved')[0]?.pubDate).toBeInstanceOf(Date);
  localStorage.setItem(INTELLIGENCE_STORE_KEYS.saved,JSON.stringify([{...article,link:'javascript:alert(1)'}]));
  expect(getIntelligenceArticles('saved')).toEqual([]);
  expect(saveIntelligenceConnectorConfigs([])).toBe(true); expect(hasIntelligenceConnectorConfigs()).toBe(true); expect(getIntelligenceConnectorConfigs()).toEqual([]);
 });
 it('reports quota failures while retaining session state and accepts later external updates',()=>{
  const backing=localStorage;
  vi.stubGlobal('localStorage',{getItem:(key:string)=>backing.getItem(key),setItem:()=>{throw new Error('quota');}});
  expect(saveIntelligenceArticles('saved',[article])).toBe(false); expect(getIntelligenceArticles('saved')).toHaveLength(1);
  backing.setItem(INTELLIGENCE_STORE_KEYS.saved,'[]'); expect(getIntelligenceArticles('saved')).toEqual([]);
 });
 it('recovers from malformed data and caps cached articles',()=>{
  localStorage.setItem(INTELLIGENCE_STORE_KEYS.cache,'{bad'); expect(getIntelligenceArticles('cache')).toEqual([]);
  saveIntelligenceArticles('cache',Array.from({length:700},(_,i)=>({...article,link:`https://example.com/${i}`,isAlert:i===599})));
  const cached=getIntelligenceArticles('cache');
  expect(cached).toHaveLength(600);expect(cached[599]?.isAlert).toBe(true);
 });
 it('preserves the complete source identity for a valid long GitHub repository name',()=>{
  const repository=`${'a'.repeat(39)}/${'b'.repeat(100)}`;
  const source=`GitHub Comparison:${repository}`;
  saveIntelligenceArticles('cache',[{...article,source,link:`https://github.com/${repository}/releases/tag/v2.0.0`,officialRelease:{repository,version:'v2.0.0'}}]);
  expect(getIntelligenceArticles('cache')[0]?.source).toBe(source);
 });
});
