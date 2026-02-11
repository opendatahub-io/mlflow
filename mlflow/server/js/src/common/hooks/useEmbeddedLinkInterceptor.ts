import { useEffect } from 'react';
import { isIntegrated } from '../utils/embedUtils';

/**
 * Hook to intercept link clicks when MLflow runs in federated mode.
 *
 * Many MLflow components use target="_blank" on links (run links, model links,
 * metric links, etc.). In standalone mode these correctly open new tabs. In
 * federated mode (Module Federation inside ODH dashboard) we want same-origin
 * links to navigate in-place instead — opening a new tab would show the raw
 * MLflow standalone UI outside the dashboard shell.
 *
 * External links (different origin) still open in a new tab as expected.
 *
 * Ctrl/Cmd+click always opens in a new tab (standard browser behavior).
 */
export const useEmbeddedLinkInterceptor = () => {
  const isEmbedded = isIntegrated();

  useEffect(() => {
    if (!isEmbedded) return;

    const handleClick = (event: MouseEvent) => {
      // Only intercept clicks inside the MLflow federated wrapper.
      const mlflowWrapper = document.querySelector('.mlflow-federated');
      if (!mlflowWrapper || !mlflowWrapper.contains(event.target as Node)) return;

      const link = (event.target as Element).closest('a');
      if (!link?.href) return;

      const url = new URL(link.href, window.location.origin);

      // External links: let them open normally (new tab)
      if (url.origin !== window.location.origin) return;

      // Ctrl/Cmd/Shift+click or middle-click: let browser open new tab
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return;

      // Same-origin target="_blank" links: navigate in-place instead
      if (link.target === '_blank') {
        event.preventDefault();
        event.stopPropagation();

        // Use pushState + popstate so both the host's v7 router and
        // MLflow's v6 BrowserRouter detect the navigation.
        window.history.pushState({}, '', url.pathname + url.search + url.hash);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isEmbedded]);

  return isEmbedded;
};
