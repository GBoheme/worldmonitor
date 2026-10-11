import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';
it('source attribution CLI actually executes its check on native paths',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/source-attribution.mjs',import.meta.url)),'--check'],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/source-attribution: \d+ active hosts/);
});
