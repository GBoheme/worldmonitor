import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSONAL_NEWS_STORAGE_KEY, getPersonalNewsPreferences, setPersonalNewsCategory } from '@/services/personal-news';

let sequence = 0;
beforeEach(() => { localStorage.clear(); localStorage.setItem(PERSONAL_NEWS_STORAGE_KEY, JSON.stringify({ sequence: ++sequence })); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Personal preferences persistence and recovery', () => {
  it('persists a toggle and re-reads an external account/tab update', () => {
    expect(setPersonalNewsCategory('ai_agents', false)).toBe(true);
    expect(getPersonalNewsPreferences().categories.ai_agents).toBe(false);
    localStorage.setItem(PERSONAL_NEWS_STORAGE_KEY, '{"categories":{"ai_agents":true}}');
    expect(getPersonalNewsPreferences().categories.ai_agents).toBe(true);
  });
  it('reports blocked writes honestly while keeping changes usable during the session', () => {
    const backing = localStorage;
    vi.stubGlobal('localStorage', { getItem: (key: string) => backing.getItem(key), setItem: () => { throw new Error('quota'); } });
    expect(setPersonalNewsCategory('ai_agents', false)).toBe(false);
    expect(getPersonalNewsPreferences().categories.ai_agents).toBe(false);
    expect(setPersonalNewsCategory('energy_oil', false)).toBe(false);
    expect(getPersonalNewsPreferences().categories.ai_agents).toBe(false);
    expect(getPersonalNewsPreferences().categories.energy_oil).toBe(false);
  });
  it('works when both reads and writes are unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(setPersonalNewsCategory('cybersecurity', false)).toBe(false);
    expect(getPersonalNewsPreferences().categories.cybersecurity).toBe(false);
  });
});
