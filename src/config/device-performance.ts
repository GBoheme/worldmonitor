import { safeStorageGetChecked, safeStorageSetChecked } from '@/utils/safe-storage';

export type DevicePerformanceMode = 'auto' | 'economy' | 'full';
export type EffectivePerformanceMode = Exclude<DevicePerformanceMode, 'auto'>;
export interface DevicePerformanceSignals {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  reducedMotion?: boolean;
  saveData?: boolean;
}
export const DEVICE_PERFORMANCE_STORAGE_KEY = 'wm-device-performance';
export const DEVICE_PERFORMANCE_CHANGED_EVENT = 'wm-device-performance-changed';
export const DEVICE_PERFORMANCE_MODES = ['auto', 'economy', 'full'] as const;
let sessionChoice: { base: string | null; mode: DevicePerformanceMode } | null = null;

export function normalizeDevicePerformanceMode(value: unknown): DevicePerformanceMode {
  return value === 'economy' || value === 'full' ? value : 'auto';
}

/** Browser hints are coarse estimates. Unknown capacity preserves the full path. */
export function resolveDevicePerformanceMode(mode: DevicePerformanceMode, signals: DevicePerformanceSignals): EffectivePerformanceMode {
  if (mode !== 'auto') return mode;
  const low = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 4;
  return signals.saveData || signals.reducedMotion || low(signals.hardwareConcurrency) || low(signals.deviceMemory) ? 'economy' : 'full';
}

export function readDevicePerformanceSignals(): DevicePerformanceSignals {
  try {
    const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    return { hardwareConcurrency: nav?.hardwareConcurrency, deviceMemory: nav?.deviceMemory,
      saveData: nav?.connection?.saveData === true,
      reducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true };
  } catch { return {}; }
}
export function getDevicePerformanceMode(): DevicePerformanceMode {
  const stored = safeStorageGetChecked(DEVICE_PERFORMANCE_STORAGE_KEY);
  if (sessionChoice && (!stored.ok || stored.value === sessionChoice.base)) return sessionChoice.mode;
  sessionChoice = null;
  return normalizeDevicePerformanceMode(stored.value);
}
export function getEffectivePerformanceMode(): EffectivePerformanceMode {
  return resolveDevicePerformanceMode(getDevicePerformanceMode(), readDevicePerformanceSignals());
}
function applyDevicePerformance(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const effective = getEffectivePerformanceMode();
  document.documentElement.dataset.performanceMode = effective;
  window.dispatchEvent(new CustomEvent(DEVICE_PERFORMANCE_CHANGED_EVENT, { detail: { effective } }));
}
/** Returns false when the preference only survives in this document. */
export function setDevicePerformanceMode(mode: DevicePerformanceMode): boolean {
  const safeMode = normalizeDevicePerformanceMode(mode);
  const before = safeStorageGetChecked(DEVICE_PERFORMANCE_STORAGE_KEY);
  safeStorageSetChecked(DEVICE_PERFORMANCE_STORAGE_KEY, safeMode);
  const after = safeStorageGetChecked(DEVICE_PERFORMANCE_STORAGE_KEY);
  const persisted = after.ok && after.value === safeMode;
  sessionChoice = persisted ? null : { base: before.value, mode: safeMode };
  applyDevicePerformance();
  return persisted;
}
export function subscribeDevicePerformanceChange(callback: () => void): () => void {
  window.addEventListener(DEVICE_PERFORMANCE_CHANGED_EVENT, callback);
  return () => window.removeEventListener(DEVICE_PERFORMANCE_CHANGED_EVENT, callback);
}

/** One document-wide observer; components subscribe through the shared event. */
export function initializeDevicePerformance(): () => void {
  const lifetime = new AbortController();
  const storage = (event: StorageEvent) => { if (event.key === DEVICE_PERFORMANCE_STORAGE_KEY || event.key === null) applyDevicePerformance(); };
  window.addEventListener('storage', storage, { signal: lifetime.signal });
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  media?.addEventListener('change', applyDevicePerformance, { signal: lifetime.signal });
  const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
  connection?.addEventListener('change', applyDevicePerformance, { signal: lifetime.signal });
  applyDevicePerformance();
  return () => lifetime.abort();
}
