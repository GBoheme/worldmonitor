import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const java=spawnSync('java',['-version'],{encoding:'utf8',windowsHide:true});
const sdk=process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const ndk=process.env.NDK_HOME;
const missing=[];
if(java.status!==0)missing.push('Java JDK (JAVA_HOME and java on PATH)');
if(!sdk || !existsSync(join(sdk,'platform-tools')))missing.push('Android SDK (ANDROID_HOME and platform-tools)');
if(!ndk || !existsSync(ndk))missing.push('Android NDK (NDK_HOME)');
if(missing.length){console.error('Android build is blocked: '+missing.join('; '));console.error('Setup: https://tauri.app/start/prerequisites/#android');process.exitCode=1;}
else console.log('Android Java/SDK/NDK paths available; the native build must still verify versions and compilation.');
