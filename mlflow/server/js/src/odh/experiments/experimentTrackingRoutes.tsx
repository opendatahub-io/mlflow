/**
 * Experiment tracking route definitions for federated (Module Federation) mode.
 *
 * These are adapted from experiment-tracking/route-defs.ts but use relative paths
 * (no leading '/') since the host mounts this component at a wildcard route like
 * /develop-train/mlflow/experiments/*
 *
 * The route structure mirrors the standalone route-defs.ts but strips the
 * createMLflowRoutePath prefix (which is an identity function anyway).
 */
import React from 'react';
import { Route, createLazyRouteElement } from '../../common/utils/RoutingUtils';

/**
 * Returns Route elements for experiment tracking pages.
 * Used inside a <Routes> component in the wrapper.
 */
export const getExperimentTrackingRouteElements = () => (
  <>
    {/* Experiment list */}
    <Route
      index
      element={createLazyRouteElement(() => import('../../experiment-tracking/components/ExperimentListView'))}
    />

    {/* Single experiment with tabs */}
    <Route
      path=":experimentId"
      element={createLazyRouteElement(
        () => import('../../experiment-tracking/pages/experiment-page-tabs/ExperimentPageTabs'),
      )}
    >
      <Route
        path="overview/:overviewTab?"
        element={createLazyRouteElement(
          () => import('../../experiment-tracking/pages/experiment-overview/ExperimentGenAIOverviewPage'),
        )}
      />
      <Route
        path="runs"
        element={createLazyRouteElement(
          () => import('../../experiment-tracking/pages/experiment-runs/ExperimentRunsPage'),
        )}
      />
      <Route
        path="traces"
        element={createLazyRouteElement(
          () => import('../../experiment-tracking/pages/experiment-traces/ExperimentTracesPage'),
        )}
      />
      <Route
        path="chat-sessions"
        element={createLazyRouteElement(
          () => import('../../experiment-tracking/pages/experiment-chat-sessions/ExperimentChatSessionsPage'),
        )}
      />
      <Route
        path="chat-sessions/:sessionId"
        element={createLazyRouteElement(
          () =>
            import('../../experiment-tracking/pages/experiment-chat-sessions/single-chat-view/ExperimentSingleChatSessionPage'),
        )}
      />
      <Route
        path="models"
        element={createLazyRouteElement(
          () => import('../../experiment-tracking/pages/experiment-logged-models/ExperimentLoggedModelListPage'),
        )}
      />
      <Route
        path="evaluation-runs"
        element={createLazyRouteElement(
          () => import('../../experiment-tracking/pages/experiment-evaluation-runs/ExperimentEvaluationRunsPage'),
        )}
      />
      <Route
        path="judges"
        element={createLazyRouteElement(
          () => import('../../experiment-tracking/pages/experiment-scorers/ExperimentScorersPage'),
        )}
      />
      <Route
        path="datasets"
        element={createLazyRouteElement(
          () =>
            import('../../experiment-tracking/pages/experiment-evaluation-datasets/ExperimentEvaluationDatasetsPage'),
        )}
      />
      <Route
        path="prompts"
        element={createLazyRouteElement(() => import('../../experiment-tracking/pages/prompts/ExperimentPromptsPage'))}
      />
      <Route
        path="prompts/:promptName"
        element={createLazyRouteElement(
          () => import('../../experiment-tracking/pages/prompts/ExperimentPromptDetailsPage'),
        )}
      />
    </Route>

    {/* Logged model details */}
    <Route
      path=":experimentId/models/:loggedModelId/:tabName"
      element={createLazyRouteElement(
        () => import('../../experiment-tracking/pages/experiment-logged-models/ExperimentLoggedModelDetailsPage'),
      )}
    />
    <Route
      path=":experimentId/models/:loggedModelId"
      element={createLazyRouteElement(
        () => import('../../experiment-tracking/pages/experiment-logged-models/ExperimentLoggedModelDetailsPage'),
      )}
    />

    {/* Run pages */}
    <Route
      path=":experimentId/runs/:runUuid/*"
      element={createLazyRouteElement(() => import('../../experiment-tracking/components/run-page/RunPage'))}
    />

    {/* Direct run page (no experiment context) */}
    <Route
      path="runs/:runUuid"
      element={createLazyRouteElement(() => import('../../experiment-tracking/components/DirectRunPage'))}
    />

    {/* Compare pages */}
    <Route
      path="compare-experiments/:searchString"
      element={createLazyRouteElement(
        () => import('../../experiment-tracking/components/experiment-page/ExperimentPage'),
      )}
    />
    <Route
      path="compare-runs"
      element={createLazyRouteElement(() => import('../../experiment-tracking/components/CompareRunPage'))}
    />

    {/* Metric page */}
    <Route
      path="metric/*"
      element={createLazyRouteElement(() => import('../../experiment-tracking/components/MetricPage'))}
    />

    {/* Prompts (top-level) */}
    <Route
      path="prompts"
      element={createLazyRouteElement(() => import('../../experiment-tracking/pages/prompts/PromptsPage'))}
    />
    <Route
      path="prompts/:promptName"
      element={createLazyRouteElement(() => import('../../experiment-tracking/pages/prompts/PromptsDetailsPage'))}
    />
  </>
);
