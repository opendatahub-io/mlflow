import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { matchPath, useLocation, useNavigate } from '../../common/utils/RoutingUtils';
import { WorkflowType } from '../../common/contexts/WorkflowTypeContext';
import { ExperimentPageTabName } from '../../experiment-tracking/constants';
import Routes, { RoutePaths } from '../../experiment-tracking/routes';
import { useGetExperimentPageActiveTabByRoute } from '../../experiment-tracking/components/experiment-page/hooks/useGetExperimentPageActiveTabByRoute';
import { getPreservedQueryString } from '../../experiment-tracking/pages/experiment-page-tabs/side-nav/utils';
import { isExpId } from './utils';

export interface UnsupportedTabInfo {
  experimentId?: string;
  tabName: string;
  promptName?: string;
  relativePath: string;
  search: string;
  workflowType: WorkflowType;
}

const MODEL_TRAINING_TABS = new Set<ExperimentPageTabName>([
  ExperimentPageTabName.Runs,
  ExperimentPageTabName.Models,
  ExperimentPageTabName.Traces,
]);

const isUnsupportedTab = (workflowType: WorkflowType, tabName: ExperimentPageTabName) =>
  tabName === ExperimentPageTabName.Prompts ||
  (workflowType === WorkflowType.MACHINE_LEARNING && !MODEL_TRAINING_TABS.has(tabName));

// Reports pages the host serves elsewhere (Prompts, and experiment tabs outside Model training), or falls back to Runs when no callback is given.
export const UnsupportedTabGuard = ({
  workflowType,
  onUnsupportedTab,
  children,
}: {
  workflowType: WorkflowType;
  onUnsupportedTab?: (info: UnsupportedTabInfo) => void;
  children?: ReactNode;
}) => {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const { tabName: tabNameByRoute } = useGetExperimentPageActiveTabByRoute();
  // Session grouping maps this route to Traces, but the host still handles session pages separately.
  const tabName = matchPath(RoutePaths.experimentPageTabSingleChatSession, pathname)
    ? ExperimentPageTabName.SingleChatSession
    : (tabNameByRoute ??
      (matchPath(RoutePaths.experimentPageTabbed, pathname)?.params['tabName'] === ExperimentPageTabName.Overview
        ? ExperimentPageTabName.Overview
        : undefined));
  const matchedExperimentId = matchPath({ path: RoutePaths.experimentPage, end: false }, pathname)?.params[
    'experimentId'
  ];
  const experimentId = isExpId(matchedExperimentId) ? matchedExperimentId : undefined;
  const topLevelPromptMatch =
    matchPath(RoutePaths.promptDetailsPage, pathname) ?? matchPath(RoutePaths.promptsPage, pathname);

  const unsupportedTabName = topLevelPromptMatch
    ? ExperimentPageTabName.Prompts
    : experimentId && tabName && isUnsupportedTab(workflowType, tabName)
      ? tabName
      : undefined;
  const promptName = (matchPath(RoutePaths.experimentPageTabPromptDetails, pathname) ?? topLevelPromptMatch)?.params[
    'promptName'
  ];

  const reportedPathRef = useRef<string>();

  useEffect(() => {
    if (!unsupportedTabName) {
      reportedPathRef.current = undefined;
      const params = new URLSearchParams(search);
      const workflowTypeParam = params.get('workflowType');
      if (workflowTypeParam !== null && workflowTypeParam !== workflowType) {
        params.set('workflowType', workflowType);
        navigate({ pathname, search: `?${params.toString()}`, hash }, { replace: true });
      }
      return;
    }
    if (onUnsupportedTab) {
      if (reportedPathRef.current === pathname) {
        return;
      }
      reportedPathRef.current = pathname;
      onUnsupportedTab({
        ...(experimentId && { experimentId }),
        tabName: unsupportedTabName,
        ...(promptName && { promptName }),
        relativePath: pathname,
        search,
        workflowType,
      });
      return;
    }
    if (!experimentId) {
      return;
    }

    navigate(
      {
        pathname: Routes.getExperimentPageTabRoute(experimentId, ExperimentPageTabName.Runs),
        search: getPreservedQueryString(search),
      },
      { replace: true },
    );
  }, [unsupportedTabName, experimentId, promptName, pathname, search, hash, onUnsupportedTab, workflowType, navigate]);

  const isRedirecting = Boolean(unsupportedTabName && (onUnsupportedTab || experimentId));
  return isRedirecting ? null : <>{children}</>;
};
