import React, { useMemo } from 'react';
import { Routes } from '../../common/utils/RoutingUtils';
import { getMcpRegistryRouteElements } from './mcpRegistryRoutes';
import { McpRegistryBreadcrumbReporter } from './McpRegistryBreadcrumbReporter';
import MlflowWrapperBase from '@mlflow/mlflow/src/odh/wrappers/MlflowWrapperBase';
import { MCP_REGISTRY_DEFAULT_BASENAME } from '../const';
import { MCPRegistryIntegrationProvider } from '../../mcp-registry/contexts/MCPRegistryIntegrationContext';
import type { MCPRegistryIntegrationContextValue } from '../../mcp-registry/contexts/MCPRegistryIntegrationContext';

export interface MlflowMcpRegistryWrapperProps {
  basename?: string;
  onBreadcrumbChange?: (segments: { label: string; path: string }[]) => void;
  /**
   * Renders host-provided action buttons (e.g. Deploy) in the MCP server
   * detail page header, alongside the existing Edit/Delete/Create actions.
   */
  renderDetailActions?: MCPRegistryIntegrationContextValue['renderDetailActions'];
}

const MlflowMcpRegistryWrapper: React.FC<MlflowMcpRegistryWrapperProps> = ({
  basename = MCP_REGISTRY_DEFAULT_BASENAME,
  onBreadcrumbChange,
  renderDetailActions,
}) => {
  const routeElements = useMemo(() => getMcpRegistryRouteElements(), []);
  return (
    <MlflowWrapperBase
      basename={basename}
      breadcrumbReporter={<McpRegistryBreadcrumbReporter onBreadcrumbChange={onBreadcrumbChange} />}
    >
      <MCPRegistryIntegrationProvider renderDetailActions={renderDetailActions}>
        <Routes>{routeElements}</Routes>
      </MCPRegistryIntegrationProvider>
    </MlflowWrapperBase>
  );
};

export default MlflowMcpRegistryWrapper;
