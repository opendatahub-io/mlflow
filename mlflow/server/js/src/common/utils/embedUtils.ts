import { useModularArchContext, DeploymentMode } from 'mod-arch-core';

/**
 * Hook for functional components. Reads deployment mode from
 * ModularArchContextProvider (set in app.tsx for standalone,
 * MlflowExperimentWrapper for federated).
 *
 * Returns false (standalone) when called outside a provider, which
 * happens in tests that don't wrap components in ModularArchContextProvider.
 */
export const useIsIntegrated = (): boolean => {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { config } = useModularArchContext();
    return config.deploymentMode !== DeploymentMode.Standalone;
  } catch {
    return false;
  }
};

/**
 * Function for class components that can't use hooks (MetricView,
 * CompareRunView). Uses DEPLOYMENT_MODE env var set by the federated
 * webpack config. Prefer useIsIntegrated() in functional components.
 */
export const isIntegrated = (): boolean => process.env['DEPLOYMENT_MODE'] === 'federated';

/**
 * Returns the API base URL prefix for federated mode (e.g. '/mlflow').
 * In standalone mode returns empty string (relative URLs work as-is).
 *
 * Used by all getAjaxUrl implementations to prefix API calls so they
 * route through the host's proxy to the MLflow tracking server.
 */
export const getApiBaseUrl = (): string => process.env['MLFLOW_API_BASE_URL'] || '';

/**
 * Prefixes a relative URL with the API base URL if configured.
 * Used in federated mode to route API calls through the host's proxy.
 */
export const prefixApiUrl = (relativeUrl: string): string | null => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return null; // no prefix needed, caller uses its own logic
  const separator = relativeUrl.startsWith('/') ? '' : '/';
  return `${baseUrl}${separator}${relativeUrl}`;
};
