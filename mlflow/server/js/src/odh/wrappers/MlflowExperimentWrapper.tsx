/**
 * MlflowExperimentWrapper
 *
 * Federated entry point for MLflow experiment tracking in ODH dashboard.
 * Provides all MLflow-specific context and renders experiment tracking routes.
 *
 * react-router is NOT shared with the host because the host uses v7 while
 * MLflow is written for v6 (incompatible major versions). Instead, we provide
 * our own BrowserRouter (v6) with a basename matching the host's mount path.
 * Both routers listen to window.history, so URL changes stay in sync.
 *
 * Workspace handling: the host should use `key={workspace}` on this component
 * so that a project switch fully remounts the tree, guaranteeing a clean slate
 * (fresh React Query cache, Apollo cache, BrowserRouter, and component state).
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { ModularArchContextProvider, DeploymentMode } from 'mod-arch-core';
import type { ModularArchConfig } from 'mod-arch-core';
import { BrowserRouter, Routes, useSearchParams } from '../../common/utils/RoutingUtils';
import { ApolloProvider } from '@mlflow/mlflow/src/common/utils/graphQLHooks';
import { extractWorkspaceFromSearchParams, setActiveWorkspace } from '../../workspaces/utils/WorkspaceUtils';

// CSS required by MLflow components. In standalone mode these are loaded by
// app.tsx; in federated mode we must import them here since app.tsx is not
// in the bundle.
import 'font-awesome/css/font-awesome.css';
import '@databricks/design-system/dist/index.css';
import '@databricks/design-system/dist/index-dark.css';

import { RawIntlProvider } from 'react-intl';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import {
  DesignSystemProvider,
  DesignSystemThemeProvider,
  LegacySkeleton,
  DesignSystemEventProvider,
} from '@databricks/design-system';
import store from '../../store';
import { useI18nInit } from '../../i18n/I18nUtils';
import { createApolloClient } from '../../graphql/client';
import { ServerFeaturesProvider } from '../../common/utils/ServerFeaturesContext';
import { DarkThemeProvider } from '../../common/contexts/DarkThemeContext';
import { PATTERN_FLY_TOKEN_TRANSLATION } from '../../common/styles/patternfly/patternflyTokenTranslation';
import '../../common/styles/patternfly/pf-shell-overrides.scss';
import { ThemeProvider as EmotionThemeProvider } from '@emotion/react';
import { telemetryClient } from '../../telemetry';
import { useMLflowDarkTheme } from '../../common/hooks/useMLflowDarkTheme';
import { useEmbeddedLinkInterceptor } from '../../common/hooks/useEmbeddedLinkInterceptor';
import { getExperimentTrackingRouteElements } from './experimentTrackingRoutes';
import { BreadcrumbReporter } from './BreadcrumbReporter';

export interface MlflowExperimentWrapperProps {
  /** Called whenever the in-app route changes with updated breadcrumb segments.
   *  Each segment has { label: string; path: string }. */
  onBreadcrumbChange?: (segments: { label: string; path: string }[]) => void;
}

/**
 * Syncs the workspace query param from the URL to the module-level
 * activeWorkspace variable used by FetchUtils to set X-MLFLOW-WORKSPACE.
 * In standalone mode, this is done by WorkspaceRouterSync in MlflowRouter.
 */
const WorkspaceSync: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const workspace = extractWorkspaceFromSearchParams(searchParams);
    setActiveWorkspace(workspace);
  }, [searchParams]);

  return <>{children}</>;
};

// The host mounts this component at /develop-train/mlflow/experiments/*.
// Our own BrowserRouter needs this as its basename so that relative paths
// within MLflow routes resolve correctly.
const MLFLOW_BASENAME = '/develop-train/mlflow/experiments';

const modularArchConfig: ModularArchConfig = {
  deploymentMode: DeploymentMode.Federated,
  URL_PREFIX: '/mlflow',
  BFF_API_VERSION: 'v1',
};

const MlflowExperimentWrapper: React.FC<MlflowExperimentWrapperProps> = ({ onBreadcrumbChange }) => {
  // Intercept same-origin target="_blank" links to navigate in-place
  // instead of opening new tabs outside the dashboard shell.
  useEmbeddedLinkInterceptor();

  // Synchronously set workspace from URL before the first render of children.
  // This ensures getActiveWorkspace() returns the correct value during the
  // initial render pass (useEffect in WorkspaceSync would be too late).
  useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const workspace = extractWorkspaceFromSearchParams(params);
    if (workspace) setActiveWorkspace(workspace);
  }, []);

  const intl = useI18nInit();
  const apolloClient = useMemo(() => createApolloClient(), []);
  const queryClient = useMemo(() => new QueryClient(), []);
  const routeElements = useMemo(() => getExperimentTrackingRouteElements(), []);
  const [isDarkTheme, setIsDarkTheme] = useMLflowDarkTheme();
  const getPopupContainer = useCallback(() => document.body, []);
  const logObservabilityEvent = useCallback((event: any) => {
    telemetryClient.logEvent(event);
  }, []);

  // Add pf-shell-root to body for CSS scoping of portal content.
  useEffect(() => {
    document.body.classList.add('pf-shell-root');
    return () => document.body.classList.remove('pf-shell-root');
  }, []);

  if (!intl) return <LegacySkeleton />;

  return (
    <div className="mlflow-federated pf-shell-container">
      <ModularArchContextProvider config={modularArchConfig}>
        <ApolloProvider client={apolloClient}>
          <RawIntlProvider value={intl} key={intl.locale}>
            <Provider store={store}>
              <DesignSystemEventProvider callback={logObservabilityEvent}>
                <DesignSystemThemeProvider isDarkMode={isDarkTheme}>
                  <DesignSystemProvider getPopupContainer={getPopupContainer}>
                    <EmotionThemeProvider theme={PATTERN_FLY_TOKEN_TRANSLATION}>
                      <DarkThemeProvider setIsDarkTheme={setIsDarkTheme}>
                        <QueryClientProvider client={queryClient}>
                          <ServerFeaturesProvider>
                            <BrowserRouter basename={MLFLOW_BASENAME}>
                              <WorkspaceSync>
                                <BreadcrumbReporter onBreadcrumbChange={onBreadcrumbChange} />
                                <React.Suspense fallback={<LegacySkeleton />}>
                                  <Routes>{routeElements}</Routes>
                                </React.Suspense>
                              </WorkspaceSync>
                            </BrowserRouter>
                          </ServerFeaturesProvider>
                        </QueryClientProvider>
                      </DarkThemeProvider>
                    </EmotionThemeProvider>
                  </DesignSystemProvider>
                </DesignSystemThemeProvider>
              </DesignSystemEventProvider>
            </Provider>
          </RawIntlProvider>
        </ApolloProvider>
      </ModularArchContextProvider>
    </div>
  );
};

export default MlflowExperimentWrapper;
