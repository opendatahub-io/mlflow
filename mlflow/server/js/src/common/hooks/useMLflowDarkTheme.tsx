import { Global } from '@emotion/react';
import { useEffect, useState } from 'react';
import {
  getCurrentDarkModePreference,
  setDarkModePreference,
  subscribeToDarkModeChanges,
} from '../utils/DarkModeUtils';

const darkModeBodyClassName = 'dark-mode';
const patternflyDarkModeSwitcherElementId = 'patternfly-dark-mode-switcher';
const patternflyDarkModeClassName = 'pf-v6-theme-dark';

// CSS attributes to be applied when dark mode is enabled. Affects inputs and other form elements.
const darkModeCSSStyles = { body: { [`&.${darkModeBodyClassName}`]: { colorScheme: 'dark' } } };
// This component is used to set the global CSS.
const DarkModeStylesComponent = () => <Global styles={darkModeCSSStyles} />;

/**
 * This hook is used to toggle the dark mode for the entire app.
 * Used in open source MLflow.
 * Returns a boolean value with the current state, setter function, and a component to be rendered in the root of the app.
 */
export const useMLflowDarkTheme = (): [
  boolean,
  React.Dispatch<React.SetStateAction<boolean>>,
  React.ComponentType<React.PropsWithChildren<unknown>>,
] => {
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    return getCurrentDarkModePreference();
  });

  useEffect(() => {
    // Update the theme when the user changes their system preference.
    document.body.classList.toggle(darkModeBodyClassName, isDarkTheme);
    const patternflyDarkModeSwitcher = document.getElementById(patternflyDarkModeSwitcherElementId);
    if (patternflyDarkModeSwitcher) {
      patternflyDarkModeSwitcher.classList.toggle(patternflyDarkModeClassName, isDarkTheme);
    }
    setDarkModePreference(isDarkTheme);
  }, [isDarkTheme]);

  useEffect(() => {
    return subscribeToDarkModeChanges((nextValue) => {
      setIsDarkTheme((current) => (current === nextValue ? current : nextValue));
    });
  }, []);

  return [isDarkTheme, setIsDarkTheme, DarkModeStylesComponent];
};
