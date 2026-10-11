import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='win32' || !['x64','arm64'].includes(process.arch))throw new Error('This packaging command targets Windows x64/arm64. Use the original platform packager elsewhere.');
const version=(process.env.GBOHEME_NODE_VERSION || process.version).replace(/^v/,'');
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid Node release version');
const destination=join(root,'src-tauri','sidecar','node');const executable=join(destination,'node.exe');const licensePath=join(destination,'LICENSE');
const expectedName=`win-${process.arch}/node.exe`;
const base=`https://nodejs.org/dist/v${version}/`;
mkdirSync(destination,{recursive:true});
function download(url, name) {
 const temporary=join(destination, `.gboheme-${name}.download`);
 const env={...process.env,GBOHEME_DOWNLOAD_URL:url,GBOHEME_DOWNLOAD_PATH:temporary};delete env.PSModulePath;
 // Use Windows' HTTP/proxy configuration instead of assuming Node's direct
 // network route is available. URL/path are data, never interpolated shell code.
 try {
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing -Uri $env:GBOHEME_DOWNLOAD_URL -OutFile $env:GBOHEME_DOWNLOAD_PATH -TimeoutSec 60"],{env,encoding:'utf8',timeout:70000,windowsHide:true});
  if(result.status!==0)throw new Error(`Official Node ${name} download failed`);
  return readFileSync(temporary);
 } finally {rmSync(temporary,{force:true});}
}
const sums=download(base+'SHASUMS256.txt','checksums').toString('utf8');
const expected=sums.split(/\r?\n/).map(line=>line.trim().split(/\s+/)).find(row=>row[1]===expectedName)?.[0];
if(!expected || !/^[a-f0-9]{64}$/.test(expected))throw new Error('Official Node SHA256 entry missing');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(existsSync(executable) && existsSync(licensePath) && hash(readFileSync(executable))===expected){console.log('Verified bundled Node v'+version);process.exit(0);}
// Reuse the installed executable only if it is byte-for-byte the official
// release. This also works on networks that restrict large binary downloads.
const installed=readFileSync(process.execPath);
const bytes=hash(installed)===expected ? installed : download(base+expectedName,'runtime');if(bytes.length>100*1024*1024 || hash(bytes)!==expected)throw new Error('Node runtime checksum/size mismatch');
const license=download(`https://raw.githubusercontent.com/nodejs/node/v${version}/LICENSE`,'license').toString('utf8');if(!license.includes('Permission is hereby granted'))throw new Error('Official Node license missing');
mkdirSync(destination,{recursive:true});const temporary=join(destination,'gboheme-node.download.exe');
try { writeFileSync(temporary,bytes);const check=spawnSync(temporary,['--version'],{encoding:'utf8',windowsHide:true,timeout:15000});if(check.status!==0 || check.stdout.trim()!==`v${version}`)throw new Error('Downloaded runtime version check failed');renameSync(temporary,executable);writeFileSync(licensePath,license); }
finally {rmSync(temporary,{force:true});}
console.log(`Bundled official Node v${version} with SHA256 verification and license`);
