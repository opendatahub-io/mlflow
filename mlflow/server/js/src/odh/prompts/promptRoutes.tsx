import React from 'react';
import { Route, createLazyRouteElement } from '../../common/utils/RoutingUtils';

export const getPromptRouteElements = () => (
  <>
    <Route
      index
      element={createLazyRouteElement(() => import('../../experiment-tracking/pages/prompts/PromptsPage'))}
    />
    <Route
      path="prompts"
      element={createLazyRouteElement(() => import('../../experiment-tracking/pages/prompts/PromptsPage'))}
    />
    <Route
      path="prompts/:promptName"
      element={createLazyRouteElement(() => import('../../experiment-tracking/pages/prompts/PromptsDetailsPage'))}
    />
  </>
);
