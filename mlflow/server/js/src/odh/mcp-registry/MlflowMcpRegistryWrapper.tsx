import React, { useMemo } from 'react';
import { Routes } from '../../common/utils/RoutingUtils';
import { getMcpRegistryRouteElements } from './mcpRegistryRoutes';
import { McpRegistryBreadcrumbReporter } from './McpRegistryBreadcrumbReporter';
import MlflowWrapperBase from '@mlflow/mlflow/src/odh/wrappers/MlflowWrapperBase';
import { MCP_REGISTRY_DEFAULT_BASENAME } from '../const';

export interface MlflowMcpRegistryWrapperProps {
  basename?: string;
  onBreadcrumbChange?: (segments: { label: string; path: string }[]) => void;
}

const MlflowMcpRegistryWrapper: React.FC<MlflowMcpRegistryWrapperProps> = ({
  basename = MCP_REGISTRY_DEFAULT_BASENAME,
  onBreadcrumbChange,
}) => {
  const routeElements = useMemo(() => getMcpRegistryRouteElements(), []);
  return (
    <MlflowWrapperBase
      basename={basename}
      breadcrumbReporter={<McpRegistryBreadcrumbReporter onBreadcrumbChange={onBreadcrumbChange} />}
    >
      <Routes>{routeElements}</Routes>
    </MlflowWrapperBase>
  );
};

export default MlflowMcpRegistryWrapper;
