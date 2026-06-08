import { describe, it, expect } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { testRoute, TestRouter } from '../../common/utils/RoutingTestUtils';
import { setupServer } from '../../common/utils/setup-msw';
import MCPServerDetailPage from './MCPServerDetailPage';
import {
  createMockMCPServer,
  createMockMCPServerVersion,
  createMockMCPAccessBinding,
  getMockedGetMCPServerResponse,
  getMockedGetMCPServerErrorResponse,
  getMockedSearchMCPServerVersionsResponse,
  getMockedSearchMCPAccessBindingsResponse,
  getMockedDeleteMCPServerVersionResponse,
  getMockedDeleteMCPServerResponse,
} from '../test-utils';

const mockServer = createMockMCPServer({
  name: 'dev.mainline/mcp',
  display_name: 'Mainline',
  description: 'A test server',
});
const mockVersion = createMockMCPServerVersion({
  name: 'dev.mainline/mcp',
  version: '1',
  status: 'active',
  server_json: {
    name: 'dev.mainline/mcp',
    version: '1.0.0',
    title: 'Mainline',
    description: 'Gives your AI agent your story map.',
  },
});

const defaultHandlers = [
  getMockedGetMCPServerResponse(mockServer),
  getMockedSearchMCPServerVersionsResponse([mockVersion]),
  getMockedSearchMCPAccessBindingsResponse([]),
  getMockedDeleteMCPServerVersionResponse(),
  getMockedDeleteMCPServerResponse(),
];

describe('MCPServerDetailPage', () => {
  const server = setupServer(...defaultHandlers);

  const renderPage = (initialEntries = ['/mcp-registry/dev.mainline%2Fmcp']) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MCPServerDetailPage />, {
      wrapper: ({ children }) => (
        <IntlProvider locale="en">
          <TestRouter
            routes={[
              testRoute(
                <DesignSystemProvider>
                  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
                </DesignSystemProvider>,
                '/mcp-registry/:serverName',
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

  it('renders breadcrumb and server name', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Mainline').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('MCP Registry').length).toBeGreaterThanOrEqual(1);
  });

  it('renders version list with status badge', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Version 1')).toBeInTheDocument();
    });
    expect(screen.getAllByText('active').length).toBeGreaterThanOrEqual(1);
  });

  it('renders version detail metadata', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });
    expect(screen.getAllByText('dev.mainline/mcp').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Display name:')).toBeInTheDocument();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Gives your AI agent your story map.')).toBeInTheDocument();
  });

  it('renders error state when server not found', async () => {
    server.use(getMockedGetMCPServerErrorResponse(404, 'Server not found'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load MCP server')).toBeInTheDocument();
    });
  });

  it('expands JSON viewer', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('View full configuration'));
    await waitFor(() => {
      expect(screen.getByText(/"name": "dev.mainline\/mcp"/)).toBeInTheDocument();
    });
  });

  it('renders empty access bindings message', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No access bindings configured for this server.')).toBeInTheDocument();
    });
  });

  it('opens status update modal when Edit is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Edit'));
    await waitFor(() => {
      expect(screen.getByText('Update version status')).toBeInTheDocument();
      expect(screen.getByText('Current status:')).toBeInTheDocument();
    });
  });

  it('selects different version when multiple exist', async () => {
    const version2 = createMockMCPServerVersion({
      name: 'dev.mainline/mcp',
      version: '2',
      status: 'draft',
      server_json: {
        name: 'dev.mainline/mcp',
        version: '2.0.0',
        title: 'Mainline v2',
        description: 'Updated version.',
      },
    });
    server.use(getMockedSearchMCPServerVersionsResponse([mockVersion, version2]));

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Version 1')).toBeInTheDocument();
      expect(screen.getByText('Version 2')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Version 2'));
    await waitFor(() => {
      expect(screen.getByText('Viewing version 2')).toBeInTheDocument();
      expect(screen.getByText('2.0.0')).toBeInTheDocument();
    });
  });

  it('opens delete version confirmation modal', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /Delete version/ }));
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete version/)).toBeInTheDocument();
    });
  });

  it('opens delete server confirmation modal from overflow menu', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Mainline').length).toBeGreaterThanOrEqual(1);
    });

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menuItem = await screen.findByRole('menuitem');
    await userEvent.click(menuItem);
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete this MCP server/)).toBeInTheDocument();
    });
  });

  it('opens usage example modal', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /Use/ }));
    await waitFor(() => {
      expect(screen.getByText('Usage example')).toBeInTheDocument();
    });
  });

  it('renders access bindings table when bindings exist', async () => {
    const binding = createMockMCPAccessBinding({
      server_name: 'dev.mainline/mcp',
      endpoint_url: 'https://mcp.example.com/server',
      transport_type: 'streamable-http',
      server_version: '1',
    });
    server.use(getMockedSearchMCPAccessBindingsResponse([binding]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('https://mcp.example.com/server')).toBeInTheDocument();
    });
  });

  it('shows terminal state warning for deleted version status', async () => {
    const deletedVersion = createMockMCPServerVersion({
      name: 'dev.mainline/mcp',
      version: '1',
      status: 'deleted',
      server_json: {
        name: 'dev.mainline/mcp',
        version: '1.0.0',
        title: 'Mainline',
        description: 'Deleted version.',
      },
    });
    server.use(getMockedSearchMCPServerVersionsResponse([deletedVersion]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Edit'));
    await waitFor(() => {
      expect(screen.getByText(/terminal state/)).toBeInTheDocument();
    });
  });
});
