import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const importStandaloneTheme = () =>
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./standaloneTheme');
  });

describe('standalone theme', () => {
  beforeEach(() => {
    document.documentElement.className = 'pf-shell-root';
    window.localStorage.clear();
    window.matchMedia = jest.fn(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it('puts the page on Felt with the contrast mode chosen in the dashboard', () => {
    window.localStorage.setItem('odh.dashboard.ui.contrastMode', JSON.stringify('high-contrast'));

    importStandaloneTheme();

    expect([...document.documentElement.classList]).toEqual([
      'pf-shell-root',
      'pf-v6-theme-felt',
      'pf-v6-theme-high-contrast',
    ]);
  });
});
