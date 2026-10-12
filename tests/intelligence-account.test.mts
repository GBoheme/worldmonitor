import assert from 'node:assert/strict';
import { it } from 'node:test';
import { startIntelligenceAccountSync, type IntelligenceAccountDependencies } from '../src/services/intelligence-account.ts';
import type { AuthSession } from '../src/services/auth-state.ts';
function fixture(enabled=true) {
 const calls:string[]=[];let listener:(state:AuthSession)=>void=()=>{};
 const bridge:IntelligenceAccountDependencies={enabled:()=>enabled,initialize:async()=>{calls.push('initialize');},install:variant=>{calls.push('install:'+variant);},
  subscribe:callback=>{listener=callback;callback({user:null,isPending:false});return()=>{calls.push('unsubscribe');};},
  signIn:async id=>{calls.push('signIn:'+id);},signOut:()=>{calls.push('signOut');}};
 const emit=(id:string|null)=>listener({user:id?{id,name:'User',email:'',role:'free'}:null,isPending:false});
 return {calls,bridge,emit};
}
it('leaves the default offline/local mode independent of account initialization',async()=>{
 const f=fixture(false);await startIntelligenceAccountSync('full',new AbortController().signal,f.bridge);assert.deepEqual(f.calls,[]);
});
it('reuses account reconciliation only on transitions and cleans up the subscriber',async()=>{
 const f=fixture();const controller=new AbortController();const dispose=await startIntelligenceAccountSync('full',controller.signal,f.bridge);
 f.emit('A');f.emit('A');f.emit('B');f.emit(null);controller.abort();f.emit('C');dispose();
 assert.deepEqual(f.calls,['initialize','install:full','signIn:A','signIn:B','signOut','unsubscribe']);
});
it('does not install or subscribe after initialization completes for a destroyed workspace',async()=>{
 const f=fixture();const controller=new AbortController();f.bridge.initialize=async()=>{controller.abort();};
 await startIntelligenceAccountSync('full',controller.signal,f.bridge);assert.deepEqual(f.calls,[]);
});
