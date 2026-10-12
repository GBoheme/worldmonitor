import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ local: true, cloud: true, desktop: false, init: vi.fn(), terminate: vi.fn(), summary: vi.fn() }));
vi.mock('../../src/services/ai-flow-settings', () => ({ getAiFlowSettings: () => ({ browserModel: state.local, cloudLlm: state.cloud }) }));
vi.mock('../../src/services/runtime', () => ({ isDesktopRuntime: () => state.desktop }));
vi.mock('../../src/services/ml-worker', () => ({ mlWorker: { init: state.init, terminate: state.terminate } }));
vi.mock('../../src/services/summarization', () => ({ generateSummary: state.summary }));
import { summarizeIntelligenceEvent } from '../../src/services/intelligence-editor';
import type { IntelligenceEvent } from '../../src/services/intelligence-engine';
const event = { articles: [{ title: 'Official release', snippet: 'A detailed official source description with new information.' }] } as IntelligenceEvent;
beforeEach(() => { state.local = true; state.cloud = true; state.desktop = false; state.init.mockReset().mockResolvedValue(true); state.terminate.mockReset(); state.summary.mockReset().mockResolvedValue({ summary: 'Cloud or local result' }); });
it('starts the opted-in worker for an explicit English summary after deferred boot', async () => {
  await summarizeIntelligenceEvent(event, 'en');
  expect(state.init).toHaveBeenCalledOnce(); expect(state.summary).toHaveBeenCalledOnce();
});
it('honors local opt-out and never substitutes the English model for Arabic', async () => {
  state.local = false; await summarizeIntelligenceEvent(event, 'en');
  state.local = true; await summarizeIntelligenceEvent(event, 'ar');
  expect(state.init).not.toHaveBeenCalled();
  expect(state.summary).toHaveBeenLastCalledWith(expect.any(Array), undefined, undefined, 'ar', expect.objectContaining({ skipBrowserFallback: true }));
});
it('continues through the provider chain when the requested local worker fails', async () => {
  state.init.mockRejectedValue(new Error('Unsupported local worker'));
  await expect(summarizeIntelligenceEvent(event, 'en')).resolves.toEqual({ summary: 'Cloud or local result' });
});
it('honors both provider opt-outs instead of silently invoking the cloud', async () => {
  state.local = false; state.cloud = false;
  await summarizeIntelligenceEvent(event, 'en');
  expect(state.init).not.toHaveBeenCalled();
  expect(state.summary).toHaveBeenCalledWith(expect.any(Array), undefined, undefined, 'en', expect.objectContaining({ skipCloudProviders: true, skipBrowserFallback: true }));
});
it('rechecks an opt-out made while the worker was starting', async () => {
  state.init.mockImplementation(async () => { state.local = false; state.cloud = false; return true; });
  await summarizeIntelligenceEvent(event, 'en');
  expect(state.terminate).toHaveBeenCalledOnce();
  expect(state.summary).toHaveBeenCalledWith(expect.any(Array), undefined, undefined, 'en', expect.objectContaining({ skipCloudProviders: true, skipBrowserFallback: true }));
});
