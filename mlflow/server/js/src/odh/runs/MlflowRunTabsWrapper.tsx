import React, { useEffect, useMemo } from 'react';
import { Routes } from '../../common/utils/RoutingUtils';
import { getRunTabsRouteElements } from './runTabsRoutes';
import MlflowWrapperBase from '@mlflow/mlflow/src/odh/wrappers/MlflowWrapperBase';
import { setActiveWorkspace } from '../../workspaces/utils/WorkspaceUtils';

export interface MlflowRunTabsWrapperProps {
  experimentId: string;
  runUuid: string;
  onTabChange?: (tabName: string) => void;
  workspace?: string;
}

const MlflowRunTabsWrapper: React.FC<MlflowRunTabsWrapperProps> = ({
  experimentId,
  runUuid,
  onTabChange,
  workspace,
}) => {
  useEffect(() => {
    if (workspace) {
      setActiveWorkspace(workspace);
    }
  }, [workspace]);

  const memoryRouterEntries = useMemo(() => [`/${experimentId}/runs/${runUuid}`], [experimentId, runUuid]);
  const routeElements = useMemo(() => getRunTabsRouteElements(onTabChange), [onTabChange]);

  return (
    <MlflowWrapperBase memoryRouterEntries={memoryRouterEntries}>
      <Routes>{routeElements}</Routes>
    </MlflowWrapperBase>
  );
};

export default MlflowRunTabsWrapper;
