import { describe, it, expect } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { getAjaxUrl } from '@mlflow/mlflow/src/common/utils/FetchUtils';
import { rest } from 'msw';
import { testRoute, TestRouter } from '../../common/utils/RoutingTestUtils';
import { setupServer } from '../../common/utils/setup-msw';
import MCPRegistryPage from './MCPRegistryPage';
import {
  createMockMCPServer,
  getMockedSearchMCPServersResponse,
  getMockedSearchMCPServersErrorResponse,
} from '../test-utils';

describe('MCPRegistryPage', () => {
  const server = setupServer(getMockedSearchMCPServersResponse([]));

  const renderPage = (initialEntries = ['/']) => {
    const queryClient = new QueryClient();
    render(<MCPRegistryPage />, {
      wrapper: ({ children }) => (
        <IntlProvider locale="en">
          <TestRouter
            routes={[
              testRoute(
                <DesignSystemProvider>
                  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
                </DesignSystemProvider>,
                '/',
              ),
              testRoute(<div />, '*'),
            ]}
            initialEntries={initialEntries}
          />
        </IntlProvider>
      ),
    });
  };

  it('renders page title and tabs', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('MCP Registry')).toBeInTheDocument();
    });
    expect(screen.getByText('Servers')).toBeInTheDocument();
    expect(screen.getByText('Access Bindings')).toBeInTheDocument();
  });

  it('renders empty state when no servers exist', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Create and manage MCP servers using MLflow.')).toBeInTheDocument();
    });
  });

  it('renders server cards when data is available', async () => {
    const servers = [
      createMockMCPServer({ name: 'server-1', display_name: 'My Server 1' }),
      createMockMCPServer({ name: 'server-2', display_name: 'My Server 2' }),
    ];
    server.use(getMockedSearchMCPServersResponse(servers));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('My Server 1')).toBeInTheDocument();
      expect(screen.getByText('My Server 2')).toBeInTheDocument();
    });
  });

  it('converts plain text search into a valid name filter', async () => {
    let capturedFilterString: string | null = null;
    server.use(
      rest.get(getAjaxUrl('ajax-api/3.0/mlflow/mcp-servers'), (req, res, ctx) => {
        capturedFilterString = req.url.searchParams.get('filter_string');
        return res(
          ctx.json({
            mcp_servers: [createMockMCPServer({ name: 'io.github.demo/raw-name-only' })],
            next_page_token: undefined,
          }),
        );
      }),
    );
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search MCP servers by name');
    await userEvent.type(searchInput, 'raw');

    await waitFor(() => {
      expect(capturedFilterString).toBe("name ILIKE '%raw%'");
    });
  });

  it('shows Create MCP server button when servers exist', async () => {
    const servers = [createMockMCPServer({ name: 's1', display_name: 'Server 1' })];
    server.use(getMockedSearchMCPServersResponse(servers));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Server 1')).toBeInTheDocument();
    });
    expect(screen.getByText('Create MCP server')).toBeInTheDocument();
  });

  it('renders error alert when API fails', async () => {
    server.use(getMockedSearchMCPServersErrorResponse(500, 'Something broke'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Something broke')).toBeInTheDocument();
    });
  });

  it('switches to access bindings tab', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('MCP Registry')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Access Bindings'));

    await waitFor(() => {
      expect(screen.getByText('Create and manage direct access endpoints for your MCP servers.')).toBeInTheDocument();
    });
  });
});
