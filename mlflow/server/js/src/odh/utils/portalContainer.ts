import { createContext, useContext } from 'react';

const getDocumentBody = (): HTMLElement => document.body;

/**
 * Provided by `MlflowWrapperBase` with a callback returning its own body-level portal
 * container. Each wrapper instance owns a separate container (with its own dark-mode
 * class and lifetime), so popups must resolve to the container of the wrapper they are
 * rendered in rather than the first one found in the DOM.
 */
export const FederatedPortalContainerContext = createContext<() => HTMLElement>(getDocumentBody);

/**
 * Popup container for upstream components that portal to `document.body` to escape a
 * clipping parent (e.g. menus inside the trace drawer). In federated mode `document.body`
 * belongs to the dashboard, so such popups would miss the `.pf-shell-root` PF overrides,
 * the dark-mode class, and the embedded link interceptor. Inside a federated wrapper this
 * returns that wrapper's portal container getter, which is equally unclipped. Outside a
 * wrapper (standalone) it returns `() => document.body`, matching upstream.
 */
export const useBodyPopupContainer = (): (() => HTMLElement) => useContext(FederatedPortalContainerContext);
