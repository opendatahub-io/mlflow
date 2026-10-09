import { jest, describe, test, expect } from '@jest/globals';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import { DesignSystemProvider } from '@databricks/design-system';
import { IntlProvider } from '@databricks/i18n';
import { QueryClientProvider } from '../../common/utils/reactQueryHooks';
import { createMlflowQueryClient } from '../../shared/web-shared/query-client/createMlflowQueryClient';
import { setupServer } from '../../common/utils/setup-msw';
import {
  getFeatureEnabledSync,
  SERVER_FEATURE_KEYS,
  ServerInfoProvider,
  useFeatureEnabled,
} from '../../experiment-tracking/hooks/useServerInfo';
import { isEvaluatingTracesInDetailsViewEnabled } from '../../shared/web-shared/model-trace-explorer/FeatureUtils';
import { EvalRunsEmptyStateCard } from '../../experiment-tracking/pages/experiment-evaluation-runs/EvalRunsEmptyStateCard';
import { ServerInfoGate } from '../wrappers/ServerInfoGate';

/**
 * ODH coverage for the production gateway default. `src/odh/setupTests.js` restores upstream's `true`
 * default for upstream tests, so these tests unmock it and drive server-info over the network.
 * The Judges page is covered the same way in `ExperimentScorersPage.test.tsx`, the Playground guard in
 * `GatewayFeatureRoute.test.tsx`, and the federated wrapper's wait in `MlflowWrapperBase.test.tsx`.
 */
jest.unmock('../../experiment-tracking/hooks/useServerInfo');

jest.mock('../../experiment-tracking/pages/experiment-overview/hooks/useTraceMetricsQuery', () => ({
  useTraceMetricsQuery: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('../../experiment-tracking/pages/experiment-evaluation-runs/RunEvaluationButton', () => ({
  RunEvaluationButton: () => <button data-testid="run-evaluation-button">Evaluate traces</button>,
}));
jest.mock('../../assistant', () => ({
  useAssistant: () => ({ canUseAssistant: false, openPanel: jest.fn(), prefillPrompt: jest.fn() }),
  AssistantSparkleIcon: () => null,
}));

const SERVER_INFO_URL = '/ajax-api/3.0/mlflow/server-info';
const BASE_SERVER_INFO = {
  store_type: 'SqlStore',
  workspaces_enabled: false,
  trace_archival_enabled: false,
  multipart_uploads_enabled: false,
  multipart_downloads_enabled: false,
};

const RESOLVED_STATES = [
  {
    name: 'server-info enables the gateway',
    handler: rest.get(SERVER_INFO_URL, (_req, res, ctx) =>
      res(ctx.json({ ...BASE_SERVER_INFO, features_enabled: { gateway: true } })),
    ),
    enabled: true,
  },
  {
    name: 'server-info disables the gateway',
    handler: rest.get(SERVER_INFO_URL, (_req, res, ctx) =>
      res(ctx.json({ ...BASE_SERVER_INFO, features_enabled: { gateway: false } })),
    ),
    enabled: false,
  },
  {
    name: 'server-info does not report features',
    handler: rest.get(SERVER_INFO_URL, (_req, res, ctx) => res(ctx.json(BASE_SERVER_INFO))),
    enabled: false,
  },
  {
    name: 'server-info fails',
    handler: rest.get(SERVER_INFO_URL, (_req, res) => res.networkError('server-info unreachable')),
    enabled: false,
  },
];

const PENDING_HANDLER = rest.get(SERVER_INFO_URL, (_req, res, ctx) =>
  res(ctx.delay(100), ctx.json({ ...BASE_SERVER_INFO, features_enabled: { gateway: true } })),
);

const FeatureProbe = () => (
  <>
    <span data-testid="hook">{String(useFeatureEnabled(SERVER_FEATURE_KEYS.GATEWAY))}</span>
    <span data-testid="sync">{String(getFeatureEnabledSync(SERVER_FEATURE_KEYS.GATEWAY))}</span>
    <span data-testid="run-judge">{String(isEvaluatingTracesInDetailsViewEnabled())}</span>
  </>
);

/**
 * `gated` mirrors the federated wrapper and MlflowRouter, which render pages only after server-info
 * resolves. Without it the children render while server-info is still pending.
 */
const renderWithServerInfo = (children: React.ReactNode, { gated }: { gated: boolean }) =>
  render(
    <QueryClientProvider client={createMlflowQueryClient()}>
      <ServerInfoProvider>
        <IntlProvider locale="en">
          <DesignSystemProvider>{gated ? <ServerInfoGate>{children}</ServerInfoGate> : children}</DesignSystemProvider>
        </IntlProvider>
      </ServerInfoProvider>
    </QueryClientProvider>,
  );

describe('gateway feature default (ODH)', () => {
  const server = setupServer();

  describe('useFeatureEnabled, getFeatureEnabledSync and the run-judge gate', () => {
    test('are off while server-info is pending', async () => {
      server.use(PENDING_HANDLER);
      renderWithServerInfo(<FeatureProbe />, { gated: false });

      expect(screen.getByTestId('hook')).toHaveTextContent('false');
      expect(screen.getByTestId('sync')).toHaveTextContent('false');
      expect(screen.getByTestId('run-judge')).toHaveTextContent('false');

      // The hook subscribes and turns on once server-info arrives.
      await waitFor(() => expect(screen.getByTestId('hook')).toHaveTextContent('true'));
    });

    test.each(RESOLVED_STATES)('follow the server when $name', async ({ handler, enabled }) => {
      server.use(handler);
      renderWithServerInfo(<FeatureProbe />, { gated: true });

      expect(await screen.findByTestId('hook')).toHaveTextContent(String(enabled));
      expect(screen.getByTestId('sync')).toHaveTextContent(String(enabled));
      expect(screen.getByTestId('run-judge')).toHaveTextContent(String(enabled));
    });
  });

  describe('EvalRunsEmptyStateCard "Evaluate traces" CTA', () => {
    test('is hidden while server-info is pending', () => {
      server.use(PENDING_HANDLER);
      renderWithServerInfo(<EvalRunsEmptyStateCard experimentId="42" />, { gated: false });

      expect(screen.queryByTestId('run-evaluation-button')).not.toBeInTheDocument();
    });

    test.each(RESOLVED_STATES)('follows the server when $name', async ({ handler, enabled }) => {
      server.use(handler);
      renderWithServerInfo(
        <>
          <span>resolved</span>
          <EvalRunsEmptyStateCard experimentId="42" />
        </>,
        { gated: true },
      );

      await screen.findByText('resolved');
      if (enabled) {
        expect(screen.getByTestId('run-evaluation-button')).toBeInTheDocument();
      } else {
        expect(screen.queryByTestId('run-evaluation-button')).not.toBeInTheDocument();
      }
    });
  });
});
