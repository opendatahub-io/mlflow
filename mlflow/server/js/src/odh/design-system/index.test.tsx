import { describe, expect, it, jest } from '@jest/globals';
import type { ComponentProps, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider as EmotionThemeProvider } from '@emotion/react';
import * as DuBois from '@databricks/design-system';
import { t_global_background_color_primary_default } from '@patternfly/react-tokens';
import { IntlProvider } from 'react-intl';

import { PATTERN_FLY_TOKEN_TRANSLATION } from '../../common/styles/patternfly/patternflyTokenTranslation';
import { ApplyDesignSystemContextOverrides, Drawer, DropdownMenu, Modal, PageWrapper } from '.';

const mockDropdownMenuContent = jest.fn((_props: { collisionPadding?: unknown }) => null);
// eslint-disable-next-line @databricks/no-restricted-jest-mock-modules -- see above; not a provider workaround
jest.mock('@databricks/design-system', () => {
  const actual = jest.requireActual<typeof import('@databricks/design-system')>('@databricks/design-system');
  return {
    ...actual,
    DropdownMenu: {
      ...actual.DropdownMenu,
      Content: (props: { collisionPadding?: unknown }) => mockDropdownMenuContent(props),
    },
  };
});

const PF_PRIMARY_BACKGROUND = t_global_background_color_primary_default.var;

const ThemeProbe = ({ testId }: { testId: string }) => {
  const { theme } = DuBois.useDesignSystemTheme();
  return <span data-testid={testId}>{String(theme.colors.backgroundPrimary)}</span>;
};

const renderWithPatternFlyTheme = (ui: ReactNode) =>
  render(
    <DuBois.DesignSystemProvider>
      <EmotionThemeProvider theme={PATTERN_FLY_TOKEN_TRANSLATION}>{ui}</EmotionThemeProvider>
    </DuBois.DesignSystemProvider>,
  );

describe('design-system wrapper', () => {
  it('Du Bois context overrides drop the PatternFly theme (the problem this module fixes)', () => {
    renderWithPatternFlyTheme(
      <DuBois.ApplyDesignSystemContextOverrides>
        <ThemeProbe testId="probe" />
      </DuBois.ApplyDesignSystemContextOverrides>,
    );

    expect(screen.getByTestId('probe').textContent).not.toBe(PF_PRIMARY_BACKGROUND);
  });

  it('keeps the PatternFly theme inside context overrides', () => {
    renderWithPatternFlyTheme(
      <ApplyDesignSystemContextOverrides zIndexBase={2000}>
        <ThemeProbe testId="probe" />
      </ApplyDesignSystemContextOverrides>,
    );

    expect(screen.getByTestId('probe').textContent).toBe(PF_PRIMARY_BACKGROUND);
  });

  it('keeps the PatternFly theme in drawer title, body and footer', () => {
    renderWithPatternFlyTheme(
      <Drawer.Root open>
        <Drawer.Content
          componentId="design-system-wrapper.test.drawer"
          title={<ThemeProbe testId="title" />}
          footer={<ThemeProbe testId="footer" />}
        >
          <ThemeProbe testId="body" />
        </Drawer.Content>
      </Drawer.Root>,
    );

    for (const testId of ['title', 'body', 'footer']) {
      expect(screen.getByTestId(testId).textContent).toBe(PF_PRIMARY_BACKGROUND);
    }
  });

  it('re-exports the rest of the package unchanged', () => {
    expect(Drawer.Root).toBe(DuBois.Drawer.Root);
    expect(Drawer.Trigger).toBe(DuBois.Drawer.Trigger);
  });

  it('keeps dropdown menus away from the viewport edges unless the caller sets a margin', () => {
    render(
      <>
        <DropdownMenu.Content />
        <DropdownMenu.Content collisionPadding={4} />
      </>,
    );

    expect(mockDropdownMenuContent.mock.calls.map(([props]) => props.collisionPadding)).toEqual([16, 4]);
  });

  it('marks page wrappers for the Glass styles', () => {
    render(<PageWrapper className="page">Content</PageWrapper>);

    const wrapper = screen.getByText('Content');
    expect(wrapper).toHaveAttribute('data-mlflow-ui', 'page-wrapper');
    expect(wrapper).toHaveClass('page');
  });

  describe('modal footer', () => {
    const renderModal = (props: Partial<ComponentProps<typeof Modal>>) =>
      render(
        <IntlProvider locale="en">
          <Modal componentId="design-system-wrapper.test.modal" visible title="Delete experiment" {...props}>
            Body
          </Modal>
        </IntlProvider>,
      );

    it('adds a Cancel button next to the OK button', () => {
      renderModal({ okText: 'Delete' });

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it("keeps the caller's cancel text", () => {
      renderModal({ okText: 'Save', cancelText: 'Discard' });

      expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    it('leaves custom footers and footers without an OK button alone', () => {
      renderModal({ footer: null, okText: 'Delete' });
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });
  });
});
