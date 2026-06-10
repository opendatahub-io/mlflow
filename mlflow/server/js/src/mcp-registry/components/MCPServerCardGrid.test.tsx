import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { testRoute, TestRouter } from '../../common/utils/RoutingTestUtils';
import { setupServer } from '../../common/utils/setup-msw';
import { MCPServerCardGrid } from './MCPServerCardGrid';
import { createMockMCPServer, getMockedGetLatestMCPServerVersionResponse } from '../test-utils';

const noop = () => {};

const defaultPaginationProps = {
  hasNextPage: false,
  hasPreviousPage: false,
  onNextPage: noop,
  onPreviousPage: noop,
};

const renderGrid = (props: React.ComponentProps<typeof MCPServerCardGrid>) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <IntlProvider locale="en">
      <TestRouter
        routes={[
          testRoute(
            <DesignSystemProvider>
              <QueryClientProvider client={queryClient}>
                <MCPServerCardGrid {...props} />
              </QueryClientProvider>
            </DesignSystemProvider>,
            '/',
          ),
        ]}
      />
    </IntlProvider>,
  );
};

describe('MCPServerCardGrid', () => {
  setupServer(getMockedGetLatestMCPServerVersionResponse());

  it('renders loading spinner when isLoading is true', () => {
    renderGrid({ ...defaultPaginationProps, isLoading: true });
    expect(screen.getByText('Loading servers...')).toBeInTheDocument();
  });

  it('renders "No servers found" when filtered and no results', () => {
    renderGrid({ ...defaultPaginationProps, servers: [], isFiltered: true });
    expect(screen.getByText('No servers found')).toBeInTheDocument();
  });

  it('renders nothing when no servers and not filtered', () => {
    const { container } = renderGrid({ ...defaultPaginationProps, servers: [] });
    expect(container.firstChild).toBeNull();
  });

  it('renders a card for each server', () => {
    const servers = [
      createMockMCPServer({ name: 'server-a', display_name: 'Server A' }),
      createMockMCPServer({ name: 'server-b', display_name: 'Server B' }),
      createMockMCPServer({ name: 'server-c', display_name: 'Server C' }),
    ];
    renderGrid({ ...defaultPaginationProps, servers });
    expect(screen.getByText('Server A')).toBeInTheDocument();
    expect(screen.getByText('Server B')).toBeInTheDocument();
    expect(screen.getByText('Server C')).toBeInTheDocument();
  });

  it('does not render loading spinner when servers are present', () => {
    renderGrid({ ...defaultPaginationProps, servers: [createMockMCPServer()], isLoading: false });
    expect(screen.queryByText('Loading servers...')).not.toBeInTheDocument();
  });

  it('renders pagination controls when servers are present', () => {
    const servers = [createMockMCPServer()];
    renderGrid({ ...defaultPaginationProps, servers, hasNextPage: true });
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Previous')).toBeInTheDocument();
  });

  it('calls onNextPage when Next is clicked', () => {
    const onNextPage = jest.fn();
    const servers = [createMockMCPServer()];
    renderGrid({ ...defaultPaginationProps, servers, hasNextPage: true, onNextPage });
    screen.getByText('Next').click();
    expect(onNextPage).toHaveBeenCalledTimes(1);
  });
});
