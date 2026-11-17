const CONTRAST_MODE_STORAGE_KEY = 'odh.dashboard.ui.contrastMode';
const GLASS_CLASS_NAME = 'pf-v6-theme-glass';
const HIGH_CONTRAST_CLASS_NAME = 'pf-v6-theme-high-contrast';
const PREFERS_MORE_CONTRAST_QUERY = '(prefers-contrast: more)';
const PREFERS_REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

export type EffectiveContrastMode = 'default' | 'glass' | 'high-contrast';

export const resolveEffectiveContrastMode = (
  storedMode: unknown,
  prefersMoreContrast: boolean,
  prefersReducedTransparency: boolean,
): EffectiveContrastMode => {
  if (storedMode === 'high-contrast' || storedMode === 'glass' || storedMode === 'default') {
    return storedMode;
  }
  if (prefersMoreContrast) {
    return 'high-contrast';
  }
  return prefersReducedTransparency ? 'default' : 'glass';
};

const readStoredContrastMode = (): unknown => {
  try {
    // eslint-disable-next-line @databricks/no-direct-storage -- synchronous cross-document theme sync
    const raw = window.localStorage.getItem(CONTRAST_MODE_STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
};

const matchesMediaQuery = (query: string): boolean => {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
};

const applyContrastMode = () => {
  const mode = resolveEffectiveContrastMode(
    readStoredContrastMode(),
    matchesMediaQuery(PREFERS_MORE_CONTRAST_QUERY),
    matchesMediaQuery(PREFERS_REDUCED_TRANSPARENCY_QUERY),
  );
  const { classList } = document.documentElement;
  classList.toggle(GLASS_CLASS_NAME, mode === 'glass');
  classList.toggle(HIGH_CONTRAST_CLASS_NAME, mode === 'high-contrast');
};

export const syncStandaloneContrastMode = (): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }
  applyContrastMode();

  const handleStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CONTRAST_MODE_STORAGE_KEY) {
      applyContrastMode();
    }
  };
  window.addEventListener('storage', handleStorage);

  const mediaQueries: MediaQueryList[] = [];
  try {
    mediaQueries.push(
      window.matchMedia(PREFERS_MORE_CONTRAST_QUERY),
      window.matchMedia(PREFERS_REDUCED_TRANSPARENCY_QUERY),
    );
  } catch {}
  mediaQueries.forEach((mediaQuery) => mediaQuery.addEventListener('change', applyContrastMode));

  return () => {
    window.removeEventListener('storage', handleStorage);
    mediaQueries.forEach((mediaQuery) => mediaQuery.removeEventListener('change', applyContrastMode));
  };
};
