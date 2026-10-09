import React from 'react';
import { LegacySkeleton } from '@databricks/design-system';
import { useWorkspacesEnabled } from '../../experiment-tracking/hooks/useServerInfo';

/**
 * Holds federated pages on a skeleton until server-info resolves, like MlflowRouter does in standalone.
 * Render paths read server features synchronously (`getFeatureEnabledSync`), and nothing re-renders
 * them when server-info arrives. A failed or timed-out request resolves to upstream's defaults, so
 * this never waits longer than `SERVER_INFO_TIMEOUT_MS`. Must render inside `ServerInfoProvider`.
 */
export const ServerInfoGate = ({ children }: { children: React.ReactNode }) => {
  const { loading } = useWorkspacesEnabled();
  return loading ? <LegacySkeleton /> : <>{children}</>;
};
