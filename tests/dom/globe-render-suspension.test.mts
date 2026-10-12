import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapContainer } from '@/components/MapContainer';
import { GlobeMap } from '@/components/GlobeMap';
vi.mock('globe.gl', () => ({ default: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('Globe resource suspension', () => {
  it('forwards the container visibility gate to the globe', () => {
    const map = Object.create(MapContainer.prototype);
    map.useGlobe = true; map.useDeckGL = false; map.globeMap = { setRenderPaused: vi.fn() };
    map.setRenderPaused(true); expect(map.globeMap.setRenderPaused).toHaveBeenCalledWith(true);
    map.setRenderPaused(false); expect(map.globeMap.setRenderPaused).toHaveBeenLastCalledWith(false);
  });
  it('resumes after a hidden tab without clearing a separate panel pause', () => {
    vi.useFakeTimers();
    const map = Object.create(GlobeMap.prototype);
    map.renderPaused = false; map.destroyed = false; map.isGlobeAnimating = true;
    map.globe = { pauseAnimation: vi.fn(), resumeAnimation: vi.fn() };
    map.setupVisibilityHandler();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(map.globe.pauseAnimation).toHaveBeenCalledOnce(); expect(map.renderPaused).toBe(false);
    hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
    expect(map.globe.resumeAnimation).toHaveBeenCalledOnce();
    map.renderPaused = true; document.dispatchEvent(new Event('visibilitychange'));
    expect(map.globe.resumeAnimation).toHaveBeenCalledOnce();
    document.removeEventListener('visibilitychange', map.visibilityHandler);
  });
  it('stops both globe and decorative RAF work and cannot wake while paused', () => {
    vi.useFakeTimers(); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 123)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const map = Object.create(GlobeMap.prototype);
    map.renderPaused = false; map.destroyed = false; map.isGlobeAnimating = true;
    map.globe = { pauseAnimation: vi.fn(), resumeAnimation: vi.fn() }; map.extrasAnimFrameId = 123;
    map.controls = { autoRotate: true, enableDamping: true }; map.flushMarkers = vi.fn();
    map.setRenderPaused(true); expect(map.globe.pauseAnimation).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(123); expect(map.extrasAnimFrameId).toBeNull();
    map.wakeGlobe(); expect(map.globe.resumeAnimation).not.toHaveBeenCalled();
    map.setRenderPaused(false); expect(map.globe.resumeAnimation).toHaveBeenCalledOnce();
    expect(map.controls.autoRotate).toBe(true);
  });
});
