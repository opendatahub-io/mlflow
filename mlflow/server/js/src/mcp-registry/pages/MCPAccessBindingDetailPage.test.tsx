import { describe, it, expect } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rest } from 'msw';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { getAjaxUrl } from '@mlflow/mlflow/src/common/utils/FetchUtils';
import { testRoute, TestRouter } from '../../common/utils/RoutingTestUtils';
import { setupServer } from '../../common/utils/setup-msw';
import MCPAccessBindingDetailPage from './MCPAccessBindingDetailPage';
import {
  createMockMCPAccessBinding,
  createMockMCPServerVersion,
  getMockedGetMCPAccessBindingResponse,
  getMockedGetMCPAccessBindingErrorResponse,
  getMockedDeleteMCPAccessBindingResponse,
  getMockedGetMCPServerResponse,
  getMockedSearchMCPServerVersionsResponse,
  getMockedSearchMCPServersResponse,
  createMockMCPServer,
} from '../test-utils';

const mockBinding = createMockMCPAccessBinding({
  id: 'ep-042',
  server_name: 'io.test/server',
  url: 'https://mcp.example.com/fs',
  transport_type: 'streamable-http',
  server_version: '1',
  server_alias: undefined,
  creation_timestamp: 1717520552000,
  last_updated_timestamp: 1717520999000,
  resolved_version: createMockMCPServerVersion({
    name: 'io.test/server',
    version: '1',
    status: 'active',
    server_json: {
      name: 'io.test/server',
      version: '1.0.0',
      title: 'Test Server',
      description: 'A test MCP server',
    },
  }),
});

const defaultHandlers = [
  getMockedGetMCPAccessBindingResponse(mockBinding),
  getMockedDeleteMCPAccessBindingResponse(),
  getMockedGetMCPServerResponse(createMockMCPServer({ name: 'io.test/server' })),
  getMockedSearchMCPServerVersionsResponse([]),
  getMockedSearchMCPServersResponse([]),
];

describe('MCPAccessBindingDetailPage', () => {
  const server = setupServer(...defaultHandlers);

  const renderPage = (initialEntries = ['/mcp-registry/io.test%2Fserver/bindings/ep-042']) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MCPAccessBindingDetailPage />, {
      wrapper: ({ children }) => (
        <IntlProvider locale="en">
          <TestRouter
            routes={[
              testRoute(
                <DesignSystemProvider>
                  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
                </DesignSystemProvider>,
                '/mcp-registry/:serverName/bindings/:bindingId',
              ),
              testRoute(<div data-testid="mcp-registry-list" />, '/mcp-registry'),
              testRoute(<div />, '*'),
            ]}
            initialEntries={initialEntries}
          />
        </IntlProvider>
      ),
    });
  };

  it('renders metadata grid (endpoint URL, transport, MCP server link, version, timestamps)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('https://mcp.example.com/fs')).toBeInTheDocument();
    });
    expect(screen.getByText('Endpoint URL:')).toBeInTheDocument();
    expect(screen.getByText('Streamable HTTP')).toBeInTheDocument();
    expect(screen.getByText('Transport:')).toBeInTheDocument();
    expect(screen.getByText('MCP server:')).toBeInTheDocument();
    expect(screen.getAllByText('io.test/server').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Version/Alias:')).toBeInTheDocument();
    expect(screen.getByText('Last updated:')).toBeInTheDocument();
    expect(screen.getByText('Created at:')).toBeInTheDocument();
  });

  it('renders client configuration JSON block', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Client configuration')).toBeInTheDocument();
    });
  });

  it('shows loading spinner while fetching', () => {
    // Use a delayed handler to keep the loading state
    server.use(
      rest.get(getAjaxUrl('ajax-api/3.0/mlflow/mcp-servers/:name/endpoints/:bindingId'), (_req, res, ctx) =>
        res(ctx.delay('infinite'), ctx.json(mockBinding)),
      ),
    );
    renderPage();
    // The Databricks Spinner renders with this class
    expect(document.querySelector('.du-bois-light-spin')).toBeInTheDocument();
  });

  it('shows error alert when fetch fails', async () => {
    server.use(getMockedGetMCPAccessBindingErrorResponse(500, 'Server error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load access binding')).toBeInTheDocument();
    });
  });

  it('opens edit modal when "Edit binding" clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('https://mcp.example.com/fs')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Edit binding'));
    await waitFor(() => {
      expect(screen.getByText('Edit access binding')).toBeInTheDocument();
    });
  });

  it('opens delete confirmation modal from overflow menu', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('https://mcp.example.com/fs')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menuItem = await screen.findByRole('menuitem');
    await userEvent.click(menuItem);
    await waitFor(() => {
      expect(
        screen.getByText('Are you sure you want to delete this access binding? This action cannot be undone.'),
      ).toBeInTheDocument();
    });
  });

  it('breadcrumb links to MCP Registry page', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('MCP Registry')).toBeInTheDocument();
    });
    const breadcrumbLink = screen.getByText('MCP Registry').closest('a');
    expect(breadcrumbLink?.getAttribute('href')).toContain('/mcp-registry');
  });
});
