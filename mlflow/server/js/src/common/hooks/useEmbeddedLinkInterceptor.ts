import { useEffect } from 'react';
import { isEmbeddedCheck } from '../utils/embedUtils';

/**
 * Build parent URL from MLflow hash path.
 *
 * Derives the parent's base path by comparing:
 * - Parent's current pathname (e.g., "/dashboard/mlflow/experiments/1")
 * - MLflow's current hash path (e.g., "/experiments/1")
 *
 * The base path is the parent pathname minus the current hash path suffix.
 *
 * @param newHashPath - The target MLflow hash path (e.g., "/experiments/2?workspace=xxx")
 * @returns Parent URL or null if cross-origin or cannot derive base path
 */
const buildParentUrl = (newHashPath: string): string | null => {
  try {
    const parent = window.top?.location;
    if (!parent) return null;

    // Get current MLflow hash path (without query params for comparison)
    const currentHash = window.location.hash?.slice(1) || '';
    const currentHashPath = currentHash.split('?')[0];

    // Derive base path by removing current hash path from parent pathname
    const parentPathname = parent.pathname;
    if (currentHashPath && parentPathname.endsWith(currentHashPath)) {
      const basePath = parentPathname.slice(0, -currentHashPath.length);
      return `${parent.origin}${basePath}${newHashPath}`;
    }

    // Fallback: can't derive base path
    return null;
  } catch {
    // Cross-origin iframe - cannot access window.top.location
    return null;
  }
};

/**
 * Hook to intercept link clicks when MLflow is embedded in an iframe.
 *
 * - target="_blank" links: Navigate within iframe instead of opening new tab
 * - Ctrl/Cmd+click: Open parent URL in new tab (falls back to in-iframe navigation)
 * - External links: Not intercepted
 */
export const useEmbeddedLinkInterceptor = () => {
  const isEmbedded = isEmbeddedCheck();

  useEffect(() => {
    if (!isEmbedded) return;

    const handleClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest('a');
      if (!link?.href) return;

      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin) return;

      const hashPath = url.hash?.slice(1);
      if (!hashPath) return;

      const hasBlankTarget = link.target === '_blank';
      const wantsNewTab = event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;

      if (hasBlankTarget || wantsNewTab) {
        event.preventDefault();
        event.stopPropagation();

        if (wantsNewTab) {
          // Cmd+click: Try to open parent URL in new tab
          const parentUrl = buildParentUrl(hashPath);
          if (parentUrl) {
            window.open(parentUrl, '_blank');
          } else {
            // Fallback: navigate within iframe
            window.location.hash = hashPath;
          }
        } else {
          // target="_blank" without modifier: Navigate within iframe
          window.location.hash = hashPath;
        }
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isEmbedded]);

  return isEmbedded;
};
