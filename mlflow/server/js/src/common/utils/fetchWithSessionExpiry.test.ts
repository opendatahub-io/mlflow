/* eslint-disable @databricks/no-mock-location */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const RELOAD_GUARD_KEY = 'mlflow.session-expiry.reload-at';
const originalLocation = window.location;
const waitForAsyncWork = () => new Promise((resolve) => setTimeout(resolve, 0));

const createOpaqueRedirectResponse = (): Response => {
  const response = new Response(null);
  Object.defineProperty(response, 'type', { value: 'opaqueredirect' });
  return response;
};

describe('fetchWithSessionExpiry', () => {
  let originalFetch: typeof window.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let reloadMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    originalFetch = window.fetch;
    fetchMock = jest.fn<typeof fetch>();
    window.fetch = fetchMock;
    reloadMock = jest.fn();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: originalLocation.href, origin: originalLocation.origin, reload: reloadMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    window.fetch = originalFetch;
    window.sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  const loadTransport = async () => {
    const transport = await import('./fetchWithSessionExpiry');
    return transport;
  };

  it('uses native fetch unchanged until standalone session handling is enabled', async () => {
    const response = new Response(null, { status: 401 });
    fetchMock.mockResolvedValue(response);
    const { fetchWithSessionExpiry } = await loadTransport();

    await expect(fetchWithSessionExpiry('/ajax-api/3.0/mlflow/datasets/search')).resolves.toBe(response);

    expect(fetchMock).toHaveBeenCalledWith('/ajax-api/3.0/mlflow/datasets/search');
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('marks protected API calls as JSON requests and handles redirects manually', async () => {
    const response = new Response(null, { status: 200 });
    fetchMock.mockResolvedValue(response);
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();

    await expect(
      fetchWithSessionExpiry('/prefix/ajax-api/3.0/mlflow/datasets/search', {
        method: 'POST',
        headers: { 'X-Test': 'test-value' },
      }),
    ).resolves.toBe(response);

    const requestInit = fetchMock.mock.calls[0][1];
    const requestHeaders = new Headers(requestInit?.headers);
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.redirect).toBe('manual');
    expect(requestHeaders.get('Accept')).toBe('application/json');
    expect(requestHeaders.get('X-Test')).toBe('test-value');
  });

  it('preserves explicit headers from a Request object', async () => {
    const response = new Response(null, { status: 200 });
    fetchMock.mockResolvedValue(response);
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    const request = new Request(new URL('/ajax-api/3.0/mlflow/traces/search', window.location.href), {
      headers: { Accept: 'application/octet-stream', 'X-Test': 'request-value' },
    });
    enableSessionExpiryHandling();

    await fetchWithSessionExpiry(request);

    const requestHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(requestHeaders.get('Accept')).toBe('application/octet-stream');
    expect(requestHeaders.get('X-Test')).toBe('request-value');
  });

  it('reloads and suspends the caller on a 401 response', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();
    let settled = false;

    void fetchWithSessionExpiry('/ajax-api/3.0/mlflow/datasets/search').then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await waitForAsyncWork();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    expect(window.sessionStorage.getItem(RELOAD_GUARD_KEY)).not.toBeNull();
  });

  it('reloads on an OAuth redirect from an older proxy', async () => {
    fetchMock.mockResolvedValue(createOpaqueRedirectResponse());
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();

    void fetchWithSessionExpiry('/ajax-api/3.0/mlflow/datasets/search');
    await waitForAsyncWork();

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('reloads when an expired session prevents a lazy-loaded chunk from loading', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const { enableSessionExpiryHandling, handleChunkLoadError } = await loadTransport();
    enableSessionExpiryHandling();
    const error = Object.assign(new Error('Loading chunk 123 failed.'), { name: 'ChunkLoadError' });

    await handleChunkLoadError(error);

    const requestInit = fetchMock.mock.calls[0][1];
    const requestHeaders = new Headers(requestInit?.headers);
    expect(fetchMock).toHaveBeenCalledWith('ajax-api/3.0/mlflow/server-info', expect.any(Object));
    expect(requestInit?.redirect).toBe('manual');
    expect(requestHeaders.get('Accept')).toBe('application/json');
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the normal error handling when a lazy chunk fails with a valid session', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const { enableSessionExpiryHandling, handleChunkLoadError } = await loadTransport();
    enableSessionExpiryHandling();
    const error = Object.assign(new Error('Loading chunk 123 failed.'), { name: 'ChunkLoadError' });

    await handleChunkLoadError(error);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('does not probe the session for an unrelated application error', async () => {
    const { enableSessionExpiryHandling, handleChunkLoadError } = await loadTransport();
    enableSessionExpiryHandling();

    await handleChunkLoadError(new Error('Rendering failed'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it.each([200, 403])('returns a same-origin %i response without reloading', async (status) => {
    const response = new Response(null, { status });
    fetchMock.mockResolvedValue(response);
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();

    await expect(fetchWithSessionExpiry('/ajax-api/3.0/mlflow/datasets/search')).resolves.toBe(response);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('preserves an ordinary network failure without probing or reloading', async () => {
    const error = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(error);
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();

    await expect(fetchWithSessionExpiry('/ajax-api/2.0/mlflow/registered-models/search')).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('does not alter cross-origin requests', async () => {
    const response = new Response(null, { status: 401 });
    fetchMock.mockResolvedValue(response);
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();

    await expect(fetchWithSessionExpiry('https://example.com/api')).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/api');
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('does not alter same-origin requests outside the protected JSON API', async () => {
    const response = new Response(null, { status: 401 });
    fetchMock.mockResolvedValue(response);
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();

    await expect(fetchWithSessionExpiry('/artifacts/download')).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith('/artifacts/download');
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('does not reload repeatedly when a recent reload attempt is recorded', async () => {
    const response = new Response(null, { status: 401 });
    fetchMock.mockResolvedValue(response);
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();

    await expect(fetchWithSessionExpiry('/ajax-api/3.0/mlflow/datasets/search')).resolves.toBe(response);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('allows a new reload when the previous attempt is stale', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now() - 61_000));
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();

    void fetchWithSessionExpiry('/ajax-api/3.0/mlflow/datasets/search');
    await waitForAsyncWork();

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('ignores an invalid reload timestamp far in the future', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now() + 3_600_000));
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();

    void fetchWithSessionExpiry('/ajax-api/3.0/mlflow/datasets/search');
    await waitForAsyncWork();

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('clears the reload guard after a successful server-info response', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();

    await fetchWithSessionExpiry('/ajax-api/3.0/mlflow/server-info');

    expect(window.sessionStorage.getItem(RELOAD_GUARD_KEY)).toBeNull();
  });

  it('returns the original response if the browser blocks reloading', async () => {
    const response = new Response(null, { status: 401 });
    fetchMock.mockResolvedValue(response);
    reloadMock.mockImplementation(() => {
      throw new DOMException('Reload blocked', 'SecurityError');
    });
    const { enableSessionExpiryHandling, fetchWithSessionExpiry } = await loadTransport();
    enableSessionExpiryHandling();

    await expect(fetchWithSessionExpiry('/ajax-api/3.0/mlflow/datasets/search')).resolves.toBe(response);
    expect(window.sessionStorage.getItem(RELOAD_GUARD_KEY)).toBeNull();
  });
});
