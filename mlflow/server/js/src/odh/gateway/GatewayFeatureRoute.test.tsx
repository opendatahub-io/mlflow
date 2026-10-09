import { jest, describe, test, expect } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { rest } from 'msw';
import { DesignSystemProvider } from '@databricks/design-system';
import { MemoryRouter, Route, Routes, useLocation } from '../../common/utils/RoutingUtils';
import { QueryClientProvider } from '../../common/utils/reactQueryHooks';
import { createMlflowQueryClient } from '../../shared/web-shared/query-client/createMlflowQueryClient';
import { setupServer } from '../../common/utils/setup-msw';
import { ServerInfoProvider } from '../../experiment-tracking/hooks/useServerInfo';
import { withGatewayFeature } from './GatewayFeatureRoute';

// Use the real ODH default (gateway off until server-info reports it) instead of the jest setup's upstream default.
jest.unmock('../../experiment-tracking/hooks/useServerInfo');

const SERVER_INFO_URL = '/ajax-api/3.0/mlflow/server-info';
const BASE_SERVER_INFO = {
  store_type: 'SqlStore',
  workspaces_enabled: false,
  trace_archival_enabled: false,
  multipart_uploads_enabled: false,
  multipart_downloads_enabled: false,
};

const LocationProbe = () => {
  const { pathname } = useLocation();
  return <span data-testid="location">{pathname}</span>;
};

// Renders immediately, without waiting for server-info, so the loading state is observable.
const renderPlaygroundRoute = () =>
  render(
    <QueryClientProvider client={createMlflowQueryClient()}>
      <ServerInfoProvider>
        <DesignSystemProvider>
          <MemoryRouter initialEntries={['/experiments/4/playground']}>
            <LocationProbe />
            <Routes>
              <Route path="/experiments/:experimentId" element={<span>experiment default page</span>} />
              <Route
                path="/experiments/:experimentId/playground"
                element={withGatewayFeature(<span>playground page</span>)}
              />
            </Routes>
          </MemoryRouter>
        </DesignSystemProvider>
      </ServerInfoProvider>
    </QueryClientProvider>,
  );

describe('withGatewayFeature', () => {
  const server = setupServer();

  test('renders the page when server-info enables the gateway', async () => {
    server.use(
      rest.get(SERVER_INFO_URL, (_req, res, ctx) =>
        res(ctx.json({ ...BASE_SERVER_INFO, features_enabled: { gateway: true } })),
      ),
    );
    renderPlaygroundRoute();

    expect(await screen.findByText('playground page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/experiments/4/playground');
  });

  test('waits on a skeleton while server-info is unknown, without rendering or redirecting', async () => {
    server.use(
      rest.get(SERVER_INFO_URL, (_req, res, ctx) =>
        res(ctx.delay(100), ctx.json({ ...BASE_SERVER_INFO, features_enabled: { gateway: true } })),
      ),
    );
    const { container } = renderPlaygroundRoute();

    expect(container.querySelector('[class$="-skeleton"]')).toBeInTheDocument();
    expect(screen.queryByText('playground page')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/experiments/4/playground');

    expect(await screen.findByText('playground page')).toBeInTheDocument();
  });

  test.each([
    [
      'disables the gateway',
      rest.get(SERVER_INFO_URL, (_req, res, ctx) =>
        res(ctx.json({ ...BASE_SERVER_INFO, features_enabled: { gateway: false } })),
      ),
    ],
    ['does not report features', rest.get(SERVER_INFO_URL, (_req, res, ctx) => res(ctx.json(BASE_SERVER_INFO)))],
    ['fails', rest.get(SERVER_INFO_URL, (_req, res) => res.networkError('server-info unreachable'))],
  ])('redirects to the experiment page when server-info %s', async (_name, handler) => {
    server.use(handler);
    renderPlaygroundRoute();

    expect(await screen.findByText('experiment default page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/experiments\/4$/);
    expect(screen.queryByText('playground page')).not.toBeInTheDocument();
  });
});
