import { afterEach, describe, expect, it } from '@jest/globals';
import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';

import { FederatedPortalContainerContext, useBodyPopupContainer } from './portalContainer';

const createPortalContainer = (): HTMLElement => {
  const portalContainer = document.createElement('div');
  portalContainer.className = 'pf-shell-root';
  portalContainer.setAttribute('data-mlflow-federated-portal-container', 'true');
  document.body.appendChild(portalContainer);
  return portalContainer;
};

const renderInProvider = (portalContainer: HTMLElement) =>
  renderHook(() => useBodyPopupContainer(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(FederatedPortalContainerContext.Provider, { value: () => portalContainer }, children),
  });

describe('useBodyPopupContainer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves to document.body outside a federated wrapper (standalone)', () => {
    const { result } = renderHook(() => useBodyPopupContainer());

    expect(result.current()).toBe(document.body);
  });

  it('ignores federated portal containers in the DOM when there is no provider', () => {
    createPortalContainer();
    const { result } = renderHook(() => useBodyPopupContainer());

    expect(result.current()).toBe(document.body);
  });

  it("resolves to the provider's portal container", () => {
    const portalContainer = createPortalContainer();
    const { result } = renderInProvider(portalContainer);

    expect(result.current()).toBe(portalContainer);
  });

  it('resolves each of two concurrent providers to its own container', () => {
    const firstContainer = createPortalContainer();
    const secondContainer = createPortalContainer();
    const first = renderInProvider(firstContainer);
    const second = renderInProvider(secondContainer);

    expect(first.result.current()).toBe(firstContainer);
    expect(second.result.current()).toBe(secondContainer);

    first.unmount();
    firstContainer.remove();

    expect(second.result.current()).toBe(secondContainer);
    expect(secondContainer.isConnected).toBe(true);
  });
});
