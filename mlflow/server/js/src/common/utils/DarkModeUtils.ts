const databricksDarkModePrefLocalStorageKey = 'databricks-dark-mode-pref';
const darkModePrefLocalStorageKey = '_mlflow_dark_mode_toggle_enabled';

// Use the system preference as a default.
const getSystemDarkModePref = () => window.matchMedia('(prefers-color-scheme: dark)').matches || false;

const getDarkModePrefFromLocalStorage = (): boolean | null => {
  const darkModePref = window.localStorage.getItem(darkModePrefLocalStorageKey);
  if (darkModePref !== null) {
    return darkModePref === 'true';
  }

  return null;
};

export const getCurrentDarkModePreference = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const darkModePref = getDarkModePrefFromLocalStorage();
    return darkModePref ?? getSystemDarkModePref();
  } catch {
    // no-op: localStorage might be unavailable (e.g., private browsing)
    return getSystemDarkModePref();
  }
};

const listeners = new Set<(isDarkTheme: boolean) => void>();
let isStorageListenerRegistered = false;
let cachedIsDarkTheme: boolean = getCurrentDarkModePreference();

const notifyListeners = (value: boolean) => {
  cachedIsDarkTheme = value;
  listeners.forEach((listener) => listener(value));
};

const ensureStorageListener = () => {
  if (typeof window === 'undefined' || isStorageListenerRegistered) {
    return;
  }
  isStorageListenerRegistered = true;

  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.storageArea !== window.localStorage) {
      return;
    }

    // `null` key means localStorage was cleared; treat it as potentially affecting theme.
    const relevantKey = e.key === null || e.key === darkModePrefLocalStorageKey;
    if (!relevantKey) {
      return;
    }

    const nextValue = getCurrentDarkModePreference();
    if (nextValue !== cachedIsDarkTheme) {
      notifyListeners(nextValue);
    }
  });
};

export const setDarkModePreference = (isDarkTheme: boolean) => {
  cachedIsDarkTheme = isDarkTheme;

  if (typeof window !== 'undefined') {
    try {
      // Persist the user's preference in local storage.
      const mlflowPrefValue = isDarkTheme ? 'true' : 'false';
      if (window.localStorage.getItem(darkModePrefLocalStorageKey) !== mlflowPrefValue) {
        window.localStorage.setItem(darkModePrefLocalStorageKey, mlflowPrefValue);
      }

      const databricksPrefValue = isDarkTheme ? 'dark' : 'light';
      if (window.localStorage.getItem(databricksDarkModePrefLocalStorageKey) !== databricksPrefValue) {
        window.localStorage.setItem(databricksDarkModePrefLocalStorageKey, databricksPrefValue);
      }
    } catch {
      // no-op: localStorage might be unavailable (e.g., private browsing)
    }
  }

  notifyListeners(isDarkTheme);
};

export const subscribeToDarkModeChanges = (listener: (isDarkTheme: boolean) => void) => {
  ensureStorageListener();
  listeners.add(listener);
  listener(cachedIsDarkTheme);
  return () => {
    listeners.delete(listener);
  };
};
