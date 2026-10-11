import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IntelligenceConnector, intelligenceConnectorSource, validateIntelligenceConnector, syncIntelligenceConnectors } from '../src/services/intelligence-connectors.ts';
import { buildIntelligenceEvents, type IntelligenceArticle } from '../src/services/intelligence-engine.ts';
import { defaultPersonalNewsPreferences } from '../src/services/personal-news.ts';
import { prepareIntelligenceDraft, intelligencePublishBlocker } from '../src/services/intelligence-publisher.ts';
const now = Date.parse('2026-10-11T08:30:00Z');
const config = { id:'github:test',kind:'github' as const,target:'GBoheme/worldmonitor',enabled:true,intervalMinutes:15 };
const release = { html_url:'https://github.com/GBoheme/worldmonitor/releases/tag/v3.0.0',tag_name:'v3.0.0',name:'Stable',published_at:new Date(now-60000).toISOString(),body:'Official release notes' };
const article: IntelligenceArticle = { title:'AI software release',source:'GitHub:GBoheme/worldmonitor',link:release.html_url,pubDate:new Date(now-60000),isAlert:false,officialRelease:{repository:config.target,version:'v3.0.0'} };
describe('Official source connectors', () => {
 it('keeps tags separate and does not invent a publication date', async () => {
  const tagConfig={...config,githubMode:'tags' as const};
  const connector=new IntelligenceConnector(tagConfig,{now:()=>now,fetch:async url=>{
   assert.match(String(url),/\/tags\?per_page=20$/);
   return Response.json([{name:'v2.1',commit:{sha:'a'.repeat(40)}},{name:'invalid',commit:{sha:'javascript:bad'}}]);
  }});
  const result=await connector.sync();assert.equal(result.items.length,1);
  assert.equal(result.items[0]?.pubDateMissing,true);assert.equal(result.items[0]?.pubDate.getTime(),0);
  assert.notEqual(intelligenceConnectorSource(tagConfig),intelligenceConnectorSource(config));
 });
 it('discovers repositories using a bounded official search, with no invented trending rank', async () => {
  const discovery=validateIntelligenceConnector({...config,githubMode:'discovery',target:'topic:ai language:TypeScript'})!;
  assert.equal(discovery.githubMode,'discovery');
  const connector=new IntelligenceConnector(discovery,{now:()=>now,fetch:async url=>{
   const parsed=new URL(String(url));assert.equal(parsed.pathname,'/search/repositories');
   assert.equal(parsed.searchParams.get('q'),discovery.target);
   return Response.json({items:[{full_name:'GBoheme/worldmonitor',private:false,pushed_at:new Date(now).toISOString(),description:'AI software'},{full_name:'../bad'}]});
  }});
  const result=await connector.sync();assert.equal(result.items.length,1);assert.equal(result.items[0]?.officialRelease,undefined);
 });
 it('compares published release refs and keeps source commit messages as extracts', async () => {
  const connector=new IntelligenceConnector({...config,githubMode:'comparison'},{now:()=>now,fetch:async url=>{
   if(String(url).includes('/compare/')) {assert.match(String(url),/v2\.0\.0\.\.\.v3\.0\.0/);return Response.json({total_commits:3,commits:[{commit:{message:'Fix mobile navigation\nDetails'}}]});}
   return Response.json([release,{...release,tag_name:'v2.0.0',published_at:new Date(now-3600000).toISOString(),html_url:'https://github.com/GBoheme/worldmonitor/releases/tag/v2.0.0'}]);
  }});
  const result=await connector.sync();assert.equal(result.items.length,1);assert.match(result.items[0]!.snippet!,/3 commits.*Fix mobile navigation/);
  assert.match(result.items[0]!.releaseComparisonUrl!,/github.com\/GBoheme\/worldmonitor\/compare\/v2\.0\.0\.\.\.v3\.0\.0/);
  assert.equal(buildIntelligenceEvents(result.items,defaultPersonalNewsPreferences(),now)[0]?.verification,'primary');
 });
 it('fails closed when comparison access is quota-limited',async()=>{
  const connector=new IntelligenceConnector({...config,githubMode:'comparison'},{now:()=>now,fetch:async url=>String(url).includes('/compare/')
   ? new Response('',{status:403,headers:{'x-ratelimit-remaining':'0'}})
   : Response.json([release,{...release,tag_name:'v2.0.0'}])});
  const result=await connector.sync();assert.equal(result.status.state,'quota');assert.equal(result.items.length,0);
 });
 it('whitelists configuration and rejects credential-bearing/invalid targets', () => {
  assert.equal(validateIntelligenceConnector({...config,token:'secret'})?.target,config.target);
  assert.equal('token' in validateIntelligenceConnector({...config,token:'secret'})!,false);
  assert.equal(validateIntelligenceConnector({...config,target:'../../private'}),null);
  assert.equal(validateIntelligenceConnector({...config,kind:'rss',target:'https://token:secret@example.com/rss'}),null);
  assert.equal(validateIntelligenceConnector({...config,kind:'youtube',target:'arbitrary-name'}),null);
  assert.equal(validateIntelligenceConnector({...config,intervalMinutes:1})?.intervalMinutes,15);
 });
 it('reads stable official releases without credentials and deduplicates in-flight requests', async () => {
  let calls=0;
  const connector = new IntelligenceConnector(config,{now:()=>now,fetch:async (url,options)=>{
   calls++; assert.match(String(url),/api.github.com\/repos\/GBoheme\/worldmonitor\/releases/);
   assert.equal(options?.credentials,'omit'); assert.equal(new Headers(options?.headers).has('Authorization'),false);
   return Response.json([release,{...release,draft:true},{...release,prerelease:true},{...release,html_url:'https://evil.test/releases/1'}]);
  }});
  const [a,b] = await Promise.all([connector.sync(),connector.sync()]);
  assert.equal(calls,1); assert.equal(a.items.length,1); assert.equal(b.items[0]?.officialRelease?.version,'v3.0.0');
  await connector.sync(); assert.equal(calls,1); assert.equal(connector.getStatus().state,'ready');
 });
 it('keeps last good data and backs off after quota errors', async () => {
  let clock=now; let calls=0;
  const connector = new IntelligenceConnector(config,{now:()=>clock,fetch:async ()=> ++calls===1 ? Response.json([release]) : new Response('',{status:429,headers:{'retry-after':'120'}})});
  await connector.sync(); clock+=16*60000;
  const failed=await connector.sync(); assert.equal(failed.items.length,1); assert.equal(failed.status.state,'quota');
  await connector.sync(); assert.equal(calls,2); assert.ok(failed.status.nextAttempt>=clock+120000);
 });
 it('isolates failure and exposes missing social authorization without issuing requests', async () => {
  let calls=0;
  const fetcher: typeof fetch = async ()=>{calls++;return new Response('',{status:503});};
  const failed=new IntelligenceConnector(config,{fetch:fetcher,now:()=>now});
  const good=new IntelligenceConnector({...config,id:'rss:good',kind:'rss',target:'https://example.com/feed',feed:{name:'Example',url:'https://example.com/feed'}},{now:()=>now,readRss:async()=>[article]});
  const social=new IntelligenceConnector({...config,id:'x:test',kind:'x'},{fetch:fetcher});
  const result=await syncIntelligenceConnectors([failed,good,social],new AbortController().signal);
  assert.deepEqual(result.map(row=>row.status.state),['error','ready','authorization_required']); assert.equal(calls,1); assert.equal(result[2]?.status.canPublish,false);
 });
 it('aborts obsolete refreshes rather than retaining their late response', async () => {
  const controller=new AbortController();
  const connector=new IntelligenceConnector(config,{fetch:async()=>{controller.abort();return Response.json([release]);}});
  await assert.rejects(connector.sync(controller.signal)); assert.equal(connector.getStatus().lastSync,null);
 });
});
describe('Draft publishing policy', () => {
 const event=()=>buildIntelligenceEvents([article],defaultPersonalNewsPreferences(),now)[0]!;
 const authorization={accountId:'account',platform:'x' as const,connected:true,canPublish:true,autoPublish:true};
 it('keeps each source date, labels unconfirmed material, and bounds X text',()=>{
  const story=event(); story.articles.push({...article,link:'https://example.com/older',source:'Other',pubDate:new Date(now-3600000)});
  const draft=prepareIntelligenceDraft(story,'x','ar',now);
  assert.equal(draft.sources[1]?.publishedAt,now-3600000); assert.ok([...draft.text].length<=280); assert.equal(draft.status,'draft');
  story.verification='unconfirmed'; assert.match(prepareIntelligenceDraft(story,'facebook','en',now).text,/Unconfirmed/);
 });
 it('requires actual publishing authorization, verified recent context and no existing receipt',()=>{
  const draft=prepareIntelligenceDraft(event(),'x','en',now);
  assert.equal(intelligencePublishBlocker(draft,{...authorization,autoPublish:false},[],now),'authorization_required');
  assert.equal(intelligencePublishBlocker({...draft,verification:'unconfirmed'},authorization,[],now),'unconfirmed');
  assert.equal(intelligencePublishBlocker({...draft,eventUpdatedAt:0},authorization,[],now),'stale_context');
  assert.equal(intelligencePublishBlocker({...draft,text:'x'.repeat(281)},authorization,[],now),'platform_length');
  assert.equal(intelligencePublishBlocker(draft,authorization,[{draftId:draft.id,eventId:draft.eventId,platform:'x',accountId:'account',postId:'already',publishedAt:now}],now),'duplicate');
  assert.equal(intelligencePublishBlocker(draft,authorization,[],now),null);
 });
});
