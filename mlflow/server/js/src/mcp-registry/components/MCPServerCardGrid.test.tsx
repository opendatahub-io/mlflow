import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { testRoute, TestRouter } from '../../common/utils/RoutingTestUtils';
import { MCPServerCardGrid } from './MCPServerCardGrid';
import { createMockMCPServer } from '../test-utils';

const renderGrid = (props: React.ComponentProps<typeof MCPServerCardGrid>) =>
  render(
    <IntlProvider locale="en">
      <TestRouter
        routes={[
          testRoute(
            <DesignSystemProvider>
              <MCPServerCardGrid {...props} />
            </DesignSystemProvider>,
            '/',
          ),
        ]}
      />
    </IntlProvider>,
  );

describe('MCPServerCardGrid', () => {
  it('renders loading spinner when isLoading is true', () => {
    renderGrid({ isLoading: true });
    expect(screen.getByText('Loading servers...')).toBeInTheDocument();
  });

  it('renders "No servers found" when filtered and no results', () => {
    renderGrid({ servers: [], isFiltered: true });
    expect(screen.getByText('No servers found')).toBeInTheDocument();
  });

  it('renders nothing when no servers and not filtered', () => {
    const { container } = renderGrid({ servers: [] });
    expect(container.firstChild).toBeNull();
  });

  it('renders a card for each server', () => {
    const servers = [
      createMockMCPServer({ name: 'server-a', display_name: 'Server A' }),
      createMockMCPServer({ name: 'server-b', display_name: 'Server B' }),
      createMockMCPServer({ name: 'server-c', display_name: 'Server C' }),
    ];
    renderGrid({ servers });
    expect(screen.getByText('Server A')).toBeInTheDocument();
    expect(screen.getByText('Server B')).toBeInTheDocument();
    expect(screen.getByText('Server C')).toBeInTheDocument();
  });

  it('does not render loading spinner when servers are present', () => {
    renderGrid({ servers: [createMockMCPServer()], isLoading: false });
    expect(screen.queryByText('Loading servers...')).not.toBeInTheDocument();
  });
});
