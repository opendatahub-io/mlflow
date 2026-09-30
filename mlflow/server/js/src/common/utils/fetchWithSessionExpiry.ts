const SESSION_INFO_PATH = 'ajax-api/3.0/mlflow/server-info';
const AJAX_API_PATH_SEGMENT = 'ajax-api';
const GRAPHQL_PATH_SEGMENT = 'graphql';
const RELOAD_GUARD_KEY = 'mlflow.session-expiry.reload-at';
const RELOAD_GUARD_TTL_MS = 60_000;

const suspendedResponse = new Promise<Response>(() => {});

let enabled = false;
let sessionExpired = false;
let sessionProbe: Promise<void> | undefined;

const getRequestUrl = (input: RequestInfo | URL): URL | undefined => {
  try {
    const url = input instanceof Request ? input.url : input.toString();
    return new URL(url, window.location.href);
  } catch {
    return undefined;
  }
};

const isMlflowJsonApiPath = (pathname: string): boolean => {
  const pathSegments = pathname.split('/').filter(Boolean);
  return pathSegments.includes(AJAX_API_PATH_SEGMENT) || pathSegments[pathSegments.length - 1] === GRAPHQL_PATH_SEGMENT;
};

const prepareRequest = (input: RequestInfo | URL, init?: RequestInit): RequestInit => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  // kube-auth-proxy treats this as an AJAX request and returns 401 instead of starting an OAuth redirect.
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  return {
    ...init,
    headers,
    // If an older proxy still redirects, Fetch exposes it as an opaque redirect instead of following it cross-origin.
    redirect: 'manual',
  };
};

const getLastReloadAttempt = (): number | undefined => {
  try {
    // eslint-disable-next-line @databricks/no-direct-storage -- synchronous guard must survive a page reload
    const value = window.sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (value === null) return undefined;

    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : undefined;
  } catch {
    return undefined;
  }
};

const markReloadAttempt = (): void => {
  try {
    // eslint-disable-next-line @databricks/no-direct-storage -- guard must be saved before reloading
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // Reload still works when session storage is unavailable; only the cross-reload guard is lost.
  }
};

const clearReloadAttempt = (): void => {
  try {
    // eslint-disable-next-line @databricks/no-direct-storage -- this transport is outside React
    window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
};

const wasReloadRecentlyAttempted = (): boolean => {
  const timestamp = getLastReloadAttempt();
  return timestamp !== undefined && Math.abs(Date.now() - timestamp) < RELOAD_GUARD_TTL_MS;
};

const reloadForExpiredSession = (): boolean => {
  if (wasReloadRecentlyAttempted()) return false;

  sessionExpired = true;
  markReloadAttempt();
  try {
    window.location.reload();
    return true;
  } catch {
    sessionExpired = false;
    clearReloadAttempt();
    return false;
  }
};

/** Enables session-expiry handling for the standalone MLflow application. */
export const enableSessionExpiryHandling = (): void => {
  enabled = true;
};

const isChunkLoadError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;

  const { name, message } = error as { name?: unknown; message?: unknown };
  return (
    name === 'ChunkLoadError' || (typeof message === 'string' && /Loading (?:CSS )?chunk .+ failed/i.test(message))
  );
};

const probeSessionAfterChunkLoadError = async (): Promise<void> => {
  try {
    const response = await fetch(SESSION_INFO_PATH, prepareRequest(SESSION_INFO_PATH));
    if (response.status === 401 || response.type === 'opaqueredirect') {
      reloadForExpiredSession();
    } else if (response.ok) {
      clearReloadAttempt();
    }
  } catch {
    // A chunk can fail for ordinary network reasons. Preserve the normal error page when
    // the session probe cannot positively identify an expired session.
  } finally {
    sessionProbe = undefined;
  }
};

/** Checks whether a failed lazy-loaded chunk was caused by an expired standalone session. */
export const handleChunkLoadError = (error: unknown): Promise<void> => {
  if (!enabled || sessionExpired || !isChunkLoadError(error)) return Promise.resolve();

  sessionProbe ??= probeSessionAfterChunkLoadError();
  return sessionProbe;
};

/**
 * Fetches a protected MLflow JSON endpoint and reloads the standalone application when its OAuth session expires.
 * Network failures and authorization failures are returned unchanged.
 */
export const fetchWithSessionExpiry = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  fetchFn: typeof fetch = fetch,
): Promise<Response> => {
  if (!enabled) return init === undefined ? fetchFn(input) : fetchFn(input, init);
  if (sessionExpired) return suspendedResponse;

  const requestUrl = getRequestUrl(input);
  const isSameOrigin = requestUrl?.origin === window.location.origin;
  const isMlflowJsonApiRequest = Boolean(isSameOrigin && requestUrl && isMlflowJsonApiPath(requestUrl.pathname));

  if (!isMlflowJsonApiRequest) return init === undefined ? fetchFn(input) : fetchFn(input, init);

  const response = await fetchFn(input, prepareRequest(input, init));
  if (sessionExpired) return suspendedResponse;

  if (response.status === 401 || response.type === 'opaqueredirect') {
    return reloadForExpiredSession() ? suspendedResponse : response;
  }

  if (response.ok && requestUrl?.pathname.endsWith(SESSION_INFO_PATH)) {
    clearReloadAttempt();
  }
  return response;
};
