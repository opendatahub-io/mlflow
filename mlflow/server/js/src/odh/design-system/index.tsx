import { forwardRef } from 'react';
import type { ComponentProps, ComponentPropsWithoutRef, ElementRef, ReactNode } from 'react';
import { ThemeProvider as EmotionThemeProvider } from '@emotion/react';
import * as DesignSystem from '@databricks/design-system';
import { FormattedMessage } from 'react-intl';

import { PATTERN_FLY_TOKEN_TRANSLATION } from '../../common/styles/patternfly/patternflyTokenTranslation';

export * from '@databricks/design-system';

const ReapplyPatternFlyTheme = ({ children }: { children?: ReactNode }) => (
  <EmotionThemeProvider theme={PATTERN_FLY_TOKEN_TRANSLATION}>{children}</EmotionThemeProvider>
);

export const ApplyDesignSystemContextOverrides: typeof DesignSystem.ApplyDesignSystemContextOverrides = ({
  children,
  ...props
}) => (
  <DesignSystem.ApplyDesignSystemContextOverrides {...props}>
    <ReapplyPatternFlyTheme>{children}</ReapplyPatternFlyTheme>
  </DesignSystem.ApplyDesignSystemContextOverrides>
);

const DrawerContent = ({ children, title, footer, ...props }: ComponentProps<typeof DesignSystem.Drawer.Content>) => (
  <DesignSystem.Drawer.Content
    {...props}
    title={title === undefined ? undefined : <ReapplyPatternFlyTheme>{title}</ReapplyPatternFlyTheme>}
    footer={footer === undefined ? undefined : <ReapplyPatternFlyTheme>{footer}</ReapplyPatternFlyTheme>}
  >
    <ReapplyPatternFlyTheme>{children}</ReapplyPatternFlyTheme>
  </DesignSystem.Drawer.Content>
);

export const Drawer: typeof DesignSystem.Drawer = { ...DesignSystem.Drawer, Content: DrawerContent };

const MENU_VIEWPORT_MARGIN = 16;

const DropdownMenuContent = forwardRef<
  ElementRef<typeof DesignSystem.DropdownMenu.Content>,
  ComponentPropsWithoutRef<typeof DesignSystem.DropdownMenu.Content>
>(function DropdownMenuContent({ collisionPadding = MENU_VIEWPORT_MARGIN, ...props }, ref) {
  return <DesignSystem.DropdownMenu.Content ref={ref} collisionPadding={collisionPadding} {...props} />;
});

const DropdownMenuSubContent = forwardRef<
  ElementRef<typeof DesignSystem.DropdownMenu.SubContent>,
  ComponentPropsWithoutRef<typeof DesignSystem.DropdownMenu.SubContent>
>(function DropdownMenuSubContent({ collisionPadding = MENU_VIEWPORT_MARGIN, ...props }, ref) {
  return <DesignSystem.DropdownMenu.SubContent ref={ref} collisionPadding={collisionPadding} {...props} />;
});

export const DropdownMenu: typeof DesignSystem.DropdownMenu = {
  ...DesignSystem.DropdownMenu,
  Content: DropdownMenuContent,
  SubContent: DropdownMenuSubContent,
};

export const Modal: typeof DesignSystem.Modal = (props) => {
  const needsCancel = props.footer === undefined && props.okText !== undefined && props.cancelText === undefined;
  return (
    <DesignSystem.Modal
      {...props}
      cancelText={
        needsCancel ? (
          <FormattedMessage defaultMessage="Cancel" description="Default cancel button in the footer of a dialog" />
        ) : (
          props.cancelText
        )
      }
    />
  );
};

export const PageWrapper: typeof DesignSystem.PageWrapper = (props) => (
  <DesignSystem.PageWrapper data-mlflow-ui="page-wrapper" {...props} />
);
