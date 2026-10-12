import assert from 'node:assert/strict';
import { it } from 'node:test';
import { normalizeDevicePerformanceMode, resolveDevicePerformanceMode } from '../src/config/device-performance.ts';
it('resolves approximate low-capacity hints without claiming a measured device budget', () => {
  for (const hints of [{ hardwareConcurrency: 2 }, { deviceMemory: 4 }, { saveData: true }, { reducedMotion: true }]) assert.equal(resolveDevicePerformanceMode('auto', hints), 'economy');
  for (const hints of [{}, { hardwareConcurrency: 0, deviceMemory: NaN }, { hardwareConcurrency: 8, deviceMemory: 8 }]) assert.equal(resolveDevicePerformanceMode('auto', hints), 'full');
  assert.equal(resolveDevicePerformanceMode('full', { deviceMemory: 2, saveData: true }), 'full');
  assert.equal(resolveDevicePerformanceMode('economy', { deviceMemory: 8 }), 'economy');
  assert.equal(normalizeDevicePerformanceMode('invalid'), 'auto');
});
