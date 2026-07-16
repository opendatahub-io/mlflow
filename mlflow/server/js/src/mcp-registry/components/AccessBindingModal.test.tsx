import { describe, it, expect } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { testRoute, TestRouter } from '../../common/utils/RoutingTestUtils';
import { setupServer } from '../../common/utils/setup-msw';
import { AccessBindingModal } from './AccessBindingModal';
import {
  createMockMCPAccessBinding,
  createMockMCPServer,
  createMockMCPServerVersion,
  getMockedSearchMCPServersResponse,
  getMockedGetMCPServerResponse,
  getMockedSearchMCPServerVersionsResponse,
} from '../test-utils';

const noop = () => {};

const mockServers = [
  createMockMCPServer({ name: 'io.test/alpha', display_name: 'Alpha' }),
  createMockMCPServer({ name: 'io.test/beta', display_name: 'Beta' }),
];

const mockVersions = [
  createMockMCPServerVersion({ name: 'io.test/alpha', version: '1', status: 'active' }),
  createMockMCPServerVersion({ name: 'io.test/alpha', version: '2', status: 'draft' }),
];

const defaultHandlers = [
  getMockedSearchMCPServersResponse(mockServers),
  getMockedGetMCPServerResponse(mockServers[0]),
  getMockedSearchMCPServerVersionsResponse(mockVersions),
];

describe('AccessBindingModal', () => {
  const server = setupServer(...defaultHandlers);

  const renderModal = (props: Partial<React.ComponentProps<typeof AccessBindingModal>> = {}) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <IntlProvider locale="en">
        <TestRouter
          routes={[
            testRoute(
              <DesignSystemProvider>
                <QueryClientProvider client={queryClient}>
                  <AccessBindingModal visible onCancel={noop} {...props} />
                </QueryClientProvider>
              </DesignSystemProvider>,
              '/',
            ),
          ]}
        />
      </IntlProvider>,
    );
  };

  it('renders create mode with empty fields', () => {
    renderModal();
    expect(screen.getByText('Create access binding')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://mcp.example.com/server')).toHaveValue('');
  });

  it('renders edit mode with pre-filled data from editBinding prop', () => {
    const editBinding = createMockMCPAccessBinding({
      server_name: 'io.test/alpha',
      url: 'https://existing.example.com/mcp',
      transport_type: 'sse',
      server_version: '1',
    });
    renderModal({ editBinding });
    expect(screen.getByText('Edit access binding')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://mcp.example.com/server')).toHaveValue(
      'https://existing.example.com/mcp',
    );
  });

  it('shows URL validation error for invalid URLs', async () => {
    renderModal();
    const input = screen.getByPlaceholderText('https://mcp.example.com/server');
    await userEvent.type(input, 'not-a-url');
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByText('Enter a valid HTTP or HTTPS URL')).toBeInTheDocument();
    });
  });

  it('accepts valid HTTPS URL without showing validation error', async () => {
    renderModal();
    const input = screen.getByPlaceholderText('https://mcp.example.com/server');
    await userEvent.type(input, 'https://valid.example.com/mcp');
    await waitFor(() => {
      expect(screen.queryByText('Enter a valid HTTP or HTTPS URL')).not.toBeInTheDocument();
    });
  });

  it('save button disabled when form is invalid (empty URL, no server)', () => {
    renderModal();
    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toBeDisabled();
  });

  it('server dropdown hidden when lockedServer is set', () => {
    renderModal({ lockedServer: 'io.test/alpha' });
    expect(screen.getByText('io.test/alpha')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Select an MCP server')).not.toBeInTheDocument();
  });
});
