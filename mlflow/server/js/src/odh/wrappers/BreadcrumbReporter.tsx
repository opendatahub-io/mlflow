/**
 * BreadcrumbReporter
 *
 * Watches the current route inside MLflow's BrowserRouter and reports
 * structured breadcrumb segments to the host via a callback prop.
 * Must be rendered inside <BrowserRouter> to access useLocation/matchPath.
 *
 * Paths in the segments are relative to the MLflow basename
 * (e.g. "/experiments/3/runs"). The host prepends its own base route
 * and workspace query param when rendering the breadcrumb links.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, matchPath } from '../../common/utils/RoutingUtils';
import { useSelector } from 'react-redux';
import { useQueryClient } from '../../common/utils/reactQueryHooks';

export interface BreadcrumbSegment {
  /** Display label for the breadcrumb item. */
  label: string;
  /** Path relative to the MLflow basename, e.g. "/experiments/3/runs". */
  path: string;
}

interface BreadcrumbReporterProps {
  onBreadcrumbChange?: (segments: BreadcrumbSegment[]) => void;
}

const EXPERIMENTS_CRUMB: BreadcrumbSegment = { label: 'Experiments', path: '/' };

const isExpId = (id: string | undefined) => Boolean(id && /^\d+$/.test(id));

/**
 * Try to resolve an experiment name from the Redux store.
 * The experiment is put into Redux by useExperimentReduxStoreCompat
 * after the GraphQL fetch in ExperimentPageTabs.
 */
const useExperimentName = (experimentId: string | undefined): string | undefined => {
  return useSelector((state: any) => {
    if (!experimentId) return undefined;
    const experiment = state?.entities?.experimentsById?.[experimentId];
    return experiment?.name ?? undefined;
  });
};

/**
 * Try to resolve a run name from the Redux store.
 */
const useRunName = (runUuid: string | undefined): string | undefined => {
  return useSelector((state: any) => {
    if (!runUuid) return undefined;
    const runInfo = state?.entities?.runInfosByUuid?.[runUuid];
    return runInfo?.runName ?? undefined;
  });
};

/**
 * Try to resolve a logged model name from the React Query cache.
 * The model is fetched by useGetLoggedModelQuery on the detail page.
 * Uses queryClient.getQueryState + a polling effect to reactively
 * pick up the name once the model detail page finishes fetching.
 */
const useLoggedModelName = (loggedModelId: string | undefined): string | undefined => {
  const queryClient = useQueryClient();
  const [name, setName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!loggedModelId) {
      setName(undefined);
      return;
    }

    // Check immediately
    const data = queryClient.getQueryData<{ model: { info?: { name?: string } } }>(['GET_LOGGED_MODEL', loggedModelId]);
    if (data?.model?.info?.name) {
      setName(data.model.info.name);
      return;
    }

    // Subscribe to cache changes for this query key
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query?.queryKey?.[0] === 'GET_LOGGED_MODEL' && event?.query?.queryKey?.[1] === loggedModelId) {
        const updated = event.query.state.data as { model: { info?: { name?: string } } } | undefined;
        if (updated?.model?.info?.name) {
          setName(updated.model.info.name);
        }
      }
    });

    return unsubscribe;
  }, [loggedModelId, queryClient]);

  return name;
};

/**
 * Build breadcrumb segments from the current pathname.
 *
 * Structure:
 *   Experiment list          -> [] (empty)
 *   Experiment page (any tab)-> [Experiments (link), experiment-name (active)]
 *   Run page (any tab)       -> [Experiments (link), experiment-name (link), run-name (active)]
 *   Logged model detail      -> [Experiments (link), experiment-name (link), model-id (active)]
 *   Compare / metric / etc.  -> [Experiments (link), page-label (active)]
 *   Prompts list             -> [] (empty)
 *   Prompt detail            -> [Prompts (link), prompt-name (active)]
 */
/** Parse a JSON array from a URL query param, e.g. ?experiments=["1","2"] */
const parseQueryParam = (search: string, param: string): string[] => {
  const value = new URLSearchParams(search).get(param);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    return [];
  }
};

const buildSegments = (
  pathname: string,
  search: string,
  experimentName: string | undefined,
  runName: string | undefined,
  loggedModelName: string | undefined,
): BreadcrumbSegment[] => {
  // Experiment list / index — no breadcrumbs
  if (pathname === '/' || pathname === '') {
    return [];
  }

  // Run page: /:id/runs/:runUuid(/*) — 3 levels
  const runMatch = matchPath('/:experimentId/runs/:runUuid/*', pathname);
  if (runMatch && isExpId(runMatch.params.experimentId)) {
    const { experimentId, runUuid } = runMatch.params as { experimentId: string; runUuid: string };
    const expLabel = experimentName || `Experiment ${experimentId}`;
    const rLabel = runName || runUuid;
    return [
      EXPERIMENTS_CRUMB,
      { label: expLabel, path: `/${experimentId}` },
      { label: rLabel, path: `/${experimentId}/runs/${runUuid}` },
    ];
  }

  // Logged model detail: /:id/models/:modelId(/:tabName) — 3 levels
  const modelMatch =
    matchPath('/:experimentId/models/:loggedModelId/:tabName', pathname) ||
    matchPath('/:experimentId/models/:loggedModelId', pathname);
  if (modelMatch && isExpId(modelMatch.params.experimentId)) {
    const { experimentId, loggedModelId } = modelMatch.params as {
      experimentId: string;
      loggedModelId: string;
    };
    const expLabel = experimentName || `Experiment ${experimentId}`;
    const mLabel = loggedModelName || loggedModelId;
    return [
      EXPERIMENTS_CRUMB,
      { label: expLabel, path: `/${experimentId}` },
      { label: mLabel, path: `/${experimentId}/models/${loggedModelId}` },
    ];
  }

  // Experiment page (any tab / sub-tab) — 2 levels, tab does NOT appear in breadcrumb
  const expMatch = matchPath('/:experimentId/*', pathname) || matchPath('/:experimentId', pathname);
  if (expMatch && isExpId(expMatch.params.experimentId)) {
    const { experimentId } = expMatch.params as { experimentId: string };
    const expLabel = experimentName || `Experiment ${experimentId}`;
    return [EXPERIMENTS_CRUMB, { label: expLabel, path: `/${experimentId}` }];
  }

  // Direct run page (no experiment context): /runs/:runUuid
  const directRunMatch = matchPath('/runs/:runUuid', pathname);
  if (directRunMatch) {
    const { runUuid } = directRunMatch.params as { runUuid: string };
    const rLabel = runName || runUuid;
    return [EXPERIMENTS_CRUMB, { label: rLabel, path: `/runs/${runUuid}` }];
  }

  // Compare runs — query params contain the source experiment(s).
  if (matchPath('/compare-runs', pathname)) {
    const expIds = parseQueryParam(search, 'experiments');
    if (expIds.length === 1) {
      const expLabel = experimentName || `Experiment ${expIds[0]}`;
      return [
        EXPERIMENTS_CRUMB,
        { label: expLabel, path: `/${expIds[0]}` },
        { label: 'Compare Runs', path: `${pathname}${search}` },
      ];
    }
    if (expIds.length > 1) {
      return [
        EXPERIMENTS_CRUMB,
        { label: 'Compare Experiments', path: `/compare-experiments/s?experiments=${JSON.stringify(expIds)}` },
        { label: 'Compare Runs', path: `${pathname}${search}` },
      ];
    }
    return [EXPERIMENTS_CRUMB, { label: 'Compare Runs', path: `${pathname}${search}` }];
  }
  if (matchPath('/compare-experiments/:searchString', pathname)) {
    return [EXPERIMENTS_CRUMB, { label: 'Compare Experiments', path: `${pathname}${search}` }];
  }

  // Metric
  if (matchPath('/metric/*', pathname)) {
    return [EXPERIMENTS_CRUMB, { label: 'Metric', path: pathname }];
  }

  // Top-level prompts
  if (matchPath('/prompts/:promptName', pathname)) {
    const match = matchPath('/prompts/:promptName', pathname)!;
    const { promptName } = match.params as { promptName: string };
    return [
      { label: 'Prompts', path: '/prompts' },
      { label: promptName, path: `/prompts/${promptName}` },
    ];
  }

  return [];
};

/**
 * Renders nothing. Watches route changes and calls onBreadcrumbChange
 * with structured breadcrumb segments.
 */
export const BreadcrumbReporter: React.FC<BreadcrumbReporterProps> = ({ onBreadcrumbChange }) => {
  const { pathname, search } = useLocation();

  // Extract IDs from the pathname for entity name lookups
  const expMatch = matchPath('/:experimentId/*', pathname);
  const runMatch = matchPath('/:experimentId/runs/:runUuid/*', pathname);
  const directRunMatch = matchPath('/runs/:runUuid', pathname);
  const modelDetailMatch =
    matchPath('/:experimentId/models/:loggedModelId/:tabName', pathname) ||
    matchPath('/:experimentId/models/:loggedModelId', pathname);

  // For compare-runs, the experiment ID is in the query param, not the path
  const compareRunsExpIds = matchPath('/compare-runs', pathname) ? parseQueryParam(search, 'experiments') : [];

  const experimentId =
    (isExpId(expMatch?.params?.experimentId) ? expMatch?.params?.experimentId : undefined) ||
    (compareRunsExpIds.length === 1 ? compareRunsExpIds[0] : undefined);
  const runUuid =
    (isExpId(runMatch?.params?.experimentId) ? runMatch?.params?.runUuid : undefined) ||
    directRunMatch?.params?.runUuid;
  const loggedModelId = isExpId(modelDetailMatch?.params?.experimentId)
    ? modelDetailMatch?.params?.loggedModelId
    : undefined;

  const experimentName = useExperimentName(experimentId);
  const runName = useRunName(runUuid);
  const loggedModelName = useLoggedModelName(loggedModelId);

  const prevJsonRef = useRef<string>('');

  // Wait for entity names to resolve before reporting breadcrumbs.
  // This avoids a flicker where IDs briefly show before display names load.
  const isWaitingForNames = Boolean(experimentId && !experimentName) || Boolean(loggedModelId && !loggedModelName);

  useEffect(() => {
    if (!onBreadcrumbChange) return;
    if (isWaitingForNames) return;

    const segments = buildSegments(pathname, search, experimentName, runName, loggedModelName);
    const json = JSON.stringify(segments);

    // Only call back when segments actually change
    if (json !== prevJsonRef.current) {
      prevJsonRef.current = json;
      onBreadcrumbChange(segments);
    }
  }, [pathname, search, experimentName, runName, loggedModelName, onBreadcrumbChange, isWaitingForNames]);

  return null;
};
