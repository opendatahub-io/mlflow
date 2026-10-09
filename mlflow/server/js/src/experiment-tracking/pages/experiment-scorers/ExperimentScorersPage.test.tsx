import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import { IntlProvider } from '@databricks/i18n';
import { DesignSystemProvider } from '@databricks/design-system';
import { QueryClient, QueryClientProvider } from '../../../common/utils/reactQueryHooks';
import { setupServer } from '../../../common/utils/setup-msw';
import ExperimentScorersPage from './ExperimentScorersPage';

// Use the real ODH default (gateway off until server-info reports it) instead of the jest setup's upstream default.
jest.unmock('../../hooks/useServerInfo');
jest.mock('./ExperimentScorersContentContainer', () => ({
  __esModule: true,
  default: () => <div data-testid="scorers-content" />,
}));
jest.mock('./useEvaluateTraces', () => ({
  usePrefetchTraces: jest.fn(),
}));
jest.mock('../../../common/utils/RoutingUtils', () => ({
  useParams: () => ({ experimentId: 'exp-1' }),
}));

const SERVER_INFO_URL = '/ajax-api/3.0/mlflow/server-info';
const BASE_SERVER_INFO = {
  store_type: 'SqlStore',
  workspaces_enabled: false,
  trace_archival_enabled: false,
  multipart_uploads_enabled: false,
  multipart_downloads_enabled: false,
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <IntlProvider locale="en">
        <DesignSystemProvider>
          <ExperimentScorersPage />
        </DesignSystemProvider>
      </IntlProvider>
    </QueryClientProvider>,
  );

const expectEmptyState = () => {
  expect(screen.queryByTestId('scorers-content')).not.toBeInTheDocument();
  expect(screen.getByText('Create and manage judges')).toBeInTheDocument();
};

describe('ExperimentScorersPage gateway gating', () => {
  const server = setupServer();

  it('shows the empty state while server-info loads, then the judges UI when the server enables the gateway', async () => {
    server.use(
      rest.get(SERVER_INFO_URL, (_req, res, ctx) =>
        res(ctx.delay(50), ctx.json({ ...BASE_SERVER_INFO, features_enabled: { gateway: true } })),
      ),
    );
    renderPage();
    expectEmptyState();
    expect(await screen.findByTestId('scorers-content')).toBeInTheDocument();
  });

  it('shows the empty state when the server disables the gateway', async () => {
    let served = false;
    server.use(
      rest.get(SERVER_INFO_URL, (_req, res, ctx) => {
        served = true;
        return res(ctx.json({ ...BASE_SERVER_INFO, features_enabled: { gateway: false } }));
      }),
    );
    renderPage();
    await waitFor(() => expect(served).toBe(true));
    expectEmptyState();
  });

  it('shows the empty state when the server does not report features', async () => {
    let served = false;
    server.use(
      rest.get(SERVER_INFO_URL, (_req, res, ctx) => {
        served = true;
        return res(ctx.json(BASE_SERVER_INFO));
      }),
    );
    renderPage();
    await waitFor(() => expect(served).toBe(true));
    expectEmptyState();
  });

  it('shows the empty state when server-info fails', async () => {
    let served = false;
    server.use(
      rest.get(SERVER_INFO_URL, (_req, res, ctx) => {
        served = true;
        return res(ctx.status(500));
      }),
    );
    renderPage();
    await waitFor(() => expect(served).toBe(true));
    expectEmptyState();
  });
});
