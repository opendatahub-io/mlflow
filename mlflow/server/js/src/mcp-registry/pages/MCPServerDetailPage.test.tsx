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
  getMockedGetLatestMCPServerVersionResponse,
  getMockedUpdateMCPServerResponse,
  getMockedUpdateMCPServerErrorResponse,
  getMockedSetMCPServerTagResponse,
  getMockedDeleteMCPServerTagResponse,
  getMockedSetMCPServerAliasResponse,
  getMockedDeleteMCPServerAliasResponse,
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
  getMockedGetLatestMCPServerVersionResponse(mockVersion),
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
      expect(screen.getByText('1')).toBeInTheDocument();
    });
    expect(screen.getAllByText('active').length).toBeGreaterThanOrEqual(1);
  });

  it('renders version detail metadata', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });
    expect(screen.getAllByText('dev.mainline/mcp').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('A test server')).toBeInTheDocument();
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

  it('opens status update modal when edit status button is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    const editButton = document.querySelector('[data-component-id="mlflow.mcp_registry.detail.edit_status"]') as HTMLElement;
    await userEvent.click(editButton);
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
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('2'));
    await waitFor(() => {
      expect(screen.getByText('Viewing version 2')).toBeInTheDocument();
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
    const menuItems = await screen.findAllByRole('menuitem');
    const deleteItem = menuItems.find((item) => item.textContent === 'Delete');
    expect(deleteItem).toBeDefined();
    await userEvent.click(deleteItem!);
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete this MCP server/)).toBeInTheDocument();
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

  it('pre-selects version from URL query param', async () => {
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

    renderPage(['/mcp-registry/dev.mainline%2Fmcp?version=2']);
    await waitFor(() => {
      expect(screen.getByText('Viewing version 2')).toBeInTheDocument();
      expect(screen.getByText('2.0.0')).toBeInTheDocument();
    });
  });

  it('falls back to first version when URL version param is invalid', async () => {
    renderPage(['/mcp-registry/dev.mainline%2Fmcp?version=nonexistent']);
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });
  });

  it('persists selected version across re-renders', async () => {
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
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Version 2'));
    await waitFor(() => {
      expect(screen.getByText('Viewing version 2')).toBeInTheDocument();
      expect(screen.getByText('2.0.0')).toBeInTheDocument();
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

    const editButton = document.querySelector('[data-component-id="mlflow.mcp_registry.detail.edit_status"]') as HTMLElement;
    await userEvent.click(editButton);
    await waitFor(() => {
      expect(screen.getByText(/terminal state/)).toBeInTheDocument();
    });
  });

  describe('set-as-latest flow', () => {
    it('shows "Pin as latest" for the resolved latest version when not pinned', async () => {
      server.use(getMockedUpdateMCPServerResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
      });

      expect(screen.getByText('Pin as latest')).toBeInTheDocument();
    });

    it('shows "Unpin latest" when version is pinned as latest', async () => {
      const pinnedServer = createMockMCPServer({
        name: 'dev.mainline/mcp',
        display_name: 'Mainline',
        description: 'A test server',
        latest_version: '1',
      });
      server.use(getMockedGetMCPServerResponse(pinnedServer), getMockedUpdateMCPServerResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
      });

      expect(screen.getByText('Unpin latest')).toBeInTheDocument();
    });

    it('shows "Set as latest" for a non-latest version', async () => {
      const version2 = createMockMCPServerVersion({
        name: 'dev.mainline/mcp',
        version: '2',
        status: 'active',
        server_json: { name: 'dev.mainline/mcp', version: '2.0.0' },
      });
      server.use(
        getMockedSearchMCPServerVersionsResponse([mockVersion, version2]),
        getMockedUpdateMCPServerResponse(),
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText('2'));
      await waitFor(() => {
        expect(screen.getByText('Viewing version 2')).toBeInTheDocument();
      });
      expect(screen.getByText('Set as latest')).toBeInTheDocument();
    });

    it('disables set-as-latest for draft versions that are not latest', async () => {
      const draftVersion = createMockMCPServerVersion({
        name: 'dev.mainline/mcp',
        version: '2',
        status: 'draft',
        server_json: { name: 'dev.mainline/mcp', version: '2.0.0' },
      });
      server.use(
        getMockedSearchMCPServerVersionsResponse([mockVersion, draftVersion]),
        getMockedUpdateMCPServerResponse(),
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText('2'));
      await waitFor(() => {
        expect(screen.getByText('Viewing version 2')).toBeInTheDocument();
      });

      const setLatestBtn = document.querySelector('[data-component-id="mlflow.mcp_registry.detail.set_latest"]') as HTMLButtonElement;
      expect(setLatestBtn).toBeDisabled();
    });
  });

  describe('server description editing', () => {
    it('shows server description and edit button', async () => {
      server.use(getMockedUpdateMCPServerResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('A test server')).toBeInTheDocument();
      });

      const editBtn = document.querySelector('[data-component-id="mlflow.mcp_registry.detail.version.edit_description"]') as HTMLElement;
      expect(editBtn).toBeInTheDocument();
    });

    it('shows "Add description" when no description exists', async () => {
      const noDescServer = createMockMCPServer({
        name: 'dev.mainline/mcp',
        display_name: 'Mainline',
      });
      server.use(getMockedGetMCPServerResponse(noDescServer));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
      });

      expect(screen.getByText('Add description')).toBeInTheDocument();
    });

    it('opens description edit modal and saves', async () => {
      server.use(getMockedUpdateMCPServerResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('A test server')).toBeInTheDocument();
      });

      const editBtn = document.querySelector('[data-component-id="mlflow.mcp_registry.detail.version.edit_description"]') as HTMLElement;
      await userEvent.click(editBtn);
      await waitFor(() => {
        expect(screen.getByText('Edit description')).toBeInTheDocument();
      });
    });

    it('shows error in description modal on save failure', async () => {
      server.use(getMockedUpdateMCPServerErrorResponse(500, 'Server error'));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('A test server')).toBeInTheDocument();
      });

      const editBtn = document.querySelector('[data-component-id="mlflow.mcp_registry.detail.version.edit_description"]') as HTMLElement;
      await userEvent.click(editBtn);
      await waitFor(() => {
        expect(screen.getByText('Edit description')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText('Save'));
      await waitFor(() => {
        expect(screen.getByText(/Server error/)).toBeInTheDocument();
      });
    });
  });

  describe('server display name editing', () => {
    it('opens edit display name modal from overflow menu', async () => {
      server.use(getMockedUpdateMCPServerResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getAllByText('Mainline').length).toBeGreaterThanOrEqual(1);
      });

      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      const menuItems = await screen.findAllByRole('menuitem');
      const editItem = menuItems.find((item) => item.textContent === 'Edit display name');
      expect(editItem).toBeDefined();
      await userEvent.click(editItem!);
      await waitFor(() => {
        expect(screen.getByText('Edit display name')).toBeInTheDocument();
      });
    });
  });

  describe('server tags', () => {
    it('shows "Add tags" button when server has no tags', async () => {
      server.use(getMockedSetMCPServerTagResponse(), getMockedDeleteMCPServerTagResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
      });

      expect(screen.getByText('Add tags')).toBeInTheDocument();
    });

    it('shows tags when server has tags', async () => {
      const taggedServer = createMockMCPServer({
        name: 'dev.mainline/mcp',
        display_name: 'Mainline',
        description: 'A test server',
        tags: { env: 'production', team: 'platform' },
      });
      server.use(
        getMockedGetMCPServerResponse(taggedServer),
        getMockedSetMCPServerTagResponse(),
        getMockedDeleteMCPServerTagResponse(),
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('env')).toBeInTheDocument();
        expect(screen.getByText('team')).toBeInTheDocument();
      });
    });
  });

  describe('reset latest version', () => {
    it('shows reset latest version in overflow menu', async () => {
      server.use(getMockedUpdateMCPServerResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getAllByText('Mainline').length).toBeGreaterThanOrEqual(1);
      });

      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      const menuItems = await screen.findAllByRole('menuitem');
      const resetItem = menuItems.find((item) => item.textContent === 'Reset latest version');
      expect(resetItem).toBeDefined();
    });
  });
});
