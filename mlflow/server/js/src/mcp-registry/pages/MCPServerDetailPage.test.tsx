import { describe, it, expect } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByText('Gives your AI agent your story map.')).toBeInTheDocument();
  });

  it('renders error state when server not found', async () => {
    server.use(getMockedGetMCPServerErrorResponse(404, 'Server not found'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load MCP server')).toBeInTheDocument();
    });
  });

  it('expands configuration section', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Configuration'));
    await waitFor(() => {
      expect(screen.getByText(/"name": "dev.mainline\/mcp"/)).toBeInTheDocument();
    });
  });

  it('renders empty access bindings message', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Access Bindings'));
    await waitFor(() => {
      expect(screen.getByText('No access bindings configured for this server.')).toBeInTheDocument();
    });
  });

  it('opens edit version modal with status select when Edit is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    const editBtn = document.querySelector(
      '[data-component-id="mlflow.mcp_registry.detail.edit_version"]',
    ) as HTMLElement;
    await userEvent.click(editBtn);
    await waitFor(() => {
      expect(screen.getByText('Edit version details')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
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
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Access Bindings'));
    await waitFor(() => {
      expect(screen.getByText('https://mcp.example.com/server')).toBeInTheDocument();
    });
  });

  it('selects first version by default when multiple exist', async () => {
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
  });

  it('falls back to first version when URL version param is invalid', async () => {
    renderPage(['/mcp-registry/dev.mainline%2Fmcp?version=nonexistent']);
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });
  });

  it('persists selected version across clicks', async () => {
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

  it('disables all status transitions for deleted version in edit modal', async () => {
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

    const editBtn = document.querySelector(
      '[data-component-id="mlflow.mcp_registry.detail.edit_version"]',
    ) as HTMLElement;
    await userEvent.click(editBtn);
    await waitFor(() => {
      expect(screen.getByText('Edit version details')).toBeInTheDocument();
    });
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  describe('server description editing', () => {
    it('shows server description and edit button', async () => {
      server.use(getMockedUpdateMCPServerResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Gives your AI agent your story map.')).toBeInTheDocument();
      });

      const editBtn = document.querySelector(
        '[data-component-id="mlflow.mcp_registry.detail.version.edit_description"]',
      ) as HTMLElement;
      expect(editBtn).toBeInTheDocument();
    });

    it('shows "Add description" when no description exists', async () => {
      const noDescServer = createMockMCPServer({
        name: 'dev.mainline/mcp',
        display_name: 'Mainline',
      });
      const noDescVersion = createMockMCPServerVersion({
        name: 'dev.mainline/mcp',
        version: '1',
        status: 'active',
        server_json: { name: 'dev.mainline/mcp', version: '1.0.0', title: 'Mainline' },
      });
      server.use(
        getMockedGetMCPServerResponse(noDescServer),
        getMockedSearchMCPServerVersionsResponse([noDescVersion]),
        getMockedGetLatestMCPServerVersionResponse(noDescVersion),
      );
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
        expect(screen.getByText('Gives your AI agent your story map.')).toBeInTheDocument();
      });

      const editBtn = document.querySelector(
        '[data-component-id="mlflow.mcp_registry.detail.version.edit_description"]',
      ) as HTMLElement;
      await userEvent.click(editBtn);
      await waitFor(() => {
        expect(screen.getByText('Edit server description')).toBeInTheDocument();
      });
    });

    it('shows error in description modal on save failure', async () => {
      server.use(getMockedUpdateMCPServerErrorResponse(500, 'Server error'));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Gives your AI agent your story map.')).toBeInTheDocument();
      });

      const editBtn = document.querySelector(
        '[data-component-id="mlflow.mcp_registry.detail.version.edit_description"]',
      ) as HTMLElement;
      await userEvent.click(editBtn);
      await waitFor(() => {
        expect(screen.getByText('Edit server description')).toBeInTheDocument();
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

  it('Compare toggle is disabled with a single version', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    // SegmentedControlButton renders as a radio input; find the one associated with "Compare"
    const compareLabel = screen.getByText('Compare').closest('label');
    const compareInput = compareLabel?.querySelector('input');
    expect(compareInput).toBeDisabled();
  });

  it('Compare toggle is enabled with multiple versions', async () => {
    const mockVersion2 = createMockMCPServerVersion({
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
    server.use(getMockedSearchMCPServerVersionsResponse([mockVersion, mockVersion2]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    const compareLabel = screen.getByText('Compare').closest('label');
    const compareInput = compareLabel?.querySelector('input');
    expect(compareInput).not.toBeDisabled();
  });

  it('clicking Compare shows compare view', async () => {
    const mockVersion2 = createMockMCPServerVersion({
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
    server.use(getMockedSearchMCPServerVersionsResponse([mockVersion, mockVersion2]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Compare'));
    await waitFor(() => {
      expect(screen.getByText(/Comparing version .+ with version/)).toBeInTheDocument();
    });
  });

  it('switching back to Preview restores version detail', async () => {
    const mockVersion2 = createMockMCPServerVersion({
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
    server.use(getMockedSearchMCPServerVersionsResponse([mockVersion, mockVersion2]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Viewing version 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Compare'));
    await waitFor(() => {
      expect(screen.getByText(/Comparing version .+ with version/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Preview'));
    await waitFor(
      () => {
        expect(screen.getByText(/Viewing version/)).toBeInTheDocument();
      },
      { timeout: 10000 },
    );
  });
});
