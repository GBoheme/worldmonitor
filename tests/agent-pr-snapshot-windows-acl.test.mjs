import assert from 'node:assert/strict';
import { it } from 'node:test';
import { assertPrivateWindowsAcl } from '../scripts/agent-pr-snapshot.mjs';
it('Windows snapshot privacy permits only the owner and trusted system administrators',()=>{
 const acl={currentUser:'S-1-5-21-1000',owner:'S-1-5-21-1000',allowSids:['S-1-5-21-1000','S-1-5-18','S-1-5-32-544']};
 assert.doesNotThrow(()=>assertPrivateWindowsAcl(acl));
 for(const sid of ['S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-21-2000']) assert.throws(()=>assertPrivateWindowsAcl({...acl,allowSids:[...acl.allowSids,sid]}));
 assert.throws(()=>assertPrivateWindowsAcl({...acl,owner:'S-1-5-21-2000'})); assert.throws(()=>assertPrivateWindowsAcl({}));
});
