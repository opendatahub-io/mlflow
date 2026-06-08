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

  it('sends max_results query parameter to the API', async () => {
    let capturedMaxResults: string | null = null;
    server.use(
      rest.get(getAjaxUrl('ajax-api/3.0/mlflow/mcp-servers'), (req, res, ctx) => {
        capturedMaxResults = req.url.searchParams.get('max_results');
        return res(ctx.json({ mcp_servers: [], next_page_token: undefined }));
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(capturedMaxResults).toBe('25');
    });
  });

  it('resets pagination when search filter changes', async () => {
    const capturedPageTokens: (string | null)[] = [];
    server.use(
      rest.get(getAjaxUrl('ajax-api/3.0/mlflow/mcp-servers'), (req, res, ctx) => {
        capturedPageTokens.push(req.url.searchParams.get('page_token'));
        return res(
          ctx.json({
            mcp_servers: [createMockMCPServer({ name: 'server-1', display_name: 'Test' })],
            next_page_token: 'token-abc',
          }),
        );
      }),
    );
    renderPage();

    // Wait for initial load (grid view has pagination now)
    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    // Click next to go to page 2
    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(capturedPageTokens).toContain('token-abc');
    });

    // Now type a search filter — should reset page_token to null
    const searchInput = screen.getByPlaceholderText('Search MCP servers by name');
    await userEvent.type(searchInput, 'test');

    await waitFor(() => {
      const lastToken = capturedPageTokens[capturedPageTokens.length - 1];
      expect(lastToken).toBeNull();
    });
  });

  it('renders pagination controls in grid view', async () => {
    const servers = [createMockMCPServer({ name: 'server-1', display_name: 'Server 1' })];
    server.use(
      rest.get(getAjaxUrl('ajax-api/3.0/mlflow/mcp-servers'), (_req, res, ctx) =>
        res(ctx.json({ mcp_servers: servers, next_page_token: 'next-token' })),
      ),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Server 1')).toBeInTheDocument();
    });
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Previous')).toBeInTheDocument();
  });

  it('renders page size selector in grid view', async () => {
    const servers = [createMockMCPServer({ name: 'server-1', display_name: 'Server 1' })];
    server.use(getMockedSearchMCPServersResponse(servers));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Server 1')).toBeInTheDocument();
    });
    expect(screen.getByText('25 / page')).toBeInTheDocument();
  });

  it('passes SQL filter syntax through without modification', async () => {
    let capturedFilterString: string | null = null;
    server.use(
      rest.get(getAjaxUrl('ajax-api/3.0/mlflow/mcp-servers'), (req, res, ctx) => {
        capturedFilterString = req.url.searchParams.get('filter_string');
        return res(ctx.json({ mcp_servers: [], next_page_token: undefined }));
      }),
    );
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search MCP servers by name');
    await userEvent.type(searchInput, "status = 'active'");

    await waitFor(() => {
      expect(capturedFilterString).toBe("status = 'active'");
    });
  });

  it('does not call API on every keystroke due to debounce', async () => {
    let callCount = 0;
    server.use(
      rest.get(getAjaxUrl('ajax-api/3.0/mlflow/mcp-servers'), (_req, res, ctx) => {
        callCount++;
        return res(ctx.json({ mcp_servers: [], next_page_token: undefined }));
      }),
    );
    renderPage();

    // Wait for initial load
    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(1);
    });
    const initialCallCount = callCount;

    // Type multiple characters quickly
    const searchInput = screen.getByPlaceholderText('Search MCP servers by name');
    await userEvent.type(searchInput, 'abcdef');

    // Wait for debounce to settle (500ms)
    await waitFor(
      () => {
        expect(callCount).toBeGreaterThan(initialCallCount);
      },
      { timeout: 2000 },
    );

    expect(callCount).toBeLessThan(initialCallCount + 6);
  });

  it('keeps previous data visible while loading new search results', async () => {
    const servers = [createMockMCPServer({ name: 'server-1', display_name: 'Original Server' })];
    server.use(
      rest.get(getAjaxUrl('ajax-api/3.0/mlflow/mcp-servers'), (req, res, ctx) => {
        const filter = req.url.searchParams.get('filter_string');
        if (filter) {
          return res(
            ctx.delay(200),
            ctx.json({
              mcp_servers: [createMockMCPServer({ name: 's2', display_name: 'Filtered Server' })],
              next_page_token: undefined,
            }),
          );
        }
        return res(ctx.json({ mcp_servers: servers, next_page_token: undefined }));
      }),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Original Server')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search MCP servers by name');
    await userEvent.type(searchInput, 'test');

    // Old data should still be visible during the loading period
    await waitFor(() => {
      expect(screen.getByText('Original Server')).toBeInTheDocument();
    });

    // Eventually new data appears
    await waitFor(
      () => {
        expect(screen.getByText('Filtered Server')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
