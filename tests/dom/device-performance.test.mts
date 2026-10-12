import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDevicePerformanceMode, getEffectivePerformanceMode, initializeDevicePerformance, setDevicePerformanceMode, DEVICE_PERFORMANCE_STORAGE_KEY } from '@/config/device-performance';
import { resolveGlobePixelRatio, resolvePerformanceProfile } from '@/services/globe-render-settings';
beforeEach(() => { localStorage.clear(); setDevicePerformanceMode('auto'); });
afterEach(() => { vi.unstubAllGlobals(); });
it('applies mode changes, persists selection and caps optional globe rendering', () => {
  const cleanup = initializeDevicePerformance();
  expect(setDevicePerformanceMode('economy')).toBe(true);
  expect(document.documentElement.dataset.performanceMode).toBe('economy');
  expect(resolveGlobePixelRatio('1.5')).toBe(1);
  expect(resolvePerformanceProfile('1.5').disableDashAnimations).toBe(true);
  setDevicePerformanceMode('full'); expect(getEffectivePerformanceMode()).toBe('full');
  localStorage.setItem(DEVICE_PERFORMANCE_STORAGE_KEY, 'economy');
  window.dispatchEvent(new StorageEvent('storage', { key: DEVICE_PERFORMANCE_STORAGE_KEY }));
  expect(getDevicePerformanceMode()).toBe('economy'); expect(document.documentElement.dataset.performanceMode).toBe('economy');
  cleanup();
});
it('reports failed writes while keeping the selected mode in this document', () => {
  const backing = localStorage;
  vi.stubGlobal('localStorage', { getItem: (key: string) => backing.getItem(key), setItem: () => { throw new Error('quota'); } });
  expect(setDevicePerformanceMode('economy')).toBe(false); expect(getDevicePerformanceMode()).toBe('economy');
  backing.setItem(DEVICE_PERFORMANCE_STORAGE_KEY, 'full'); expect(getDevicePerformanceMode()).toBe('full');
});
