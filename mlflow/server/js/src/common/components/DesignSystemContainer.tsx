import React, { useCallback, useRef } from 'react';
import { DesignSystemProvider, DesignSystemThemeProvider } from '@databricks/design-system';
import { ColorsPaletteDatalist } from './ColorsPaletteDatalist';
import { Theme } from '@emotion/react';
import { PATTERN_FLY_TOKEN_TRANSLATION } from '../styles/patternfly/patternflyTokenTranslation';
import { ThemeProvider as EmotionThemeProvider } from '@emotion/react';
import '../styles/patternfly/pf-shell-overrides.scss';

const PF_SHELL_CONTAINER_CLASS_NAME = 'pf-shell-container';
const PF_SHELL_ROOT_CLASS_NAME = 'pf-shell-root';
const DARK_MODE_CLASS_NAME = 'dark-mode';

type DesignSystemContainerProps = {
  isDarkTheme?: boolean;
  children: React.ReactNode;
};

const ThemeProvider = ({ children, isDarkTheme }: { children?: React.ReactNode; isDarkTheme?: boolean }) => {
  // eslint-disable-next-line react/forbid-elements
  return <DesignSystemThemeProvider isDarkMode={isDarkTheme}>{children}</DesignSystemThemeProvider>;
};

export const MLflowImagePreviewContainer = React.createContext({
  getImagePreviewPopupContainer: () => document.body,
});

/**
 * MFE-safe DesignSystemProvider that keeps portal content inside a dedicated
 * MLflow-owned shell node so PatternFly-scoped overrides apply consistently.
 * When mounted in a Shadow DOM, that node remains inside the same shadow root.
 */
export const DesignSystemContainer = (props: DesignSystemContainerProps) => {
  const modalContainerElement = useRef<HTMLDivElement | null>(null);
  const { isDarkTheme = false, children } = props;
  const shellRootClassName = `${PF_SHELL_ROOT_CLASS_NAME}${isDarkTheme ? ` ${DARK_MODE_CLASS_NAME}` : ''}`;

  const getPopupContainer = useCallback(() => modalContainerElement.current ?? document.body, []);

  // Specialized container for antd image previews, always rendered near MLflow
  // to maintain prefixed CSS classes and styles.
  const getImagePreviewPopupContainer = useCallback(() => {
    const modalContainerEle = modalContainerElement.current;
    if (modalContainerEle !== null) {
      return modalContainerEle;
    }
    return document.body;
  }, []);

  return (
    <ThemeProvider isDarkTheme={isDarkTheme}>
      <DesignSystemProvider getPopupContainer={getPopupContainer} {...props}>
        <MLflowImagePreviewContainer.Provider value={{ getImagePreviewPopupContainer }}>
          <EmotionThemeProvider theme={(baseTheme) => PATTERN_FLY_TOKEN_TRANSLATION(baseTheme)}>
            <div className={`${PF_SHELL_CONTAINER_CLASS_NAME} ${shellRootClassName}`}>{children}</div>
            <div ref={modalContainerElement} className={shellRootClassName} />
          </EmotionThemeProvider>
        </MLflowImagePreviewContainer.Provider>
      </DesignSystemProvider>
      <ColorsPaletteDatalist />
    </ThemeProvider>
  );
};
