import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/plugin-opener',()=>({openUrl:vi.fn().mockResolvedValue(undefined)}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();vi.clearAllMocks();});
it('routes native Android source links to the official opener and rejects executable/credential URLs',async()=>{
 vi.stubEnv('VITE_GBOHEME_MOBILE','1');vi.stubEnv('VITE_DESKTOP_RUNTIME','');
 vi.stubGlobal('__TAURI_INTERNALS__',{});
 const navigation=await import('@/services/intelligence-navigation');const opener=await import('@tauri-apps/plugin-opener');
 expect(navigation.usesNativeIntelligenceLinks()).toBe(true);
 await expect(navigation.openIntelligenceSource('javascript:alert(1)')).rejects.toThrow('invalid_url');
 await expect(navigation.openIntelligenceSource('https://secret:password@example.com')).rejects.toThrow('invalid_url');
 expect(opener.openUrl).not.toHaveBeenCalled();
 await navigation.openIntelligenceSource('https://github.com/GBoheme/worldmonitor');
 expect(opener.openUrl).toHaveBeenCalledWith('https://github.com/GBoheme/worldmonitor');
});
it('keeps mobile frontend previews on normal browser link behavior',async()=>{
 vi.stubEnv('VITE_GBOHEME_MOBILE','1');vi.stubEnv('VITE_DESKTOP_RUNTIME','');
 const navigation=await import('@/services/intelligence-navigation');expect(navigation.usesNativeIntelligenceLinks()).toBe(false);
});
