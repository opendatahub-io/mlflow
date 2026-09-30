import React, { useEffect, useMemo } from 'react';
import MlflowWrapperBase from '@mlflow/mlflow/src/odh/wrappers/MlflowWrapperBase';
import { setActiveWorkspace } from '../../workspaces/utils/WorkspaceUtils';
import { useGetTracesById } from '../../shared/web-shared/model-trace-explorer/hooks/useGetTracesById';
import { ModelTraceExplorer } from '../../shared/web-shared/model-trace-explorer/ModelTraceExplorer';
import { ModelTraceExplorerSkeleton } from '../../shared/web-shared/model-trace-explorer/ModelTraceExplorerSkeleton';
import { ModelTraceExplorerGenericErrorState } from '../../shared/web-shared/model-trace-explorer/ModelTraceExplorerGenericErrorState';

export interface MlflowTraceDetailWrapperProps {
  traceId: string;
  workspace?: string;
}

const toMlflowRequestId = (id: string) => (id.startsWith('tr-') || id.startsWith('trace:/') ? id : `tr-${id}`);

const TraceDetailContent: React.FC<{ traceId: string }> = ({ traceId }) => {
  const { data, isLoading, isError, error } = useGetTracesById([toMlflowRequestId(traceId)]);
  const trace = data?.[0];

  if (isLoading) {
    return <ModelTraceExplorerSkeleton />;
  }

  if (!trace || isError) {
    return <ModelTraceExplorerGenericErrorState error={error as Error | undefined} />;
  }

  return <ModelTraceExplorer modelTrace={trace} />;
};

const MlflowTraceDetailWrapper: React.FC<MlflowTraceDetailWrapperProps> = ({ traceId, workspace }) => {
  useEffect(() => {
    if (workspace) {
      setActiveWorkspace(workspace);
    }
  }, [workspace]);

  const memoryRouterRoot = ['/'];

  return (
    <MlflowWrapperBase memoryRouterEntries={memoryRouterRoot}>
      <TraceDetailContent traceId={traceId} />
    </MlflowWrapperBase>
  );
};

export default MlflowTraceDetailWrapper;
