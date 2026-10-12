import assert from 'node:assert/strict';
import { it } from 'node:test';
import { intelligenceCountryMentions } from '../src/services/intelligence-geography.ts';
import { summarizeIntelligenceEvent } from '../src/services/intelligence-editor.ts';
import { buildIntelligenceEvents } from '../src/services/intelligence-engine.ts';
import { defaultPersonalNewsPreferences } from '../src/services/personal-news.ts';
it('recognizes explicit Arabic/English country names at word boundaries',()=>{
 assert.deepEqual(intelligenceCountryMentions('العِراق يبحث الطاقة مع China'),['CN','IQ']);
 assert.equal(intelligenceCountryMentions('machinations and Iraqi oil').includes('CN'),false);
 assert.equal(intelligenceCountryMentions('Iraqi oil').includes('IQ'),true);
 assert.deepEqual(intelligenceCountryMentions('software update without country names'),[]);
});
it('grounds optional summaries in bounded source extracts and keeps original evidence intact',async()=>{
 const event=buildIntelligenceEvents([{title:'Iraq China energy talks',source:'Reuters',link:'https://reuters.com/a',pubDate:new Date(),snippet:'Officials discussed cross-border energy coordination.',isAlert:false}],defaultPersonalNewsPreferences())[0]!;
 assert.ok(event.reasons.includes('geography'));assert.equal(event.verification,'unconfirmed');
 const result=await summarizeIntelligenceEvent(event,'ar',async(titles,lang,bodies)=>{
  assert.equal(lang,'ar');assert.equal(titles[0],event.primary.title);assert.equal(bodies[0],event.summary);
  return {summary:'ملخص قابل للمراجعة',provider:'ollama',model:'fixture',cached:false};
 });
 assert.equal(result?.summary,'ملخص قابل للمراجعة');assert.equal(event.summary,event.primary.snippet);
});
it('does not invoke a provider when there is insufficient source context',async()=>{
 const event=buildIntelligenceEvents([{title:'Brief',source:'Source',link:'https://example.com/a',pubDate:new Date(),isAlert:false}],defaultPersonalNewsPreferences())[0]!;
 let calls=0;assert.equal(await summarizeIntelligenceEvent(event,'en',async()=>{calls++;return null;}),null);assert.equal(calls,0);
});
