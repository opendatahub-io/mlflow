import type { ReactNode } from 'react';
import React, { createContext, useContext, useMemo } from 'react';
import type { MCPServer, MCPServerVersion } from '../types';

export interface MCPRegistryIntegrationContextValue {
  /**
   * Renders host-provided action buttons (e.g. Deploy) in the MCP server version
   * detail page header. Not called outside of federated/integrated mode.
   */
  renderDetailActions?: (server: MCPServer, version?: MCPServerVersion) => ReactNode;
}

const MCPRegistryIntegrationContext = createContext<MCPRegistryIntegrationContextValue>({});

export const MCPRegistryIntegrationProvider: React.FC<{
  children: ReactNode;
  renderDetailActions?: MCPRegistryIntegrationContextValue['renderDetailActions'];
}> = ({ children, renderDetailActions }) => {
  const value = useMemo(() => ({ renderDetailActions }), [renderDetailActions]);
  return <MCPRegistryIntegrationContext.Provider value={value}>{children}</MCPRegistryIntegrationContext.Provider>;
};

/**
 * Safe to call in standalone mode: returns an empty object when no
 * MCPRegistryIntegrationProvider is present in the tree.
 */
export const useMCPRegistryIntegration = (): MCPRegistryIntegrationContextValue =>
  useContext(MCPRegistryIntegrationContext);
