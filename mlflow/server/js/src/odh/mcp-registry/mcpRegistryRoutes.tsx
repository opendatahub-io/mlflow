import React from 'react';
import { Route, createLazyRouteElement } from '../../common/utils/RoutingUtils';

export const getMcpRegistryRouteElements = () => (
  <>
    <Route index element={createLazyRouteElement(() => import('../../mcp-registry/pages/MCPRegistryPage'))} />
    <Route
      path=":serverName"
      element={createLazyRouteElement(() => import('../../mcp-registry/pages/MCPServerDetailPage'))}
    />
  </>
);
