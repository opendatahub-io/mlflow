import { getAgentPluginFixtureResponse } from './test-utils';

export const startAgentPluginDevStub = (): (() => void) => {
  if (process.env['NODE_ENV'] !== 'development' || process.env['REACT_APP_AGENT_PLUGINS_STUB'] !== 'true') {
    return () => {};
  }
  const originalFetch = window.fetch;
  const stubFetch: typeof window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input), window.location.href);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    if (url.origin !== window.location.origin || method !== 'GET') {
      return originalFetch.call(window, input, init);
    }
    const response = getAgentPluginFixtureResponse(url);
    if (!response) return originalFetch.call(window, input, init);
    if ((init?.signal ?? request?.signal)?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  window.fetch = stubFetch;
  return () => {
    if (window.fetch === stubFetch) window.fetch = originalFetch;
  };
};
