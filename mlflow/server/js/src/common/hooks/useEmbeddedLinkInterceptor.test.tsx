import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEmbeddedLinkInterceptor } from './useEmbeddedLinkInterceptor';
import { isIntegrated } from '../utils/embedUtils';

jest.mock('../utils/embedUtils', () => ({
  isIntegrated: jest.fn(),
}));

const GUARDED_LINK_ATTR = 'data-mlflow-embedded-link-guard';
const mockedIsIntegrated = jest.mocked(isIntegrated);

const createAnchor = (href: string) => {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.textContent = href;
  return anchor;
};

const createFederatedWrapper = () => {
  const wrapper = document.createElement('div');
  wrapper.className = 'mlflow-federated';
  document.body.appendChild(wrapper);
  return wrapper;
};

const createFederatedPortalRoot = () => {
  const portalRoot = document.createElement('div');
  portalRoot.setAttribute('data-radix-popper-content-wrapper', '');
  document.body.appendChild(portalRoot);
  return portalRoot;
};

const createFederatedPortalContainer = () => {
  const portalContainer = document.createElement('div');
  portalContainer.setAttribute('data-mlflow-federated-portal-container', 'true');
  document.body.appendChild(portalContainer);
  return portalContainer;
};

const createMlflowOwnedMarker = () => {
  const marker = document.createElement('div');
  marker.setAttribute('data-component-id', 'mlflow.test.portal');
  return marker;
};

describe('useEmbeddedLinkInterceptor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsIntegrated.mockReturnValue(true);
    document.body.innerHTML = '';
    document.body.setAttribute('data-mlflow-federated', 'true');
  });

  it('guards restricted links inside the federated wrapper on mount', async () => {
    const wrapper = createFederatedWrapper();
    const restrictedLink = createAnchor('/models/test-model');
    const allowedLink = createAnchor('/experiments/23/models/test-model');

    wrapper.append(restrictedLink, allowedLink);

    renderHook(() => useEmbeddedLinkInterceptor());

    await waitFor(() => {
      expect(restrictedLink).toHaveAttribute('tabindex', '-1');
    });

    expect(restrictedLink).toHaveAttribute(GUARDED_LINK_ATTR, 'true');
    expect(allowedLink).not.toHaveAttribute(GUARDED_LINK_ATTR);
  });

  it('guards restricted links added after mount', async () => {
    const wrapper = createFederatedWrapper();
    renderHook(() => useEmbeddedLinkInterceptor());

    const restrictedLink = createAnchor('/models/test-model');
    act(() => {
      wrapper.appendChild(restrictedLink);
    });

    await waitFor(() => {
      expect(restrictedLink).toHaveAttribute(GUARDED_LINK_ATTR, 'true');
    });
  });

  it('guards jobs links inside the federated wrapper on mount', async () => {
    const wrapper = createFederatedWrapper();
    const restrictedLink = createAnchor('/jobs/123');

    wrapper.appendChild(restrictedLink);

    renderHook(() => useEmbeddedLinkInterceptor());

    await waitFor(() => {
      expect(restrictedLink).toHaveAttribute(GUARDED_LINK_ATTR, 'true');
    });
  });

  it('restores guarded links when their href becomes allowed', async () => {
    const wrapper = createFederatedWrapper();
    const restrictedLink = createAnchor('/models/test-model');
    wrapper.appendChild(restrictedLink);

    renderHook(() => useEmbeddedLinkInterceptor());

    await waitFor(() => {
      expect(restrictedLink).toHaveAttribute(GUARDED_LINK_ATTR, 'true');
    });

    act(() => {
      restrictedLink.setAttribute('href', '/experiments/23/models/test-model');
    });

    await waitFor(() => {
      expect(restrictedLink).not.toHaveAttribute(GUARDED_LINK_ATTR);
    });

    expect(restrictedLink).not.toHaveAttribute('tabindex');
  });

  it('restores guarded links when the federated wrapper loses scope', async () => {
    const wrapper = createFederatedWrapper();
    const restrictedLink = createAnchor('/models/test-model');
    wrapper.appendChild(restrictedLink);

    renderHook(() => useEmbeddedLinkInterceptor());

    await waitFor(() => {
      expect(restrictedLink).toHaveAttribute(GUARDED_LINK_ATTR, 'true');
    });

    act(() => {
      wrapper.className = '';
    });

    await waitFor(() => {
      expect(restrictedLink).not.toHaveAttribute(GUARDED_LINK_ATTR);
    });

    expect(restrictedLink).not.toHaveAttribute('tabindex');
  });

  it('guards restricted links inside MLflow-owned body portals', async () => {
    const portalRoot = createFederatedPortalRoot();
    const restrictedLink = createAnchor('/models/test-model');

    portalRoot.append(createMlflowOwnedMarker(), restrictedLink);

    renderHook(() => useEmbeddedLinkInterceptor());

    await waitFor(() => {
      expect(restrictedLink).toHaveAttribute(GUARDED_LINK_ATTR, 'true');
    });
  });

  it('guards restricted links inside the dedicated federated portal container', async () => {
    const portalContainer = createFederatedPortalContainer();
    const portalRoot = document.createElement('div');
    portalRoot.setAttribute('data-radix-popper-content-wrapper', '');
    const restrictedLink = createAnchor('/models/test-model');

    portalRoot.appendChild(restrictedLink);
    portalContainer.appendChild(portalRoot);

    renderHook(() => useEmbeddedLinkInterceptor());

    await waitFor(() => {
      expect(restrictedLink).toHaveAttribute(GUARDED_LINK_ATTR, 'true');
    });
  });

  it('ignores generic body portals until they become MLflow-owned', async () => {
    const portalRoot = createFederatedPortalRoot();
    const restrictedLink = createAnchor('/models/test-model');

    portalRoot.appendChild(restrictedLink);

    renderHook(() => useEmbeddedLinkInterceptor());

    expect(restrictedLink).not.toHaveAttribute(GUARDED_LINK_ATTR);

    act(() => {
      portalRoot.appendChild(createMlflowOwnedMarker());
    });

    await waitFor(() => {
      expect(restrictedLink).toHaveAttribute(GUARDED_LINK_ATTR, 'true');
    });
  });

  it('supports custom restricted-link predicates for embedded subviews', async () => {
    const wrapper = createFederatedWrapper();
    const restrictedLink = createAnchor('/custom/blocked');
    const allowedLink = createAnchor('/custom/allowed');

    wrapper.append(restrictedLink, allowedLink);

    renderHook(() =>
      useEmbeddedLinkInterceptor({
        isRestrictedLink: (link) => (link.getAttribute('href') ?? '').includes('/blocked'),
        shouldNavigateInPlace: () => false,
      }),
    );

    await waitFor(() => {
      expect(restrictedLink).toHaveAttribute(GUARDED_LINK_ATTR, 'true');
    });

    expect(allowedLink).not.toHaveAttribute(GUARDED_LINK_ATTR);
  });

  it('lets callers disable in-place navigation for same-origin target blank links', () => {
    const wrapper = createFederatedWrapper();
    const link = createAnchor('/custom/allowed');
    link.target = '_blank';
    wrapper.appendChild(link);

    const pushStateSpy = jest.spyOn(History.prototype, 'pushState');

    renderHook(() =>
      useEmbeddedLinkInterceptor({
        shouldNavigateInPlace: () => false,
      }),
    );

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(pushStateSpy).not.toHaveBeenCalled();
    pushStateSpy.mockRestore();
  });
});
