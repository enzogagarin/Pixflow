import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PREFS,
  STORAGE_KEY,
  loadPrefs,
  savePrefs,
  type InspectorPrefs,
} from '../src/state/inspector-prefs';

const memStore = new Map<string, string>();
beforeEach(() => {
  memStore.clear();
  globalThis.localStorage = {
    getItem: (k: string) => memStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memStore.set(k, v),
    removeItem: (k: string) => void memStore.delete(k),
    clear: () => memStore.clear(),
    length: 0,
    key: () => null,
  } as Storage;
});

describe('loadPrefs', () => {
  it('returns DEFAULT_PREFS when localStorage has nothing', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('returns DEFAULT_PREFS (and does not throw) when stored JSON is malformed', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('returns DEFAULT_PREFS when stored shape is missing required fields', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ unrelated: true }));
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('round-trips a valid prefs object', () => {
    const custom: InspectorPrefs = { openSections: ['geometry'] };
    savePrefs(custom);
    expect(loadPrefs()).toEqual(custom);
  });

  it('accepts detail and overlay as valid section ids', () => {
    const custom: InspectorPrefs = {
      openSections: ['geometry', 'color', 'detail', 'overlay'],
    };
    savePrefs(custom);
    expect(loadPrefs()).toEqual(custom);
  });

  it('filters out unknown section ids while keeping known ones', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ openSections: ['geometry', 'unknown', 'detail'] }),
    );
    expect(loadPrefs()).toEqual({ openSections: ['geometry', 'detail'] });
  });

  it('default has both Geometry and Color open', () => {
    expect(DEFAULT_PREFS.openSections).toEqual(['geometry', 'color']);
  });
});

describe('savePrefs', () => {
  it('writes JSON under STORAGE_KEY', () => {
    savePrefs({ openSections: [] });
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ openSections: [] });
  });
});
