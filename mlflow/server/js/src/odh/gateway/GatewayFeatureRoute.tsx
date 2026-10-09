import React, { useEffect } from 'react';
import { LegacySkeleton } from '@databricks/design-system';
import { useNavigate, useParams } from '../../common/utils/RoutingUtils';
import Routes from '../../experiment-tracking/routes';
import { SERVER_FEATURE_KEYS, useFeatureEnabled, useServerInfo } from '../../experiment-tracking/hooks/useServerInfo';

/**
 * Renders a gateway-backed experiment page only when server-info enables the AI Gateway. Otherwise it
 * replaces the URL with the experiment page, which picks the default tab, so a bookmarked or typed URL
 * does not open a page whose APIs return 501.
 */
export const GatewayFeatureRoute = ({ children }: { children: React.ReactNode }) => {
  const { isLoading } = useServerInfo();
  const gatewayEnabled = useFeatureEnabled(SERVER_FEATURE_KEYS.GATEWAY);
  const { experimentId } = useParams();
  const navigate = useNavigate();
  const shouldRedirect = !isLoading && !gatewayEnabled;

  useEffect(() => {
    if (shouldRedirect) {
      navigate(experimentId ? Routes.getExperimentPageRoute(experimentId) : Routes.experimentsObservatoryRoute, {
        replace: true,
      });
    }
  }, [shouldRedirect, experimentId, navigate]);

  if (gatewayEnabled) {
    return <>{children}</>;
  }
  return isLoading ? <LegacySkeleton /> : null;
};

/** JSX-free form for route definitions in `.ts` files such as `route-defs.ts`. */
export const withGatewayFeature = (element: React.ReactElement) =>
  React.createElement(GatewayFeatureRoute, null, element);
