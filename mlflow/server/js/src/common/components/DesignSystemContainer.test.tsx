import { jest, describe, test, expect } from '@jest/globals';
import React from 'react';
import { render, screen } from '../utils/TestUtils.react18';
import { DesignSystemContainer } from './DesignSystemContainer';

let mockGetPopupContainerFn: any;

// eslint-disable-next-line @databricks/no-restricted-jest-mock-modules -- TODO(FEINF-4402)
jest.mock('@databricks/design-system', () => ({
  DesignSystemProvider: ({ getPopupContainer, children }: any) => {
    mockGetPopupContainerFn = getPopupContainer;
    return children;
  },
  DesignSystemThemeProvider: ({ children }: any) => {
    return children;
  },
}));

describe('DesignSystemContainer', () => {
  window.customElements.define(
    'demo-shadow-dom',
    class extends HTMLElement {
      _shadowRoot: any;
      constructor() {
        super();
        this._shadowRoot = this.attachShadow({ mode: 'open' });
      }
      connectedCallback() {
        render(
          <DesignSystemContainer>
            <span>hello in shadow dom</span>
          </DesignSystemContainer>,
          {
            baseElement: this._shadowRoot,
          },
        );
      }
    },
  );

  test('should use the dedicated popup container while in document.body', () => {
    render(
      <DesignSystemContainer>
        <span>hello</span>
      </DesignSystemContainer>,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('hello').closest('.pf-shell-container')).toHaveClass('pf-shell-root');
    expect(mockGetPopupContainerFn()).not.toBe(document.body);
    expect(mockGetPopupContainerFn()).toHaveClass('pf-shell-root');
  });

  test('should use the dedicated popup container while in shadow DOM', () => {
    const customElement = window.document.createElement('demo-shadow-dom');
    window.document.body.appendChild(customElement);

    expect(mockGetPopupContainerFn()).not.toBe(document.body);
    expect(mockGetPopupContainerFn().tagName).toBe('DIV');
    expect(mockGetPopupContainerFn()).toHaveClass('pf-shell-root');

    expect(1).toBe(1);
  });

  test('should mirror dark mode classes onto standalone shell containers', () => {
    const shadowHost = window.document.createElement('div');
    const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    window.document.body.appendChild(shadowHost);

    render(
      <DesignSystemContainer isDarkTheme>
        <span>hello in dark mode</span>
      </DesignSystemContainer>,
      {
        baseElement: shadowRoot,
      },
    );

    expect(mockGetPopupContainerFn()).toHaveClass('pf-shell-root', 'dark-mode');
  });
});
