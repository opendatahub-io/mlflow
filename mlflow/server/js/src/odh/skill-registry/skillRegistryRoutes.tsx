import React from 'react';
import { Route, createLazyRouteElement } from '../../common/utils/RoutingUtils';

export const getSkillRegistryRouteElements = () => (
  <>
    <Route index element={createLazyRouteElement(() => import('../../skill-registry/pages/SkillRegistryPage'))} />
    <Route
      path=":skillKey"
      element={createLazyRouteElement(() => import('../../skill-registry/pages/SkillDetailPage'))}
    />
    {/* Unencoded two-segment URLs (`/@acme/code-review`), as upstream route-defs also accepts. */}
    <Route
      path=":organization/:skillName"
      element={createLazyRouteElement(() => import('../../skill-registry/pages/SkillDetailPage'))}
    />
  </>
);
