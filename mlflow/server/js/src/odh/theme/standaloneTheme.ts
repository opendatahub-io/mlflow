import '@patternfly/patternfly/patternfly.css';

import { syncStandaloneContrastMode } from './standaloneContrastMode';

export const FELT_CLASS_NAME = 'pf-v6-theme-felt';

document.documentElement.classList.add(FELT_CLASS_NAME);
syncStandaloneContrastMode();
