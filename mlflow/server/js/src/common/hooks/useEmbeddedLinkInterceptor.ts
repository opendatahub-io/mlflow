import { useEffect } from 'react';
import { isIntegrated } from '../utils/embedUtils';

type ScopedLinkTarget = { link: HTMLAnchorElement; url: URL };
type RestrictedLinkPredicate = (link: HTMLAnchorElement, url: URL) => boolean;
type NavigateInPlacePredicate = (link: HTMLAnchorElement, url: URL) => boolean;

type EmbeddedLinkInterceptorOptions = {
  enabled?: boolean;
  isRestrictedLink?: RestrictedLinkPredicate;
  shouldNavigateInPlace?: NavigateInPlacePredicate;
};

const FEDERATED_WRAPPER_SELECTOR = '.mlflow-federated';
const FEDERATED_PORTAL_ROOT_SELECTOR = [
  'div[data-radix-popper-content-wrapper]',
  '.du-bois-light-modal-root',
  '.du-bois-dark-modal-root',
  '.du-bois-light-dropdown',
  '.du-bois-dark-dropdown',
].join(', ');

const EMBEDDED_LINK_GUARD_ATTR = 'data-mlflow-embedded-link-guard';
const ORIGINAL_TABINDEX_ATTR = 'data-mlflow-embedded-link-guard-original-tabindex';
const FEDERATED_PORTAL_CONTAINER_ATTR = 'data-mlflow-federated-portal-container';
const FEDERATED_OWNED_PORTAL_ROOT_ATTR = 'data-mlflow-federated-portal-root';
const FEDERATED_PORTAL_CONTAINER_SELECTOR = `[${FEDERATED_PORTAL_CONTAINER_ATTR}='true']`;
const OWNED_PORTAL_ROOT_SELECTOR = `[${FEDERATED_OWNED_PORTAL_ROOT_ATTR}='true']`;
const SCOPED_PORTAL_ROOT_SELECTOR = `${FEDERATED_PORTAL_CONTAINER_SELECTOR}, ${OWNED_PORTAL_ROOT_SELECTOR}`;
const KNOWN_FEDERATED_PORTAL_ROOT_SELECTOR = `${FEDERATED_PORTAL_ROOT_SELECTOR}, ${SCOPED_PORTAL_ROOT_SELECTOR}`;
const GUARDED_LINK_SELECTOR = `a[${EMBEDDED_LINK_GUARD_ATTR}='true']`;
const MLFLOW_OWNED_PORTAL_MARKER_SELECTOR = [
  "[data-component-id^='mlflow.']",
  "[data-component-id^='codegen_mlflow_']",
  "[data-component-id^='codegen_no_dynamic_mlflow_']",
].join(', ');

const getFederatedWrapper = () => document.querySelector(FEDERATED_WRAPPER_SELECTOR);

// Body-level popups and portals are outside the main MLflow wrapper, so we need
// to detect which of them are actually owned by MLflow before we guard links.
const isBodyPortalRoot = (element: Element | null): element is Element =>
  Boolean(element && element.parentElement === document.body);

const isExplicitFederatedPortalContainer = (element: Element | null) =>
  Boolean(element && element.matches(FEDERATED_PORTAL_CONTAINER_SELECTOR));

const isOwnedBodyPortalRoot = (element: Element | null) =>
  Boolean(isBodyPortalRoot(element) && element.matches(OWNED_PORTAL_ROOT_SELECTOR));

const isGenericBodyPortalRoot = (element: Element | null) =>
  Boolean(isBodyPortalRoot(element) && element.matches(FEDERATED_PORTAL_ROOT_SELECTOR));

const isKnownFederatedPortalRoot = (element: Element | null) =>
  Boolean(
    isExplicitFederatedPortalContainer(element) || isOwnedBodyPortalRoot(element) || isGenericBodyPortalRoot(element),
  );

const getClosestFederatedPortalRoot = (element: Element | null) => {
  if (!(element instanceof Element)) {
    return null;
  }

  let current: Element | null = element;
  while (current) {
    if (isKnownFederatedPortalRoot(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

const isFederatedPortalRoot = (element: Element | null) =>
  Boolean(isExplicitFederatedPortalContainer(element) || isOwnedBodyPortalRoot(element));

const syncOwnedPortalRoot = (element: Element) => {
  const portalRoot = getClosestFederatedPortalRoot(element);
  if (!portalRoot) {
    return;
  }

  if (isExplicitFederatedPortalContainer(portalRoot)) {
    return;
  }

  const isOwnedPortal =
    isGenericBodyPortalRoot(portalRoot) && portalRoot.querySelector(MLFLOW_OWNED_PORTAL_MARKER_SELECTOR) !== null;

  if (isOwnedPortal) {
    portalRoot.setAttribute(FEDERATED_OWNED_PORTAL_ROOT_ATTR, 'true');
  } else {
    portalRoot.removeAttribute(FEDERATED_OWNED_PORTAL_ROOT_ATTR);
  }
};

const collectPortalRootsToSync = (root: Document | Element) => {
  const portalRootsToSync = new Set<Element>();

  if (root instanceof Element) {
    const portalRoot = getClosestFederatedPortalRoot(root);
    if (portalRoot) {
      portalRootsToSync.add(portalRoot);
    }

    if (root.matches(FEDERATED_PORTAL_ROOT_SELECTOR) || root.matches(SCOPED_PORTAL_ROOT_SELECTOR)) {
      portalRootsToSync.add(root);
    }
  }

  root.querySelectorAll(KNOWN_FEDERATED_PORTAL_ROOT_SELECTOR).forEach((element) => {
    if (element instanceof Element) {
      portalRootsToSync.add(element);
    }
  });

  return portalRootsToSync;
};

const updateOwnedPortalRoots = (root: Document | Element = document.body) => {
  collectPortalRootsToSync(root).forEach((element) => {
    syncOwnedPortalRoot(element);
  });
};

const clearOwnedPortalRootMarkers = (root: Document | Element = document.body) => {
  root.querySelectorAll(OWNED_PORTAL_ROOT_SELECTOR).forEach((element) => {
    if (element instanceof Element) {
      element.removeAttribute(FEDERATED_OWNED_PORTAL_ROOT_ATTR);
    }
  });
};

// Scope checks determine whether a click/keydown came from the inline MLflow app
// or from an MLflow-owned body portal rendered outside the wrapper.
const isWithinFederatedScope = (
  target: EventTarget | null,
  mlflowWrapper: Element | null = getFederatedWrapper(),
): target is Element => {
  if (!(target instanceof Element)) {
    return false;
  }

  if (mlflowWrapper?.contains(target)) {
    return true;
  }

  return isFederatedPortalRoot(target.closest(SCOPED_PORTAL_ROOT_SELECTOR));
};

const isRestrictedFederatedLink: RestrictedLinkPredicate = (_link, url) =>
  (url.origin === window.location.origin &&
    ((url.pathname.includes('/models/') && !url.pathname.includes('/experiments/')) ||
      url.pathname.includes('/jobs/'))) ||
  url.hostname === 'mlflow.org' ||
  url.hostname.endsWith('.mlflow.org');

// Same-origin target="_blank" links should route inside the dashboard shell
// instead of opening the standalone MLflow app in a separate tab.
const navigateInPlace = (url: URL) => {
  // eslint-disable-next-line no-restricted-properties -- federated wrapper must sync the host URL directly
  window.history.pushState({}, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const forEachMatchingAnchor = (
  root: Document | Element,
  selector: string,
  callback: (element: HTMLAnchorElement) => void,
): void => {
  if (root instanceof HTMLAnchorElement && root.matches(selector)) {
    callback(root);
    return;
  }

  root.querySelectorAll(selector).forEach((element) => {
    if (element instanceof HTMLAnchorElement) {
      callback(element);
      return;
    }
  });
};

const cancelEvent = (event: MouseEvent | KeyboardEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const getLinkUrl = (link: HTMLAnchorElement) => {
  try {
    return new URL(link.href, window.location.origin);
  } catch {
    return null;
  }
};

const getScopedLinkTarget = (target: EventTarget | null): ScopedLinkTarget | null => {
  if (!isWithinFederatedScope(target)) {
    return null;
  }

  const link = target.closest('a');
  if (!(link instanceof HTMLAnchorElement) || !link.href) {
    return null;
  }

  try {
    return { link, url: new URL(link.href, window.location.origin) };
  } catch {
    return null;
  }
};

const isModifiedClick = (event: MouseEvent) => event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;
const shouldNavigateSameOriginLinkInPlace: NavigateInPlacePredicate = (link, url) =>
  url.origin === window.location.origin && link.target === '_blank';

const restoreGuardedLinkTabStop = (element: HTMLAnchorElement) => {
  const originalTabIndex = element.getAttribute(ORIGINAL_TABINDEX_ATTR);
  if (originalTabIndex === null) {
    element.removeAttribute('tabindex');
  } else {
    element.setAttribute('tabindex', originalTabIndex);
  }

  element.removeAttribute(ORIGINAL_TABINDEX_ATTR);
  element.removeAttribute(EMBEDDED_LINK_GUARD_ATTR);
};

// Keep restricted links out of the keyboard tab order while they are blocked
// in federated mode, then restore the original tabindex when unblocked.
const restoreGuardedLinkTabStops = (root: Document | Element = document) => {
  forEachMatchingAnchor(root, GUARDED_LINK_SELECTOR, restoreGuardedLinkTabStop);
};

const syncRestrictedLinkTabStop = (
  element: HTMLAnchorElement,
  mlflowWrapper: Element | null,
  isRestrictedLink: RestrictedLinkPredicate,
) => {
  const url = getLinkUrl(element);
  if (!url || !isWithinFederatedScope(element, mlflowWrapper) || !isRestrictedLink(element, url)) {
    if (element.getAttribute(EMBEDDED_LINK_GUARD_ATTR) === 'true') {
      restoreGuardedLinkTabStop(element);
    }
    return;
  }

  if (element.getAttribute(EMBEDDED_LINK_GUARD_ATTR) !== 'true') {
    const originalTabIndex = element.getAttribute('tabindex');
    if (originalTabIndex !== null) {
      element.setAttribute(ORIGINAL_TABINDEX_ATTR, originalTabIndex);
    }
  }

  element.setAttribute('tabindex', '-1');
  element.setAttribute(EMBEDDED_LINK_GUARD_ATTR, 'true');
};

const updateRestrictedLinkTabStops = (
  root: Document | Element = document.body,
  isRestrictedLink: RestrictedLinkPredicate,
) => {
  const mlflowWrapper = getFederatedWrapper();
  forEachMatchingAnchor(root, 'a[href]', (element) => {
    syncRestrictedLinkTabStop(element, mlflowWrapper, isRestrictedLink);
  });
};

const queueClosestPortalRoot = (rootsToSync: Set<Element>, element: Element | null) => {
  const portalRoot = getClosestFederatedPortalRoot(element);
  if (portalRoot) {
    rootsToSync.add(portalRoot);
  }
};

const shouldSyncClassMutationTarget = (element: Element) =>
  element.matches(`${FEDERATED_WRAPPER_SELECTOR}, ${FEDERATED_PORTAL_ROOT_SELECTOR}, ${SCOPED_PORTAL_ROOT_SELECTOR}`) ||
  element.querySelector(
    `${GUARDED_LINK_SELECTOR}, ${FEDERATED_PORTAL_ROOT_SELECTOR}, ${SCOPED_PORTAL_ROOT_SELECTOR}`,
  ) !== null;

// MutationObserver already batches records; we further narrow each batch to the
// roots that actually need portal ownership updates, link restores, or rescans.
const syncMutationBatch = (mutations: MutationRecord[], isRestrictedLink: RestrictedLinkPredicate) => {
  const portalRootsToSync = new Set<Element>();
  const rootsToRestore = new Set<Element>();
  const rootsToSync = new Set<Element>();

  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes') {
      if (!(mutation.target instanceof Element)) {
        return;
      }

      queueClosestPortalRoot(portalRootsToSync, mutation.target);

      if (mutation.attributeName === 'href' && mutation.target instanceof HTMLAnchorElement) {
        rootsToSync.add(mutation.target);
        return;
      }

      if (mutation.attributeName === 'class' && shouldSyncClassMutationTarget(mutation.target)) {
        rootsToSync.add(mutation.target);
      }
      return;
    }

    if (mutation.target instanceof Element) {
      portalRootsToSync.add(mutation.target);
      rootsToSync.add(mutation.target);
    }

    mutation.removedNodes.forEach((node) => {
      if (node instanceof Element) {
        rootsToRestore.add(node);
      }
    });

    mutation.addedNodes.forEach((node) => {
      if (node instanceof Element) {
        rootsToSync.add(node);
        portalRootsToSync.add(node);
      }
    });
  });

  portalRootsToSync.forEach((root) => {
    updateOwnedPortalRoots(root);
  });
  rootsToRestore.forEach((root) => {
    restoreGuardedLinkTabStops(root);
  });
  rootsToSync.forEach((root) => {
    updateRestrictedLinkTabStops(root, isRestrictedLink);
  });
};

/**
 * Hook to intercept link activation when MLflow runs in federated mode.
 *
 * Many MLflow components use target="_blank" on links (run links, model links,
 * metric links, etc.). In standalone mode these correctly open new tabs. In
 * federated mode (Module Federation inside ODH dashboard) we want same-origin
 * links to navigate in-place instead — opening a new tab would show the raw
 * MLflow standalone UI outside the dashboard shell.
 *
 * Links that route outside the embedded experiment-tracking experience are
 * intentionally blocked in federated mode, while other external links still
 * open in a new tab as expected.
 *
 * Ctrl/Cmd+click always opens in a new tab (standard browser behavior).
 *
 * The heavy lifting lives in the DOM helpers above; the hook below only wires
 * them to the document lifecycle while MLflow is embedded. Callers can also
 * provide a custom restricted-link predicate for more specific embedded views.
 */
export const useEmbeddedLinkInterceptor = (options: boolean | EmbeddedLinkInterceptorOptions = true) => {
  const normalizedOptions = typeof options === 'boolean' ? { enabled: options } : options;
  const {
    enabled = true,
    isRestrictedLink = isRestrictedFederatedLink,
    shouldNavigateInPlace = shouldNavigateSameOriginLinkInPlace,
  } = normalizedOptions;
  const isEmbedded = isIntegrated();
  const isActive = isEmbedded && enabled;

  useEffect(() => {
    if (!isActive) return;

    const handleClick = (event: MouseEvent) => {
      const scopedLinkTarget = getScopedLinkTarget(event.target);
      if (!scopedLinkTarget) return;
      const { link, url } = scopedLinkTarget;

      if (isRestrictedLink(link, url)) {
        cancelEvent(event);
        return;
      }

      // Ctrl/Cmd/Shift+click or middle-click: let browser open new tab
      if (isModifiedClick(event)) return;

      if (shouldNavigateInPlace(link, url)) {
        cancelEvent(event);
        navigateInPlace(url);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const scopedLinkTarget = getScopedLinkTarget(event.target);
      if (!scopedLinkTarget) return;
      const { link, url } = scopedLinkTarget;

      if (isRestrictedLink(link, url)) {
        cancelEvent(event);
        return;
      }

      if (event.key !== 'Enter') return;

      if (shouldNavigateInPlace(link, url)) {
        cancelEvent(event);
        navigateInPlace(url);
      }
    };

    updateOwnedPortalRoots();
    updateRestrictedLinkTabStops(document.body, isRestrictedLink);

    const observer = new MutationObserver((mutations) => syncMutationBatch(mutations, isRestrictedLink));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'class'],
    });

    document.addEventListener('click', handleClick, true);
    document.addEventListener('auxclick', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      observer.disconnect();
      clearOwnedPortalRootMarkers();
      restoreGuardedLinkTabStops();
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('auxclick', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isActive, isRestrictedLink, shouldNavigateInPlace]);

  return isEmbedded;
};
