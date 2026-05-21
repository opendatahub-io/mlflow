import React, { useEffect, useMemo } from 'react';
import { Routes } from '../../common/utils/RoutingUtils';
import { getCompareRunsRouteElements } from './compareRunsRoutes';
import MlflowWrapperBase from '@mlflow/mlflow/src/odh/wrappers/MlflowWrapperBase';
import { setActiveWorkspace } from '../../workspaces/utils/WorkspaceUtils';

export interface MlflowCompareRunsWrapperProps {
  experimentIds: string[];
  runUuids: string[];
  workspace?: string;
}

const MlflowCompareRunsWrapper: React.FC<MlflowCompareRunsWrapperProps> = ({ experimentIds, runUuids, workspace }) => {
  useEffect(() => {
    if (workspace) {
      setActiveWorkspace(workspace);
    }
  }, [workspace]);

  const memoryRouterEntries = useMemo(
    () => [
      `/compare-runs?runs=${encodeURIComponent(JSON.stringify(runUuids))}&experiments=${encodeURIComponent(JSON.stringify(experimentIds))}`,
    ],
    [experimentIds, runUuids],
  );

  const routeElements = useMemo(() => getCompareRunsRouteElements(), []);

  return (
    <MlflowWrapperBase memoryRouterEntries={memoryRouterEntries}>
      <Routes>{routeElements}</Routes>
    </MlflowWrapperBase>
  );
};

export default MlflowCompareRunsWrapper;
