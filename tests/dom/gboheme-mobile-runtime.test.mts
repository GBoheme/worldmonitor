import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();});
describe('Android shared frontend routing',()=>{
 it('uses the authorized web API and never targets the desktop Node sidecar',async()=>{
  vi.resetModules();vi.stubEnv('VITE_GBOHEME_MOBILE','1');vi.stubEnv('VITE_DESKTOP_RUNTIME','1');vi.stubEnv('VITE_WS_API_URL','');
  const mobile=await import('@/services/desktop-runtime');
  expect(mobile.isGbohemeMobileRuntime()).toBe(true);expect(mobile.isDesktopRuntime()).toBe(false);expect(mobile.hasExplicitDesktopSignals()).toBe(false);
  const runtime=await import('@/services/runtime');expect(runtime.getConfiguredWebApiBaseUrl()).toBe('https://api.worldmonitor.app');
 });
 it('does not change the normal web runtime when the mobile build flag is absent',async()=>{
  vi.resetModules();vi.stubEnv('VITE_GBOHEME_MOBILE','');vi.stubEnv('VITE_DESKTOP_RUNTIME','1');
  const desktop=await import('@/services/desktop-runtime');expect(desktop.isGbohemeMobileRuntime()).toBe(false);expect(desktop.isDesktopRuntime()).toBe(true);
 });
});
