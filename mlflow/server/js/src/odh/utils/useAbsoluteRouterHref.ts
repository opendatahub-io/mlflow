import { useCallback, useContext } from 'react';
import { UNSAFE_NavigationContext } from '../../common/utils/RoutingUtils';
import { prefixRouteWithWorkspace } from '../../workspaces/utils/WorkspaceUtils';

type RouterPath = { pathname: string; search: string; hash: string };
type HrefNavigator = { createHref: (to: RouterPath) => string };

const splitRouterPath = (to: string): RouterPath => {
  let rest = to;
  let hash = '';
  let search = '';
  const hashIndex = rest.indexOf('#');
  if (hashIndex >= 0) {
    hash = rest.slice(hashIndex);
    rest = rest.slice(0, hashIndex);
  }
  const searchIndex = rest.indexOf('?');
  if (searchIndex >= 0) {
    search = rest.slice(searchIndex);
    rest = rest.slice(0, searchIndex);
  }
  return { pathname: rest || '/', search, hash };
};

/**
 * Turns a router-relative path (e.g. `/experiments/4/traces?q=x`) into an absolute URL that reopens
 * the same page in a new tab or another browser. It adds the active workspace, the router basename
 * (the federated BrowserRouter is mounted under a dashboard path) and the router's own href format
 * (`#/...` for the standalone HashRouter). This is what react-router's `useHref` does, but usable
 * for paths that are only known after render (click handlers, async share links).
 */
export const buildAbsoluteRouterHref = (
  to: string,
  basename: string | undefined,
  navigator: HrefNavigator | undefined,
  baseUrl: string = window.location.href,
): string => new URL(buildRouterHref(to, basename, navigator), baseUrl).toString();

/**
 * Same as `buildAbsoluteRouterHref` but returns the router href as-is (`#/...` for the HashRouter,
 * `/<basename>/...` for a BrowserRouter), which `window.open` resolves against the current page.
 */
export const buildRouterHref = (
  to: string,
  basename: string | undefined,
  navigator: HrefNavigator | undefined,
): string => {
  const path = splitRouterPath(prefixRouteWithWorkspace(to));
  if (basename && basename !== '/') {
    const trimmedBasename = basename.replace(/\/+$/, '');
    path.pathname = path.pathname === '/' ? trimmedBasename : `${trimmedBasename}${path.pathname}`;
  }
  return navigator ? navigator.createHref(path) : `${path.pathname}${path.search}${path.hash}`;
};

const useHrefNavigationContext = () => {
  // Null outside a router (e.g. isolated component tests); fall back to the plain path.
  const navigationContext = useContext(UNSAFE_NavigationContext) as
    | { basename?: string; navigator?: HrefNavigator }
    | null
    | undefined;
  return { basename: navigationContext?.basename, navigator: navigationContext?.navigator };
};

/**
 * Returns a function that builds an absolute, shareable URL for a router-relative path in both
 * standalone (HashRouter) and federated (BrowserRouter with basename) mode.
 */
export const useAbsoluteRouterHref = (): ((to: string) => string) => {
  const { basename, navigator } = useHrefNavigationContext();
  return useCallback((to: string) => buildAbsoluteRouterHref(to, basename, navigator), [basename, navigator]);
};

/**
 * Returns a function that builds the router href for a router-relative path, for links opened from the
 * current page (e.g. `window.open` on Cmd/Ctrl-click).
 */
export const useRouterHref = (): ((to: string) => string) => {
  const { basename, navigator } = useHrefNavigationContext();
  return useCallback((to: string) => buildRouterHref(to, basename, navigator), [basename, navigator]);
};
