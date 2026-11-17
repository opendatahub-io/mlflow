import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { resolveEffectiveContrastMode, syncStandaloneContrastMode } from './standaloneContrastMode';

const CONTRAST_MODE_STORAGE_KEY = 'odh.dashboard.ui.contrastMode';

const mockMatchMedia = (matching: string[]) => {
  window.matchMedia = jest.fn((query: string) => ({
    matches: matching.includes(query),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
};

const contrastClasses = () =>
  ['pf-v6-theme-glass', 'pf-v6-theme-high-contrast'].filter((name) =>
    document.documentElement.classList.contains(name),
  );

describe('resolveEffectiveContrastMode', () => {
  it.each([
    ['glass', false, false, 'glass'],
    ['default', false, false, 'default'],
    ['high-contrast', false, false, 'high-contrast'],
    ['glass', true, true, 'glass'],
    ['default', true, false, 'default'],
    [null, false, false, 'glass'],
    ['system', false, false, 'glass'],
    ['system', false, true, 'default'],
    ['system', true, false, 'high-contrast'],
    ['system', true, true, 'high-contrast'],
    ['unexpected', false, false, 'glass'],
  ])('resolves %p (more contrast: %p, reduced transparency: %p) to %p', (stored, moreContrast, reduced, expected) => {
    expect(resolveEffectiveContrastMode(stored, moreContrast, reduced)).toBe(expected);
  });
});

describe('syncStandaloneContrastMode', () => {
  let cleanup: () => void = () => {};

  beforeEach(() => {
    mockMatchMedia([]);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.className = '';
  });

  it('applies glass when the dashboard has stored no preference', () => {
    cleanup = syncStandaloneContrastMode();

    expect(contrastClasses()).toEqual(['pf-v6-theme-glass']);
  });

  it('applies the preference stored by the dashboard', () => {
    window.localStorage.setItem(CONTRAST_MODE_STORAGE_KEY, JSON.stringify('high-contrast'));

    cleanup = syncStandaloneContrastMode();

    expect(contrastClasses()).toEqual(['pf-v6-theme-high-contrast']);
  });

  it('follows the OS when the preference is system', () => {
    window.localStorage.setItem(CONTRAST_MODE_STORAGE_KEY, JSON.stringify('system'));
    mockMatchMedia(['(prefers-reduced-transparency: reduce)']);

    cleanup = syncStandaloneContrastMode();

    expect(contrastClasses()).toEqual([]);
  });

  it('keeps other classes on the document element', () => {
    document.documentElement.className = 'pf-shell-root pf-v6-theme-felt pf-v6-theme-dark';
    window.localStorage.setItem(CONTRAST_MODE_STORAGE_KEY, JSON.stringify('default'));

    cleanup = syncStandaloneContrastMode();

    expect(document.documentElement.className).toBe('pf-shell-root pf-v6-theme-felt pf-v6-theme-dark');
  });

  it('re-applies when the preference changes in another tab', () => {
    cleanup = syncStandaloneContrastMode();

    window.localStorage.setItem(CONTRAST_MODE_STORAGE_KEY, JSON.stringify('default'));
    window.dispatchEvent(new StorageEvent('storage', { key: CONTRAST_MODE_STORAGE_KEY }));

    expect(contrastClasses()).toEqual([]);
  });

  it('stops following changes after cleanup', () => {
    syncStandaloneContrastMode()();

    window.localStorage.setItem(CONTRAST_MODE_STORAGE_KEY, JSON.stringify('default'));
    window.dispatchEvent(new StorageEvent('storage', { key: CONTRAST_MODE_STORAGE_KEY }));

    expect(contrastClasses()).toEqual(['pf-v6-theme-glass']);
  });
});
